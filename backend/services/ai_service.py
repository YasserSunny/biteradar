import re
import json
import math
from typing import List, Dict, Any, Optional
from google.genai import types
from config import ai_client
from logger import get_logger

logger = get_logger("ai_service")

def _generate_fallback_ranking(
    dish_name: str,
    restaurant_data: List[Dict[str, Any]],
    dietary_filters: Optional[List[str]] = None,
    price_tier: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Fallback ranking heuristic when Gemini is unreachable, quota-exhausted, or returns invalid JSON.
    Ranks by popularity score = rating * log10(total_reviews + 10), with boosts for matching dietary filters & price tiers.
    Extracts a quote mentioning the dish if found in reviews.
    """
    logger.info(f"Applying intelligent fallback ranking for {len(restaurant_data)} candidate(s) (dietary={dietary_filters}, price={price_tier})")
    
    scored_candidates = []
    dietary_lower = [d.lower().strip() for d in (dietary_filters or [])]

    for idx, r in enumerate(restaurant_data):
        rating = float(r.get("rating", 0.0) or 0.0)
        reviews_count = int(r.get("total_reviews", 0) or 0)
        score = rating * math.log10(max(reviews_count, 1) + 10)

        # Dietary preference boost
        cand_dietary = [t.lower() for t in (r.get("dietary_tags") or [])]
        all_candidate_snippets = r.get("foursquare_tips", []) + r.get("reviews", [])
        snippets_combined = " ".join(all_candidate_snippets).lower()

        dietary_matches = []
        for df in dietary_lower:
            if any(df in tag for tag in cand_dietary) or (df in snippets_combined):
                dietary_matches.append(df.capitalize())
                score += 3.0  # Significant score boost for dietary compliance

        # Price tier match boost
        if price_tier and r.get("price_level") == price_tier:
            score += 1.5

        # Look for any customer review or tip that mentions the dish
        matching_quote = ""
        dish_lower = dish_name.lower().strip()
        for snippet in all_candidate_snippets:
            if dish_lower in snippet.lower():
                matching_quote = snippet[:160].strip()
                break

        if dietary_matches:
            reason = f"Verified {', '.join(dietary_matches)} options available. Highly rated ({rating}★, {reviews_count:,} reviews) with strong community acclaim for {dish_name}."
        elif matching_quote:
            reason = f"Customer reviews specifically highlight this spot for {dish_name} ({rating}★ across {reviews_count:,} reviews)."
        else:
            reason = f"Highly rated local favorite ({rating}★ across {reviews_count:,} reviews) with consistent quality."

        scored_candidates.append({
            "index": idx,
            "score": score,
            "reason": reason,
            "helpful_quote": matching_quote
        })

    # Sort descending by calculated score
    scored_candidates.sort(key=lambda x: x["score"], reverse=True)

    return [
        {
            "index": c["index"],
            "reason": c["reason"],
            "helpful_quote": c["helpful_quote"]
        }
        for c in scored_candidates
    ]

def rank_restaurants_with_gemini(
    dish_name: str,
    restaurant_data: List[Dict[str, Any]],
    dietary_filters: Optional[List[str]] = None,
    price_tier: Optional[str] = None
) -> List[Dict[str, Any]]:
    """Synthesize reviews, diner tips, and amenities to rank candidate restaurants using Gemini 3.6 Flash, with automatic fallback."""
    if not restaurant_data:
        return []

    if not ai_client:
        logger.warning("Gemini AI client not initialized (missing GEMINI_API_KEY). Using fallback ranking.")
        return _generate_fallback_ranking(dish_name, restaurant_data, dietary_filters, price_tier)

    try:
        prompt = f"I am building a restaurant recommendation app. The user is craving: '{dish_name}'.\n"
        if dietary_filters:
            prompt += f"IMPORTANT USER DIETARY RESTRICTIONS: {', '.join(dietary_filters)}. Strictly prioritize spots that accommodate these requirements and highlight them in the reason.\n"
        if price_tier:
            prompt += f"USER TARGET PRICE TIER: {price_tier}.\n"

        prompt += "\nHere are the candidate restaurants, verified community tags, Foursquare diner tips, and latest reviews:\n\n"
        
        for idx, r in enumerate(restaurant_data):
            price_info = f"Price: {r['price_level']}" if r.get('price_level') else ""
            dish_price_info = f"Dish Price: {r.get('dish_price')}" if r.get('dish_price') else ""
            combined_price = ", ".join(filter(None, [price_info, dish_price_info]))
            prompt += f"[{idx}] {r['name']} (Rating: {r['rating']} based on {r['total_reviews']} reviews{', ' + combined_price if combined_price else ''})\n"
            if r.get('summary'):
                prompt += f"Context: {r['summary']}\n"
            if r.get('dietary_tags') or r.get('amenities'):
                badges = (r.get('dietary_tags') or []) + (r.get('amenities') or [])
                prompt += f"Verified Amenities & Dietary: {', '.join(badges)}\n"
            if r.get('foursquare_tips'):
                prompt += f"Foursquare Diner Tips: {' | '.join(r.get('foursquare_tips', []))}\n"
            prompt += f"Customer Reviews: {' | '.join(r.get('reviews', []))}\n\n"
            
        prompt += """
Please analyze these customer reviews and Foursquare diner tips specifically looking for mentions of the dish the user is craving. 
When ranking the restaurants, consider:
1. Relevance to the dish requested and any specified dietary preferences / price tiers.
2. Overall popularity and reliability (prioritizing high ratings supported by substantial review counts).

Return your response as a JSON array of objects.
Each object must have:
- "index": the integer index of the restaurant from the list above.
- "reason": A short 1-2 sentence convincing reason why this restaurant is good for this specific dish and how it matches user criteria.
- "helpful_quote": Exact quote snippet extracted directly from the customer reviews or Foursquare diner tips mentioning the dish. Leave empty if none found.

Rank the array in order of best recommendation first.
"""
        logger.info(f"Sending prompt to Gemini 3.6 Flash for dish: '{dish_name}' with {len(restaurant_data)} candidates")

        response = ai_client.models.generate_content(
            model='gemini-3.6-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            )
        )

        raw_text = response.text or ""
        
        # Parse JSON safely, handling possible markdown fences or stray tokens
        try:
            parsed = json.loads(raw_text)
            if isinstance(parsed, list) and len(parsed) > 0:
                logger.info(f"Gemini successfully ranked {len(parsed)} restaurant(s)")
                return parsed
        except json.JSONDecodeError:
            match = re.search(r'\[.*\]', raw_text, re.DOTALL)
            if match:
                parsed = json.loads(match.group(0))
                if isinstance(parsed, list) and len(parsed) > 0:
                    logger.info("Parsed Gemini output using regex fallback")
                    return parsed

        logger.warning(f"Gemini response could not be parsed as a JSON list. Raw text: {raw_text[:200]}")
        return _generate_fallback_ranking(dish_name, restaurant_data, dietary_filters, price_tier)

    except Exception as e:
        logger.error(f"Gemini generation error: {e}. Executing graceful fallback.", exc_info=True)
        return _generate_fallback_ranking(dish_name, restaurant_data, dietary_filters, price_tier)


def _generate_chat_fallback(
    dish_name: str,
    location: str,
    recommendations: List[Dict[str, Any]],
    user_message: str
) -> Dict[str, Any]:
    """Graceful fallback answering follow-up foodie questions based on recommendation attributes."""
    if not recommendations:
        return {
            "response": "I don't have any restaurant recommendations loaded yet for this search. Try searching for a dish first!",
            "cited_restaurants": []
        }

    msg_lower = user_message.lower()
    if "cheap" in msg_lower or "budget" in msg_lower or "price" in msg_lower:
        sorted_by_price = sorted(recommendations, key=lambda x: len(x.get("price_level") or "$$$$"))
        cheapest = sorted_by_price[0]
        name = cheapest.get("name", "the top spot")
        dish_price = cheapest.get("dish_price") or cheapest.get("price_level") or "affordable"
        return {
            "response": f"For the best value, check out **{name}** ({dish_price}). It offers great portions at an approachable price point without compromising on quality!",
            "cited_restaurants": [name]
        }
    elif "outdoor" in msg_lower or "patio" in msg_lower or "seating" in msg_lower:
        patio_spots = [r for r in recommendations if any("outdoor" in str(a).lower() or "patio" in str(a).lower() for a in r.get("amenities", []))]
        if patio_spots:
            names = [p.get("name") for p in patio_spots]
            return {
                "response": f"If you're looking for outdoor dining, **{', '.join(names)}** features patio / outdoor seating!",
                "cited_restaurants": names
            }

    top = recommendations[0]
    top_name = top.get("name", "our #1 pick")
    return {
        "response": f"Based on local ratings and diner reviews, **{top_name}** ({top.get('rating', 4.5)}★) is our standout recommendation for {dish_name} in {location}! {top.get('reason', '')}",
        "cited_restaurants": [top_name]
    }

def answer_dish_chat(
    dish_name: str,
    location: str,
    recommendations: List[Dict[str, Any]],
    user_message: str,
    history: Optional[List[Dict[str, str]]] = None
) -> Dict[str, Any]:
    """
    Answer user follow-up questions about the recommended spots using Gemini 3.6 Flash,
    grounded directly in the restaurant attributes, reviews, prices, and amenities.
    """
    if not recommendations:
        return {
            "response": "I don't have any restaurant recommendations loaded yet for this search. Try searching for a dish first!",
            "cited_restaurants": []
        }

    rec_names = [r.get("name", "") for r in recommendations if r.get("name")]

    if not ai_client:
        logger.warning("Gemini client unavailable for chat. Using heuristic fallback response.")
        return _generate_chat_fallback(dish_name, location, recommendations, user_message)

    try:
        system_context = f"You are BiteRadar's friendly, knowledgeable AI Foodie Concierge. The user searched for '{dish_name}' in '{location}'.\n"
        system_context += "Here are the recommended spots currently presented to the user:\n\n"
        
        for idx, r in enumerate(recommendations):
            price_info = f"Price: {r.get('price_level')}" if r.get('price_level') else ""
            dish_price = f"Dish Price: {r.get('dish_price')}" if r.get('dish_price') else ""
            diet = f"Dietary: {', '.join(r.get('dietary_tags', []))}" if r.get('dietary_tags') else ""
            amen = f"Amenities: {', '.join(r.get('amenities', []))}" if r.get('amenities') else ""
            quote = f"Customer Quote: \"{r.get('helpful_quote')}\"" if r.get('helpful_quote') else ""
            meta = " | ".join(filter(None, [price_info, dish_price, diet, amen]))
            system_context += f"- **{r.get('name')}** ({r.get('rating')}★, {r.get('total_reviews', 0)} reviews)\n"
            if meta:
                system_context += f"  Attributes: {meta}\n"
            if r.get('reason'):
                system_context += f"  Why it's great: {r.get('reason')}\n"
            if quote:
                system_context += f"  {quote}\n"

        system_context += """
Instructions:
- Answer the user's inquiry conversationally, warmly, and concisely (2-4 sentences).
- Ground your answers strictly in the provided recommendations above.
- If asked about dietary accommodations, atmosphere, reservations, or price, cite the relevant restaurant(s).
- Return your response as a JSON object:
  {
    "response": "your formatted markdown response",
    "cited_restaurants": ["Exact Restaurant Name 1", "Exact Restaurant Name 2"]
  }
"""
        history_formatted = ""
        if history:
            history_formatted = "\nRecent Conversation:\n"
            for h in history[-4:]:
                sender = h.get("sender", "user")
                text = h.get("text", "")
                history_formatted += f"{sender.capitalize()}: {text}\n"

        prompt = f"{system_context}\n{history_formatted}\nUser Inquiry: {user_message}\n"
        logger.info(f"Submitting chat request to Gemini 3.6 Flash for dish: '{dish_name}'")

        res = ai_client.models.generate_content(
            model='gemini-3.6-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            )
        )
        raw_text = res.text or ""
        try:
            parsed = json.loads(raw_text)
            if isinstance(parsed, dict) and "response" in parsed:
                return parsed
        except json.JSONDecodeError:
            match = re.search(r'\{.*\}', raw_text, re.DOTALL)
            if match:
                parsed = json.loads(match.group(0))
                if isinstance(parsed, dict) and "response" in parsed:
                    return parsed

        return {
            "response": raw_text.strip() or f"**{recommendations[0].get('name')}** is an excellent choice for {dish_name}!",
            "cited_restaurants": [r for r in rec_names if r.lower() in raw_text.lower()]
        }

    except Exception as e:
        logger.error(f"Error in answer_dish_chat: {e}. Executing graceful fallback.", exc_info=True)
        return _generate_chat_fallback(dish_name, location, recommendations, user_message)


