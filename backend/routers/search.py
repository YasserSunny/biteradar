from typing import List, Optional
import json
import urllib.parse
import requests
from fastapi import APIRouter, HTTPException, Depends, Response
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
import models
from schemas import SearchRequest, RestaurantResult, FeedbackRequest, DishItem
from config import gmaps, ai_client, GOOGLE_MAPS_API_KEY
from services.places_service import geocode_location, search_candidate_restaurants, fetch_place_details, get_photo_reference
from services.yelp_service import fetch_yelp_details_and_reviews
from services.foursquare_service import fetch_foursquare_tips
from services.osm_service import fetch_osm_amenities_and_dietary
from services.menu_service import fetch_dish_pricing_and_menu
from services.ai_service import rank_restaurants_with_gemini
from logger import get_logger

logger = get_logger("routers.search")

def _parse_json_list(val: Optional[str]) -> List[str]:
    """Safely decode JSON list string from database."""
    if not val:
        return []
    try:
        parsed = json.loads(val)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []

def _generate_delivery_url(restaurant_name: str, location: str) -> str:
    query = urllib.parse.quote_plus(f"{restaurant_name} {location}")
    return f"https://www.ubereats.com/search?q={query}"

def _generate_reservation_url(restaurant_name: str, location: str) -> str:
    query = urllib.parse.quote_plus(f"{restaurant_name} {location}")
    return f"https://www.opentable.com/s?term={query}"

router = APIRouter(prefix="/api", tags=["search"])

