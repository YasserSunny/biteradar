import os
import json
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv
import googlemaps
from google import genai
from google.genai import types

from sqlalchemy.orm import Session
from sqlalchemy import func
import models
from database import engine, get_db

# Create DB tables
models.Base.metadata.create_all(bind=engine)

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
    id: str  # This is now our database recommendation ID, used for feedback
    place_id: str
    name: str
    rating: float
    reason: str
    lat: float
    lng: float
    helpful: Optional[bool] = None

class FeedbackRequest(BaseModel):
    recommendation_id: int
    helpful: bool

@app.post("/api/search", response_model=List[RestaurantResult])
def search_dish(request: SearchRequest, db: Session = Depends(get_db)):
    if not gmaps or not ai_client:
        print("Missing API Keys, returning mock data.")
        return []

    try:
        # Check cache (case insensitive exact match)
        existing_query = db.query(models.SearchQuery).filter(
            func.lower(models.SearchQuery.dish_name) == request.dish_name.lower(),
            func.lower(models.SearchQuery.location) == request.location.lower()
        ).first()

        if existing_query and existing_query.recommendations:
            print(f"Cache hit for {request.dish_name} in {request.location}")
            return [
                RestaurantResult(
                    id=str(r.id),
                    place_id=r.place_id,
                    name=r.name,
                    rating=r.rating,
                    reason=r.reason,
                    lat=r.lat,
                    lng=r.lng,
                    helpful=r.helpful
                )
                for r in existing_query.recommendations
            ]
            
        print(f"Cache miss for {request.dish_name} in {request.location}. Calling APIs...")

        # Save new search query to DB
        db_query = models.SearchQuery(dish_name=request.dish_name, location=request.location)
        db.add(db_query)
        db.commit()
        db.refresh(db_query)

        # 1. Geocode the location to get lat/lng
        geocode_result = gmaps.geocode(request.location)
        if not geocode_result:
            raise HTTPException(status_code=404, detail="Location not found")
            
        loc = geocode_result[0]['geometry']['location']
        
        # 2. Search for restaurants
        places_result = gmaps.places(
            query=f"restaurant serving {request.dish_name} in {request.location}",
            location=(loc['lat'], loc['lng']),
            radius=5000
        )
        
        candidates = places_result.get('results', [])[:5]
        
        if not candidates:
            return []

        # 3. Fetch reviews
        restaurant_data = []
        for place in candidates:
            place_id = place['place_id']
            details = gmaps.place(place_id, fields=['name', 'rating', 'review', 'geometry'])
            res = details.get('result', {})
            
            reviews = [r.get('text') for r in res.get('reviews', []) if r.get('text')]
            
            restaurant_data.append({
                "place_id": place_id,
                "name": res.get('name', 'Unknown'),
                "rating": res.get('rating', 0.0),
                "lat": res.get('geometry', {}).get('location', {}).get('lat', 0),
                "lng": res.get('geometry', {}).get('location', {}).get('lng', 0),
                "reviews": reviews
            })
            
        # 4. Gemini Ranking
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
        
        # 5. Format and Save to DB
        final_results = []
        for item in llm_results:
            idx = item.get("index")
            if idx is not None and 0 <= idx < len(restaurant_data):
                r_data = restaurant_data[idx]
                
                # Save recommendation to DB
                db_rec = models.Recommendation(
                    query_id=db_query.id,
                    place_id=r_data["place_id"],
                    name=r_data["name"],
                    rating=r_data["rating"],
                    reason=item.get("reason", "Highly recommended based on reviews."),
                    lat=r_data["lat"],
                    lng=r_data["lng"]
                )
                db.add(db_rec)
                db.commit()
                db.refresh(db_rec)
                
                final_results.append(
                    RestaurantResult(
                        id=str(db_rec.id),  # Use the DB ID for frontend feedback
                        place_id=r_data["place_id"],
                        name=r_data["name"],
                        rating=r_data["rating"],
                        reason=db_rec.reason,
                        lat=r_data["lat"],
                        lng=r_data["lng"],
                        helpful=None
                    )
                )
                
        return final_results

    except Exception as e:
        print(f"Error during API calls: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/feedback")
def submit_feedback(request: FeedbackRequest, db: Session = Depends(get_db)):
    rec = db.query(models.Recommendation).filter(models.Recommendation.id == request.recommendation_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recommendation not found")
    
    rec.helpful = request.helpful
    db.commit()
    return {"status": "success", "helpful": rec.helpful}
