import json
from typing import List, Dict, Any
from google.genai import types
from config import ai_client

def rank_restaurants_with_gemini(dish_name: str, restaurant_data: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Synthesize reviews and rank candidate restaurants using Gemini 2.5 Flash."""
    if not ai_client or not restaurant_data:
        return []

    prompt = f"I am building a restaurant recommendation app. The user is craving: '{dish_name}'.\n"
    prompt += "Here are the candidate restaurants and their latest Google Maps & Yelp reviews:\n\n"
    
    for idx, r in enumerate(restaurant_data):
        prompt += f"[{idx}] {r['name']} (Rating: {r['rating']} based on {r['total_reviews']} reviews, Price: {r['price_level']})\n"
        if r.get('summary'):
            prompt += f"Context: {r['summary']}\n"
        prompt += f"Reviews: {' | '.join(r.get('reviews', []))}\n\n"
        
    prompt += """
Please analyze these reviews specifically looking for mentions of the dish the user is craving. 
When ranking the restaurants, consider both the relevance of the reviews to the dish, AND the overall popularity and reliability of the restaurant (i.e., prioritize restaurants that have a high rating supported by a large number of total reviews over those with very few reviews).

Return your response as a JSON array of objects.
Each object must have:
- "index": the integer index of the restaurant from the list above.
- "reason": A short 1-2 sentence convincing reason why this restaurant is good for this specific dish, based on the reviews and overall popularity. If the reviews don't mention the dish, make a general recommendation based on the restaurant's quality.
- "helpful_quote": Exact quote snippet extracted directly from the reviews mentioning the dish. Leave empty if none found.

Rank the array in order of best recommendation first.
"""

    response = ai_client.models.generate_content(
        model='gemini-2.5-flash',
        contents=prompt,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
        )
    )

    try:
        return json.loads(response.text)
    except Exception as e:
        print("Error parsing Gemini response:", e)
        return []