@router.post("/search", response_model=List[RestaurantResult])
def search_dish(request: SearchRequest, db: Session = Depends(get_db)):
    dish = request.dish_name.strip()
    loc_str = request.location.strip()

    if not dish:
        raise HTTPException(status_code=400, detail="dish_name cannot be empty.")
    if not loc_str:
        raise HTTPException(status_code=400, detail="location cannot be empty.")

    logger.info(f"Incoming search request: dish='{dish}', location='{loc_str}', user_id='{request.user_id}', dietary={request.dietary_filters}, price={request.price_tier}, radius={request.max_distance_km}")

    # Track / link dish in dishes catalog
    normalized_dish = dish.lower().strip()
    dish_record = db.query(models.Dish).filter(models.Dish.normalized_name == normalized_dish).first()
    if not dish_record:
        try:
            dish_record = models.Dish(
                name=dish,
                normalized_name=normalized_dish,
                search_count=1,
                dietary_attributes=json.dumps(request.dietary_filters or [])
            )
            db.add(dish_record)
            db.commit()
            db.refresh(dish_record)
        except Exception as e:
            db.rollback()
            logger.warning(f"Could not create Dish catalog item: {e}")
            dish_record = db.query(models.Dish).filter(models.Dish.normalized_name == normalized_dish).first()
    else:
        try:
            dish_record.search_count = (dish_record.search_count or 0) + 1
            dish_record.last_searched_at = func.now()
            db.commit()
            db.refresh(dish_record)
        except Exception as e:
            db.rollback()
            logger.warning(f"Could not update Dish search count: {e}")

    if not gmaps:
        logger.warning("Google Maps client is unavailable; cannot perform live search.")
        return []

    try:
        # Check cache (case insensitive exact match)
        existing_query = db.query(models.SearchQuery).filter(
            func.lower(models.SearchQuery.dish_name) == dish.lower(),
            func.lower(models.SearchQuery.location) == loc_str.lower()
        ).first()

        if existing_query and existing_query.recommendations:
            logger.info(f"Cache HIT for query_id={existing_query.id} ('{dish}' in '{loc_str}')")
            if not existing_query.dish_id and dish_record:
                try:
                    existing_query.dish_id = dish_record.id
                    db.commit()
                except Exception:
                    db.rollback()

            if request.user_id:
                try:
                    history_entry = models.SearchHistory(user_id=request.user_id, query_id=existing_query.id)
                    db.add(history_entry)
                    db.commit()
                except Exception as e:
                    db.rollback()
                    logger.warning(f"Could not record search history for cache hit: {e}")

            return [
                RestaurantResult(
                    id=str(r.id),
                    place_id=r.place_id,
                    name=r.name,
                    rating=r.rating,
                    total_reviews=r.total_reviews,
                    price_level=r.price_level,
                    dish_price=r.dish_price,
                    dietary_tags=_parse_json_list(r.dietary_tags),
                    amenities=_parse_json_list(r.amenities),
                    summary=r.summary,
                    open_now=r.open_now,
                    website=r.website,
                    reason=r.reason,
                    helpful_quote=r.helpful_quote,
                    lat=r.lat,
                    lng=r.lng,
                    helpful=r.helpful,
                    photo_url=r.photo_url,
                    delivery_url=r.delivery_url or _generate_delivery_url(r.name, loc_str),
                    reservation_url=r.reservation_url or _generate_reservation_url(r.name, loc_str),
                    query_id=existing_query.id
                )

                for r in existing_query.recommendations
            ]

        logger.info(f"Cache MISS for '{dish}' in '{loc_str}'. Calling external APIs...")

        # 1. Geocode location to get lat/lng (or use client-provided coordinates)
        if request.lat is not None and request.lng is not None:
            loc = {"lat": request.lat, "lng": request.lng}
            logger.info(f"Using client-provided coordinates for '{loc_str}': lat={loc['lat']}, lng={loc['lng']}")
        else:
            loc = geocode_location(loc_str)
            if not loc:
                logger.warning(f"Geocoding failed for location: '{loc_str}'")
                raise HTTPException(status_code=404, detail=f"Location '{loc_str}' could not be resolved.")

        # Save new search query to DB safely
        try:
            db_query = models.SearchQuery(
                dish_name=dish,
                location=loc_str,
                dish_id=dish_record.id if dish_record else None
            )
            db.add(db_query)
            db.commit()
            db.refresh(db_query)

            if request.user_id:
                history_entry = models.SearchHistory(user_id=request.user_id, query_id=db_query.id)
                db.add(history_entry)
                db.commit()
        except Exception as e:
            db.rollback()
            logger.error(f"Error persisting search query to DB: {e}", exc_info=True)
            # Create a detached fallback query instance
            db_query = models.SearchQuery(id=0, dish_name=dish, location=loc_str)

        # 2. Search candidate restaurants
        if request.max_distance_km is not None:
            candidates = search_candidate_restaurants(dish, loc_str, loc['lat'], loc['lng'], max_distance_km=request.max_distance_km)
        else:
            candidates = search_candidate_restaurants(dish, loc_str, loc['lat'], loc['lng'])
        if not candidates:
            logger.info(f"No candidate restaurants found for '{dish}' in '{loc_str}'")
            return []

        # 3. Fetch reviews and details for each candidate
        restaurant_data = []
        for place in candidates:
            try:
                place_id = place.get('place_id')
                if not place_id:
                    continue

                res = fetch_place_details(place_id)

                name = res.get('name') or place.get('name', 'Unknown')
                lat = res.get('geometry', {}).get('location', {}).get('lat', loc['lat'])
                lng = res.get('geometry', {}).get('location', {}).get('lng', loc['lng'])
                rating = float(res.get('rating') or place.get('rating', 0.0))
                total_reviews = int(res.get('user_ratings_total') or place.get('user_ratings_total', 0))
                open_now = res.get('opening_hours', {}).get('open_now')
                website = res.get('website')

                g_price = res.get('price_level')
                price_str = "$" * g_price if g_price else ""
                summary_text = res.get('editorial_summary', {}).get('overview', '')

                # Persist or update Place in DB
                try:
                    db_place = db.query(models.Place).filter(models.Place.id == place_id).first()
                    if not db_place:
                        db_place = models.Place(id=place_id, name=name, website=website, lat=lat, lng=lng)
                        db.add(db_place)
                        db.commit()
                    elif website and not db_place.website:
                        db_place.website = website
                        db.commit()
                except Exception as e:
                    db.rollback()
                    logger.warning(f"Could not persist place '{name}': {e}")

                # Google reviews
                google_reviews = res.get('reviews', [])
                all_review_texts = []

                for r in google_reviews:
                    text = r.get('text')
                    if text:
                        all_review_texts.append(text)
                        try:
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
                                db.commit()
                        except Exception:
                            db.rollback()

                # Yelp reviews & metadata
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
                        try:
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
                        except Exception:
                            db.rollback()

                # Foursquare tips & metadata
                fsq_data = fetch_foursquare_tips(name, lat, lng)
                foursquare_tips = []
                for tip in fsq_data.get("tips", []):
                    tip_text = tip.get("text")
                    if tip_text:
                        foursquare_tips.append(tip_text)
                        try:
                            exists = db.query(models.Review).filter(
                                models.Review.place_id == place_id,
                                models.Review.text == tip_text
                            ).first()
                            if not exists:
                                db.add(models.Review(
                                    place_id=place_id,
                                    source="foursquare",
                                    author_name="Foursquare Diner",
                                    rating=None,
                                    text=tip_text
                                ))
                                db.commit()
                        except Exception:
                            db.rollback()

                # OpenStreetMap community tags (dietary & amenities)
                osm_data = fetch_osm_amenities_and_dietary(lat, lng, restaurant_name=name)
                dietary_tags = osm_data.get("dietary_tags", [])
                amenities = osm_data.get("amenities", [])

                # Itemized dish pricing & menu details
                menu_data = fetch_dish_pricing_and_menu(dish, name, lat, lng, price_level=price_str)
                dish_price = menu_data.get("dish_price")

                # Photo & external booking / delivery links
                photo_ref = get_photo_reference(res) or get_photo_reference(place)
                photo_url = f"/api/places/photo/{photo_ref}" if photo_ref else None
                delivery_url = _generate_delivery_url(name, loc_str)
                reservation_url = _generate_reservation_url(name, loc_str)

                if dish_record and not dish_record.primary_photo_url and photo_url:
                    try:
                        dish_record.primary_photo_url = photo_url
                        db.commit()
                    except Exception:
                        db.rollback()

                restaurant_data.append({
                    "place_id": place_id,
                    "name": name,
                    "rating": rating,
                    "total_reviews": total_reviews,
                    "price_level": price_str,
                    "dish_price": dish_price,
                    "dietary_tags": dietary_tags,
                    "amenities": amenities,
                    "summary": summary_text,
                    "open_now": open_now,
                    "website": website,
                    "lat": lat,
                    "lng": lng,
                    "reviews": all_review_texts,
                    "foursquare_tips": foursquare_tips,
                    "photo_url": photo_url,
                    "delivery_url": delivery_url,
                    "reservation_url": reservation_url
                })
            except Exception as e:
                logger.error(f"Error processing candidate place: {e}", exc_info=True)
                continue

        if not restaurant_data:
            logger.warning("No restaurant data could be compiled from candidates.")
            return []

        # 4. Rank candidates with Gemini (or automatic popularity fallback)
        llm_results = rank_restaurants_with_gemini(
            dish,
            restaurant_data,
            dietary_filters=request.dietary_filters,
            price_tier=request.price_tier
        )

        # 5. Format and persist recommendations
        final_results = []
        for item in llm_results:
            idx = item.get("index")
            if idx is not None and 0 <= idx < len(restaurant_data):
                r_data = restaurant_data[idx]
                db_rec_id = f"{db_query.id}_{idx}"

                try:
                    db_rec = models.Recommendation(
                        query_id=db_query.id if db_query.id else None,
                        place_id=r_data["place_id"],
                        name=r_data["name"],
                        rating=r_data["rating"],
                        total_reviews=r_data["total_reviews"],
                        price_level=r_data.get("price_level"),
                        dish_price=r_data.get("dish_price"),
                        dietary_tags=json.dumps(r_data.get("dietary_tags", [])) if r_data.get("dietary_tags") else None,
                        amenities=json.dumps(r_data.get("amenities", [])) if r_data.get("amenities") else None,
                        summary=r_data.get("summary"),
                        open_now=r_data.get("open_now"),
                        website=r_data.get("website"),
                        reason=item.get("reason", "Highly recommended spot."),
                        helpful_quote=item.get("helpful_quote"),
                        lat=r_data["lat"],
                        lng=r_data["lng"],
                        photo_url=r_data.get("photo_url"),
                        delivery_url=r_data.get("delivery_url"),
                        reservation_url=r_data.get("reservation_url")
                    )
                    db.add(db_rec)
                    db.commit()
                    db.refresh(db_rec)
                    db_rec_id = str(db_rec.id)
                except Exception as e:
                    db.rollback()
                    logger.warning(f"Could not persist recommendation for '{r_data['name']}': {e}")

                final_results.append(
                    RestaurantResult(
                        id=db_rec_id,
                        place_id=r_data["place_id"],
                        name=r_data["name"],
                        rating=r_data["rating"],
                        total_reviews=r_data["total_reviews"],
                        price_level=r_data.get("price_level"),
                        dish_price=r_data.get("dish_price"),
                        dietary_tags=r_data.get("dietary_tags", []),
                        amenities=r_data.get("amenities", []),
                        summary=r_data.get("summary"),
                        open_now=r_data.get("open_now"),
                        website=r_data.get("website"),
                        reason=item.get("reason", "Highly recommended spot."),
                        helpful_quote=item.get("helpful_quote"),
                        lat=r_data["lat"],
                        lng=r_data["lng"],
                        helpful=None,
                        photo_url=r_data.get("photo_url"),
                        delivery_url=r_data.get("delivery_url"),
                        reservation_url=r_data.get("reservation_url"),
                        query_id=db_query.id if db_query and db_query.id else None
                    )
                )

        logger.info(f"Successfully returning {len(final_results)} recommendation(s) for '{dish}' in '{loc_str}'")
        return final_results

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in search_dish: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Search service encountered an unexpected error. Please try again.")

