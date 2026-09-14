import math
from typing import Optional, List, Dict, Any
from config import gmaps
from logger import get_logger

logger = get_logger("places_service")

# Maximum distance allowed between search target and candidate restaurant (~37 miles)
MAX_DISTANCE_KM = 60.0

def haversine_distance_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle distance between two coordinates in kilometers."""
    r = 6371.0  # Earth radius in km
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = math.sin(dlat / 2.0) ** 2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return r * c

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
        formatted = geocode_result[0].get('formatted_address', '')
        logger.info(f"Geocoded '{location}' -> '{formatted}' (lat: {loc.get('lat')}, lng: {loc.get('lng')})")
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
        query = f"restaurant serving {dish_name} in {location}" if location else f"restaurant serving {dish_name}"
        logger.info(f"Searching Google Places with query: '{query}' near ({lat}, {lng})")
        places_result = gmaps.places(
            query=query,
            location=(lat, lng),
            radius=5000
        )
        raw_candidates = places_result.get('results', [])
        candidates = []
        for place in raw_candidates:
            geom = place.get('geometry', {}).get('location', {})
            cand_lat = geom.get('lat')
            cand_lng = geom.get('lng')
            if cand_lat is not None and cand_lng is not None:
                dist_km = haversine_distance_km(lat, lng, cand_lat, cand_lng)
                if dist_km > MAX_DISTANCE_KM:
                    logger.warning(
                        f"Filtered out distant candidate '{place.get('name')}' ({dist_km:.1f} km away from target {lat}, {lng}, max {MAX_DISTANCE_KM} km)"
                    )
                    continue
            candidates.append(place)
            if len(candidates) >= limit:
                break

        logger.info(f"Google Places returned {len(candidates)} valid candidate(s) within {MAX_DISTANCE_KM} km radius")
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
