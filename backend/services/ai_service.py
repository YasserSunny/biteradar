import re
import json
import math
from typing import List, Dict, Any
from google.genai import types
from config import ai_client
from logger import get_logger

logger = get_logger("ai_service")

def _generate_fallback_ranking(dish_name: str, restaurant_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """
    Fallback ranking heuristic when Gemini is unreachable, quota-exhausted, or returns invalid JSON.
    Ranks by popularity score = rating * log10(total_reviews + 10).
    Extracts a quote mentioning the dish if found in reviews.
    """
    logger.info(f"Applying intelligent fallback ranking for {len(restaurant_data)} candidate(s)")
    
    scored_candidates = []
    for idx, r in enumerate(restaurant_data):
        rating = float(r.get("rating", 0.0) or 0.0)
        reviews_count = int(r.get("total_reviews", 0) or 0)
        score = rating * math.log10(max(reviews_count, 1) + 10)

        # Look for any customer review or tip that mentions the dish
        matching_quote = ""
        dish_lower = dish_name.lower().strip()
        all_candidate_snippets = r.get("foursquare_tips", []) + r.get("reviews", [])
        for snippet in all_candidate_snippets:
            if dish_lower in snippet.lower():
                # Extract sentence or first 140-160 chars
                matching_quote = snippet[:160].strip()
                break

        reason = (
            f"Highly rated local favorite ({rating}★ across {reviews_count:,} reviews) with consistent quality."
            if not matching_quote
            else f"Customer reviews specifically highlight this spot for {dish_name}."
        )

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

def rank_restaurants_with_gemini(dish_name: str, restaurant_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Synthesize reviews, diner tips, and amenities to rank candidate restaurants using Gemini 3.6 Flash, with automatic fallback."""
    if not restaurant_data:
        return []

    if not ai_client:
        logger.warning("Gemini AI client not initialized (missing GEMINI_API_KEY). Using fallback ranking.")
        return _generate_fallback_ranking(dish_name, restaurant_data)

    try:
        prompt = f"I am building a restaurant recommendation app. The user is craving: '{dish_name}'.\n"
        prompt += "Here are the candidate restaurants, verified community tags, Foursquare diner tips, and latest reviews:\n\n"
        
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
When ranking the restaurants, consider both the relevance of the diner tips and reviews to the dish, AND the overall popularity and reliability of the restaurant (i.e., prioritize restaurants that have a high rating supported by a large number of total reviews over those with very few reviews).

Return your response as a JSON array of objects.
Each object must have:
- "index": the integer index of the restaurant from the list above.
- "reason": A short 1-2 sentence convincing reason why this restaurant is good for this specific dish, citing details from the diner tips, reviews, or overall quality.
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
            # Attempt to extract JSON array using regex
            match = re.search(r'\[.*\]', raw_text, re.DOTALL)
            if match:
                parsed = json.loads(match.group(0))
                if isinstance(parsed, list) and len(parsed) > 0:
                    logger.info("Parsed Gemini output using regex fallback")
                    return parsed

        logger.warning(f"Gemini response could not be parsed as a JSON list. Raw text: {raw_text[:200]}")
        return _generate_fallback_ranking(dish_name, restaurant_data)

    except Exception as e:
        logger.error(f"Gemini generation error: {e}. Executing graceful fallback.", exc_info=True)
        return _generate_fallback_ranking(dish_name, restaurant_data)
