from typing import Optional, List, Dict, Any
from config import gmaps
from logger import get_logger

logger = get_logger("places_service")

def geocode_location(location: str) -> Optional[Dict[str, float]]:
    """Geocode a location string into lat/lng dictionary safely."""
    if not gmaps:
        logger.warning("Google Maps client is not initialized (missing API key).")
        return None
    try:
        geocode_result = gmaps.geocode(location)
        if not geocode_result or not geocode_result[0].get('geometry', {}).get('location'):
            logger.warning(f"Geocoding returned no valid results for location: '{location}'")
            return None
        loc = geocode_result[0]['geometry']['location']
        logger.info(f"Geocoded '{location}' -> lat: {loc.get('lat')}, lng: {loc.get('lng')}")
        return {"lat": loc['lat'], "lng": loc['lng']}
    except Exception as e:
        logger.error(f"Error geocoding location '{location}': {e}", exc_info=True)
        return None

def search_candidate_restaurants(dish_name: str, location: str, lat: float, lng: float, limit: int = 5) -> List[Dict[str, Any]]:
    """Search for candidate restaurants serving a dish near the specified coordinates safely."""
    if not gmaps:
        logger.warning("Google Maps client is not initialized.")
        return []
    try:
        query = f"restaurant serving {dish_name} in {location}"
        logger.info(f"Searching Google Places with query: '{query}' near ({lat}, {lng})")
        places_result = gmaps.places(
            query=query,
            location=(lat, lng),
            radius=5000
        )
        candidates = places_result.get('results', [])[:limit]
        logger.info(f"Google Places returned {len(candidates)} candidate(s)")
        return candidates
    except Exception as e:
        logger.error(f"Error searching Google Places for '{dish_name}' in '{location}': {e}", exc_info=True)
        return []

def fetch_place_details(place_id: str) -> Dict[str, Any]:
    """Fetch detailed place information including ratings, editorial summary, hours, website, and reviews safely."""
    if not gmaps:
        return {}
    try:
        details = gmaps.place(
            place_id,
            fields=[
                'name',
                'rating',
                'user_ratings_total',
                'review',
                'geometry',
                'price_level',
                'editorial_summary',
                'opening_hours',
                'website'
            ]
        )
        return details.get('result', {})
    except Exception as e:
        logger.error(f"Error fetching place details for place_id '{place_id}': {e}", exc_info=True)
        return {}
