from typing import List
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
import models
from schemas import SearchRequest, RestaurantResult, FeedbackRequest
from config import gmaps, ai_client
from services.places_service import geocode_location, search_candidate_restaurants, fetch_place_details
from services.yelp_service import fetch_yelp_details_and_reviews
from services.ai_service import rank_restaurants_with_gemini

router = APIRouter(prefix="/api", tags=["search"])

@router.post("/search", response_model=List[RestaurantResult])
def search_dish(request: SearchRequest, db: Session = Depends(get_db)):
    if not gmaps or not ai_client:
        print("Missing API Keys, returning empty data.")
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
                    website=r.website,
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

        # 1. Geocode location to get lat/lng
        loc = geocode_location(request.location)
        if not loc:
            raise HTTPException(status_code=404, detail="Location not found")

        # 2. Search for candidate restaurants
        candidates = search_candidate_restaurants(request.dish_name, request.location, loc['lat'], loc['lng'])
        if not candidates:
            return []

        # 3. Fetch reviews and details from Google Places and Yelp
        restaurant_data = []
        for place in candidates:
            place_id = place['place_id']
            res = fetch_place_details(place_id)

            name = res.get('name', 'Unknown')
            lat = res.get('geometry', {}).get('location', {}).get('lat', 0)
            lng = res.get('geometry', {}).get('location', {}).get('lng', 0)
            rating = res.get('rating', 0.0)
            total_reviews = res.get('user_ratings_total', 0)
            open_now = res.get('opening_hours', {}).get('open_now')
            website = res.get('website')

            g_price = res.get('price_level')
            price_str = "$" * g_price if g_price else ""
            summary_text = res.get('editorial_summary', {}).get('overview', '')

            # Save or update Place in database
            db_place = db.query(models.Place).filter(models.Place.id == place_id).first()
            if not db_place:
                db_place = models.Place(id=place_id, name=name, website=website, lat=lat, lng=lng)
                db.add(db_place)
                db.commit()
            elif website and not db_place.website:
                db_place.website = website
                db.commit()

            # Google reviews
            google_reviews = res.get('reviews', [])
            all_review_texts = []

            for r in google_reviews:
                text = r.get('text')
                if text:
                    all_review_texts.append(text)
                    exists = db.query(models.Review).filter(
                        models.Review.place_id == place_id,
                        models.Review.text == text
                    ).first()
                    if not exists:
                        db.add(models.Review(
                            place_id=place_id,
                            source="google",
                            author_name=r.get('author_name', 'Google User'),
                            rating=float(r.get('rating', 0)),
                            text=text
                        ))

            # Yelp reviews and metadata
            yelp_data = fetch_yelp_details_and_reviews(name, lat, lng)
            if yelp_data.get("price") and not price_str:
                price_str = yelp_data["price"]

            if yelp_data.get("categories"):
                cat_str = "Categories: " + ", ".join(yelp_data["categories"])
                summary_text = f"{summary_text} | {cat_str}" if summary_text else cat_str

            for yr in yelp_data.get("reviews", []):
                y_text = yr.get("text")
                if y_text:
                    all_review_texts.append(y_text)
                    exists = db.query(models.Review).filter(
                        models.Review.place_id == place_id,
                        models.Review.text == y_text
                    ).first()
                    if not exists:
                        db.add(models.Review(
                            place_id=place_id,
                            source="yelp",
                            author_name=yr.get("author_name", "Yelp User"),
                            rating=yr.get("rating", 0.0),
                            text=y_text
                        ))

            db.commit()

            restaurant_data.append({
                "place_id": place_id,
                "name": name,
                "rating": rating,
                "total_reviews": total_reviews,
                "price_level": price_str,
                "summary": summary_text,
                "open_now": open_now,
                "website": website,
                "lat": lat,
                "lng": lng,
                "reviews": all_review_texts
            })

        # 4. Gemini Ranking
        llm_results = rank_restaurants_with_gemini(request.dish_name, restaurant_data)

        # 5. Format and Save Recommendations to DB
        final_results = []
        for item in llm_results:
            idx = item.get("index")
            if idx is not None and 0 <= idx < len(restaurant_data):
                r_data = restaurant_data[idx]

                db_rec = models.Recommendation(
                    query_id=db_query.id,
                    place_id=r_data["place_id"],
                    name=r_data["name"],
                    rating=r_data["rating"],
                    total_reviews=r_data["total_reviews"],
                    price_level=r_data.get("price_level"),
                    summary=r_data.get("summary"),
                    open_now=r_data.get("open_now"),
                    website=r_data.get("website"),
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
                        id=str(db_rec.id),
                        place_id=r_data["place_id"],
                        name=r_data["name"],
                        rating=r_data["rating"],
                        total_reviews=r_data["total_reviews"],
                        price_level=db_rec.price_level,
                        summary=db_rec.summary,
                        open_now=db_rec.open_now,
                        website=db_rec.website,
                        reason=db_rec.reason,
                        helpful_quote=db_rec.helpful_quote,
                        lat=r_data["lat"],
                        lng=r_data["lng"],
                        helpful=None
                    )
                )

        return final_results

    except Exception as e:
        print(f"Error during search execution: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/feedback")
def submit_feedback(request: FeedbackRequest, db: Session = Depends(get_db)):
    rec = db.query(models.Recommendation).filter(models.Recommendation.id == request.recommendation_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail="Recommendation not found")

    rec.helpful = request.helpful
    db.commit()
    return {"status": "success", "helpful": rec.helpful}

@router.get("/queries/{query_id}/recommendations", response_model=List[RestaurantResult])
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
            website=r.website,
            reason=r.reason,
            helpful_quote=r.helpful_quote,
            lat=r.lat,
            lng=r.lng,
            helpful=r.helpful
        )
        for r in query.recommendations
    ]
