from typing import Optional, List, Dict, Any
from config import gmaps

def geocode_location(location: str) -> Optional[Dict[str, float]]:
    """Geocode a location string into lat/lng dictionary."""
    if not gmaps:
        return None
    geocode_result = gmaps.geocode(location)
    if not geocode_result:
        return None
    loc = geocode_result[0]['geometry']['location']
    return {"lat": loc['lat'], "lng": loc['lng']}

def search_candidate_restaurants(dish_name: str, location: str, lat: float, lng: float, limit: int = 5) -> List[Dict[str, Any]]:
    """Search for candidate restaurants serving a dish near the specified coordinates."""
    if not gmaps:
        return []
    places_result = gmaps.places(
        query=f"restaurant serving {dish_name} in {location}",
        location=(lat, lng),
        radius=5000
    )
    return places_result.get('results', [])[:limit]

def fetch_place_details(place_id: str) -> Dict[str, Any]:
    """Fetch detailed place information including ratings, editorial summary, hours, website, and reviews."""
    if not gmaps:
        return {}
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