@router.post("/feedback")
def submit_feedback(request: FeedbackRequest, db: Session = Depends(get_db)):
    try:
        rec = db.query(models.Recommendation).filter(models.Recommendation.id == request.recommendation_id).first()
        if not rec:
            logger.warning(f"Feedback target recommendation {request.recommendation_id} not found.")
            raise HTTPException(status_code=404, detail="Recommendation not found")

        rec.helpful = request.helpful
        db.commit()
        logger.info(f"Feedback recorded for recommendation {request.recommendation_id}: helpful={request.helpful}")
        return {"status": "success", "helpful": rec.helpful}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error submitting feedback: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not record feedback.")

@router.get("/queries/{query_id}/recommendations", response_model=List[RestaurantResult])
def get_query_recommendations(query_id: int, db: Session = Depends(get_db)):
    try:
        query = db.query(models.SearchQuery).filter(models.SearchQuery.id == query_id).first()
        if not query:
            logger.warning(f"Query recommendations target {query_id} not found.")
            raise HTTPException(status_code=404, detail="Query not found")

        return [
            RestaurantResult(
                id=str(r.id),
                place_id=r.place_id,
                name=r.name,
                rating=r.rating,
                total_reviews=r.total_reviews,
                price_level=r.price_level,
                dish_price=r.dish_price,
                dietary_tags=_parse_json_list(r.dietary_tags),
                amenities=_parse_json_list(r.amenities),
                summary=r.summary,
                open_now=r.open_now,
                website=r.website,
                reason=r.reason,
                helpful_quote=r.helpful_quote,
                lat=r.lat,
                lng=r.lng,
                helpful=r.helpful,
                photo_url=r.photo_url,
                delivery_url=r.delivery_url or _generate_delivery_url(r.name, query.location),
                reservation_url=r.reservation_url or _generate_reservation_url(r.name, query.location),
                query_id=query.id
            )
            for r in query.recommendations
        ]

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching query recommendations for {query_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not retrieve recommendations.")

@router.get("/dishes/trending", response_model=List[DishItem])
def get_trending_dishes(limit: int = 8, db: Session = Depends(get_db)):
    """Fetch popular and trending dishes from the BiteRadar catalog."""
    try:
        dishes = db.query(models.Dish).order_by(
            models.Dish.search_count.desc(),
            models.Dish.last_searched_at.desc()
        ).limit(limit).all()

        return [
            DishItem(
                id=d.id,
                name=d.name,
                cuisine=d.cuisine,
                description=d.description,
                primary_photo_url=d.primary_photo_url,
                typical_price_range=d.typical_price_range,
                dietary_attributes=_parse_json_list(d.dietary_attributes),
                search_count=d.search_count or 1
            )
            for d in dishes
        ]
    except Exception as e:
        logger.error(f"Error fetching trending dishes: {e}", exc_info=True)
        return []

@router.get("/places/photo/{photo_reference}")
def get_place_photo(photo_reference: str):
    """
    Secure backend proxy for Google Places photos.
    Caches photos for 30 days, eliminates direct frontend API key exposure.
    """
    if not GOOGLE_MAPS_API_KEY:
        raise HTTPException(status_code=503, detail="Google Maps API Key not configured.")
    try:
        url = "https://maps.googleapis.com/maps/api/place/photo"
        params = {
            "maxwidth": 800,
            "photoreference": photo_reference,
            "key": GOOGLE_MAPS_API_KEY
        }
        resp = requests.get(url, params=params, stream=True, timeout=10)
        if resp.status_code != 200:
            logger.warning(f"Google photo proxy returned status {resp.status_code}")
            raise HTTPException(status_code=resp.status_code, detail="Could not load place photo.")

        return Response(
            content=resp.content,
            media_type=resp.headers.get("Content-Type", "image/jpeg"),
            headers={"Cache-Control": "public, max-age=2592000, immutable"}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error proxying place photo '{photo_reference}': {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to fetch photo.")

