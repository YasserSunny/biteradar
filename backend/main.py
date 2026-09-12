import os
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from dotenv import load_dotenv
import googlemaps
from google import genai
from google.genai import types

load_dotenv()

app = FastAPI(title="biteradar API")

# Allow CORS for Next.js development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

gmaps = googlemaps.Client(key=GOOGLE_MAPS_API_KEY) if GOOGLE_MAPS_API_KEY else None
ai_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

class SearchRequest(BaseModel):
    dish_name: str
    location: str

class RestaurantResult(BaseModel):
    id: str
    name: str
    rating: float
    reason: str
    lat: float
    lng: float

@app.post("/api/search", response_model=List[RestaurantResult])
def search_dish(request: SearchRequest):
    if not gmaps or not ai_client:
        print("Missing API Keys, returning mock data.")
        return get_mock_results(request.dish_name)

    try:
        # 1. Geocode the location to get lat/lng
        geocode_result = gmaps.geocode(request.location)
        if not geocode_result:
            raise HTTPException(status_code=404, detail="Location not found")
            
        loc = geocode_result[0]['geometry']['location']
        
        # 2. Search for restaurants near the location with the dish name
        places_result = gmaps.places(
            query=f"restaurant serving {request.dish_name} in {request.location}",
            location=(loc['lat'], loc['lng']),
            radius=5000
        )
        
        candidates = places_result.get('results', [])[:5] # Take top 5 to save API cost
        
        if not candidates:
            return []

        # 3. Fetch details (reviews) for each candidate
        restaurant_data = []
        for place in candidates:
            place_id = place['place_id']
            # Fetch reviews
            details = gmaps.place(place_id, fields=['name', 'rating', 'review', 'geometry'])
            res = details.get('result', {})
            
            reviews = [r.get('text') for r in res.get('reviews', []) if r.get('text')]
            
            restaurant_data.append({
                "id": place_id,
                "name": res.get('name', 'Unknown'),
                "rating": res.get('rating', 0.0),
                "lat": res.get('geometry', {}).get('location', {}).get('lat', 0),
                "lng": res.get('geometry', {}).get('location', {}).get('lng', 0),
                "reviews": reviews
            })
            
        # 4. Use Gemini to rank and generate reasons
        prompt = f"I am building a restaurant recommendation app. The user is craving: '{request.dish_name}'.\n"
        prompt += "Here are the candidate restaurants and their latest Google Maps reviews:\n\n"
        
        for idx, r in enumerate(restaurant_data):
            prompt += f"[{idx}] {r['name']} (Rating: {r['rating']})\n"
            prompt += f"Reviews: {' | '.join(r['reviews'])}\n\n"
            
        prompt += """
Please analyze these reviews specifically looking for mentions of the dish the user is craving. 
Return your response as a JSON array of objects.
Each object must have:
- "index": the integer index of the restaurant from the list above.
- "reason": A short 1-2 sentence convincing reason why this restaurant is good for this specific dish, based on the reviews. If the reviews don't mention the dish, make a general recommendation based on the restaurant's quality.

Rank the array in order of best recommendation first.
"""
        response = ai_client.models.generate_content(
            model='gemini-3.6-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            )
        )
        
        llm_results = json.loads(response.text)
        
        # 5. Format the final output
        final_results = []
        for item in llm_results:
            idx = item.get("index")
            if idx is not None and 0 <= idx < len(restaurant_data):
                r_data = restaurant_data[idx]
                final_results.append(
                    RestaurantResult(
                        id=r_data["id"],
                        name=r_data["name"],
                        rating=r_data["rating"],
                        reason=item.get("reason", "Highly recommended based on reviews."),
                        lat=r_data["lat"],
                        lng=r_data["lng"]
                    )
                )
                
        return final_results

    except Exception as e:
        print(f"Error during API calls: {e}")
        # Fallback to mock on error
        return get_mock_results(request.dish_name)


def get_mock_results(dish_name: str) -> List[RestaurantResult]:
    return [
        RestaurantResult(
            id="mock_1",
            name="Mock Sushi Nakazawa",
            rating=4.8,
            reason=f"Highly rated for their {dish_name}. Reviewers frequently mention the incredible flavor and freshness.",
            lat=40.7316,
            lng=-74.0048
        ),
        RestaurantResult(
            id="mock_2",
            name="Mock Sugarfish",
            rating=4.7,
            reason=f"Popular spot for {dish_name}. Known for warm rice and melt-in-your-mouth texture.",
            lat=40.7388,
            lng=-73.9902
        )
    ]
