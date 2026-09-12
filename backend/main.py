import os
import json
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from dotenv import load_dotenv
import googlemaps
import requests
from google import genai
from google.genai import types

from sqlalchemy.orm import Session
from sqlalchemy import func
import models
from database import engine, get_db

# Create DB tables
models.Base.metadata.create_all(bind=engine)

load_dotenv(override=True)

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
YELP_API_KEY = os.getenv("YELP_API_KEY")
print("LOADED YELP KEY:", YELP_API_KEY[:10] if YELP_API_KEY else "NONE")

gmaps = googlemaps.Client(key=GOOGLE_MAPS_API_KEY) if GOOGLE_MAPS_API_KEY else None
ai_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None

class SearchRequest(BaseModel):
    dish_name: str
    location: str
    user_id: Optional[str] = None

class ProfileRequest(BaseModel):
    user_id: str
    name: str
    preferred_cuisines: List[str] = []
    favorite_dishes: List[str] = []

class ProfileResponse(BaseModel):
    user_id: str
    name: str
    preferred_cuisines: List[str] = []
    favorite_dishes: List[str] = []

class SearchHistoryItem(BaseModel):
    id: int
    query_id: int
    dish_name: str
    location: str
    created_at: str

class RestaurantResult(BaseModel):
    id: str  # This is now our database recommendation ID, used for feedback
    place_id: str
    name: str
    rating: float
    total_reviews: int
    price_level: Optional[str] = None
    summary: Optional[str] = None
    open_now: Optional[bool] = None
    reason: str
    helpful_quote: Optional[str] = None
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
            if request.user_id:
                history_entry = models.SearchHistory(user_id=request.user_id, query_id=existing_query.id)
                db.add(history_entry)
                db.commit()
            return [
                RestaurantResult(
                    id=str(r.id),
                    place_id=r.place_id,
                    name=r.name,
                    rating=r.rating,
                    total_reviews=r.total_reviews,
                    price_level=r.price_level,
                    summary=r.summary,
                    open_now=r.open_now,
                    reason=r.reason,
                    helpful_quote=r.helpful_quote,
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

        if request.user_id:
            history_entry = models.SearchHistory(user_id=request.user_id, query_id=db_query.id)
            db.add(history_entry)
            db.commit()

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

        # 3. Fetch reviews from Google and Yelp
        restaurant_data = []
        for place in candidates:
            place_id = place['place_id']
            
            # --- GOOGLE ---
            details = gmaps.place(place_id, fields=['name', 'rating', 'user_ratings_total', 'review', 'geometry', 'price_level', 'editorial_summary', 'opening_hours'])
            res = details.get('result', {})
            
            name = res.get('name', 'Unknown')
            lat = res.get('geometry', {}).get('location', {}).get('lat', 0)
            lng = res.get('geometry', {}).get('location', {}).get('lng', 0)
            rating = res.get('rating', 0.0)
            total_reviews = res.get('user_ratings_total', 0)
            open_now = res.get('opening_hours', {}).get('open_now')
            
            g_price = res.get('price_level')
            price_str = "$" * g_price if g_price else ""
            summary_text = res.get('editorial_summary', {}).get('overview', '')
            
            # Save or get Place
            db_place = db.query(models.Place).filter(models.Place.id == place_id).first()
            if not db_place:
                db_place = models.Place(id=place_id, name=name, lat=lat, lng=lng)
                db.add(db_place)
                db.commit()
            
            google_reviews = res.get('reviews', [])
            all_review_texts = []
            
            for r in google_reviews:
                text = r.get('text')
                if text:
                    all_review_texts.append(text)
                    exists = db.query(models.Review).filter(models.Review.place_id == place_id, models.Review.text == text).first()
                    if not exists:
                        db.add(models.Review(
                            place_id=place_id,
                            source="google",
                            author_name=r.get('author_name', 'Google User'),
                            rating=float(r.get('rating', 0)),
                            text=text
                        ))
            
            # --- YELP ---
            if YELP_API_KEY:
                try:
                    headers = {"Authorization": f"Bearer {YELP_API_KEY}"}
                    search_url = "https://api.yelp.com/v3/businesses/search"
                    params = {"term": name, "latitude": lat, "longitude": lng, "limit": 1}
                    y_res = requests.get(search_url, headers=headers, params=params).json()
                    
                    if y_res.get("businesses"):
                        yelp_id = y_res["businesses"][0]["id"]
                        print(f"Yelp matched {name} to {yelp_id}")
                        
                        # Use GraphQL for reviews since Developer Beta was required
                        graphql_url = "https://api.yelp.com/v3/graphql"
                        gql_headers = {
                            "Authorization": f"Bearer {YELP_API_KEY}",
                            "Content-Type": "application/graphql"
                        }
                        query = '{ business(id: "' + yelp_id + '") { price categories { title } reviews { text rating user { name } } } }'
                        
                        yr_res = requests.post(graphql_url, headers=gql_headers, data=query).json()
                        
                        if "errors" in yr_res:
                            print("Yelp GraphQL Error:", yr_res["errors"])
                        
                        business_data = yr_res.get("data", {}).get("business") or {}
                        
                        # Extract price and categories
                        y_price = business_data.get("price")
                        if y_price and not price_str:
                            price_str = y_price
                        
                        categories = [c.get("title") for c in business_data.get("categories", []) if c.get("title")]
                        if categories:
                            cat_str = "Categories: " + ", ".join(categories)
                            summary_text = f"{summary_text} | {cat_str}" if summary_text else cat_str
                            
                        for r in business_data.get("reviews", []):
                            text = r.get("text")
                            if text:
                                all_review_texts.append(text)
                                exists = db.query(models.Review).filter(models.Review.place_id == place_id, models.Review.text == text).first()
                                if not exists:
                                    db.add(models.Review(
                                        place_id=place_id,
                                        source="yelp",
                                        author_name=r.get("user", {}).get("name", "Yelp User"),
                                        rating=float(r.get("rating", 0) or 0),
                                        text=text
                                    ))
                except Exception as e:
                    print("Yelp fetch error:", e)
            
            db.commit()
            
            restaurant_data.append({
                "place_id": place_id,
                "name": name,
                "rating": rating,
                "total_reviews": total_reviews,
                "price_level": price_str,
                "summary": summary_text,
                "open_now": open_now,
                "lat": lat,
                "lng": lng,
                "reviews": all_review_texts
            })
            
        # 4. Gemini Ranking
        prompt = f"I am building a restaurant recommendation app. The user is craving: '{request.dish_name}'.\n"
        prompt += "Here are the candidate restaurants and their latest Google Maps & Yelp reviews:\n\n"
        
        for idx, r in enumerate(restaurant_data):
            prompt += f"[{idx}] {r['name']} (Rating: {r['rating']} based on {r['total_reviews']} reviews, Price: {r['price_level']})\n"
            if r['summary']:
                prompt += f"Context: {r['summary']}\n"
            prompt += f"Reviews: {' | '.join(r['reviews'])}\n\n"
            
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
                    total_reviews=r_data["total_reviews"],
                    price_level=r_data.get("price_level"),
                    summary=r_data.get("summary"),
                    open_now=r_data.get("open_now"),
                    reason=item.get("reason", "Highly recommended based on reviews."),
                    helpful_quote=item.get("helpful_quote"),
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
                        total_reviews=r_data["total_reviews"],
                        price_level=db_rec.price_level,
                        summary=db_rec.summary,
                        open_now=db_rec.open_now,
                        reason=db_rec.reason,
                        helpful_quote=db_rec.helpful_quote,
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

@app.get("/api/profile/{user_id}", response_model=ProfileResponse)
def get_profile(user_id: str, db: Session = Depends(get_db)):
    profile = db.query(models.UserProfile).filter(models.UserProfile.user_id == user_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    try:
        cuisines = json.loads(profile.preferred_cuisines) if profile.preferred_cuisines else []
    except Exception:
        cuisines = []
    try:
        dishes = json.loads(profile.favorite_dishes) if profile.favorite_dishes else []
    except Exception:
        dishes = []
    return ProfileResponse(
        user_id=profile.user_id,
        name=profile.name,
        preferred_cuisines=cuisines,
        favorite_dishes=dishes
    )

@app.post("/api/profile", response_model=ProfileResponse)
def save_profile(req: ProfileRequest, db: Session = Depends(get_db)):
    profile = db.query(models.UserProfile).filter(models.UserProfile.user_id == req.user_id).first()
    if not profile:
        profile = models.UserProfile(
            user_id=req.user_id,
            name=req.name,
            preferred_cuisines=json.dumps(req.preferred_cuisines),
            favorite_dishes=json.dumps(req.favorite_dishes)
        )
        db.add(profile)
    else:
        profile.name = req.name
        profile.preferred_cuisines = json.dumps(req.preferred_cuisines)
        profile.favorite_dishes = json.dumps(req.favorite_dishes)
    db.commit()
    db.refresh(profile)
    return ProfileResponse(
        user_id=profile.user_id,
        name=profile.name,
        preferred_cuisines=req.preferred_cuisines,
        favorite_dishes=req.favorite_dishes
    )

@app.get("/api/history/{user_id}", response_model=List[SearchHistoryItem])
def get_history(user_id: str, db: Session = Depends(get_db)):
    histories = db.query(models.SearchHistory).filter(
        models.SearchHistory.user_id == user_id
    ).order_by(models.SearchHistory.created_at.desc()).all()

    seen = set()
    result = []
    for h in histories:
        if not h.query:
            continue
        key = (h.query.dish_name.lower().strip(), h.query.location.lower().strip())
        if key not in seen:
            seen.add(key)
            result.append(SearchHistoryItem(
                id=h.id,
                query_id=h.query_id,
                dish_name=h.query.dish_name,
                location=h.query.location,
                created_at=h.created_at.isoformat() if h.created_at else ""
            ))
        if len(result) >= 5:
            break
    return result

@app.get("/api/queries/{query_id}/recommendations", response_model=List[RestaurantResult])
def get_query_recommendations(query_id: int, db: Session = Depends(get_db)):
    query = db.query(models.SearchQuery).filter(models.SearchQuery.id == query_id).first()
    if not query:
        raise HTTPException(status_code=404, detail="Query not found")
    return [
        RestaurantResult(
            id=str(r.id),
            place_id=r.place_id,
            name=r.name,
            rating=r.rating,
            total_reviews=r.total_reviews,
            price_level=r.price_level,
            summary=r.summary,
            open_now=r.open_now,
            reason=r.reason,
            helpful_quote=r.helpful_quote,
            lat=r.lat,
            lng=r.lng,
            helpful=r.helpful
        )
        for r in query.recommendations
    ]

