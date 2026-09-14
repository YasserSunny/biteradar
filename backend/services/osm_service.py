from typing import Dict, Any, List, Optional
import requests
from logger import get_logger

logger = get_logger("osm_service")

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

def fetch_osm_amenities_and_dietary(
    lat: float, 
    lng: float, 
    restaurant_name: Optional[str] = None, 
    radius: int = 85
) -> Dict[str, Any]:
    """
    Query OpenStreetMap (Overpass API) for community-verified dietary and amenity tags
    near the restaurant coordinates (zero-key, open data).
    Returns normalized dietary_tags, amenities, and cuisine strings.
    """
    result: Dict[str, Any] = {
        "dietary_tags": [],
        "amenities": [],
        "cuisine": None
    }

    try:
        # Overpass QL query searching nodes & ways around coordinates
        query = f"""[out:json][timeout:3];
(
  node["amenity"~"restaurant|fast_food|cafe|bar"](around:{radius},{lat},{lng});
  way["amenity"~"restaurant|fast_food|cafe|bar"](around:{radius},{lat},{lng});
);
out tags;"""

        headers = {
            "User-Agent": "BiteRadar/1.0 (https://biteradar.fyi; contact@biteradar.fyi)"
        }

        resp = requests.post(
            OVERPASS_URL, 
            data={"data": query}, 
            headers=headers, 
            timeout=3.5
        )

        if resp.status_code != 200:
            logger.debug(f"Overpass API returned status {resp.status_code} near ({lat}, {lng})")
            return result

        data = resp.json()
        elements = data.get("elements", [])
        if not elements:
            return result

        # If restaurant_name is provided, attempt to find the best match by name
        target_tags = {}
        if restaurant_name:
            norm_target = restaurant_name.lower().strip()
            for el in elements:
                tags = el.get("tags", {})
                el_name = tags.get("name", "").lower().strip()
                if el_name and (norm_target in el_name or el_name in norm_target):
                    target_tags = tags
                    break

        # Fallback to closest element if no name match was found
        if not target_tags and elements:
            target_tags = elements[0].get("tags", {})

        # Extract dietary tags
        dietary: List[str] = []
        if target_tags.get("diet:vegan") in ("yes", "only"):
            dietary.append("100% Vegan" if target_tags.get("diet:vegan") == "only" else "Vegan Friendly")
        if target_tags.get("diet:vegetarian") in ("yes", "only"):
            dietary.append("Vegetarian Friendly")
        if target_tags.get("diet:halal") in ("yes", "only"):
            dietary.append("Halal")
        if target_tags.get("diet:kosher") in ("yes", "only"):
            dietary.append("Kosher")
        if target_tags.get("diet:gluten_free") in ("yes", "only"):
            dietary.append("Gluten-Free Options")

        # Extract amenities
        amenities: List[str] = []
        if target_tags.get("outdoor_seating") in ("yes", "separate"):
            amenities.append("Outdoor Seating")
        if target_tags.get("wheelchair") in ("yes", "designated"):
            amenities.append("Wheelchair Accessible")
        if target_tags.get("takeaway") == "yes":
            amenities.append("Takeout")
        if target_tags.get("delivery") == "yes":
            amenities.append("Delivery")

        cuisine = target_tags.get("cuisine")

        result["dietary_tags"] = dietary
        result["amenities"] = amenities
        result["cuisine"] = cuisine

        if dietary or amenities:
            logger.info(f"OSM matched tags near ({lat}, {lng}): dietary={dietary}, amenities={amenities}")

    except requests.exceptions.Timeout:
        logger.debug(f"Overpass request timed out near ({lat}, {lng}) - continuing gracefully.")
    except Exception as e:
        logger.debug(f"Non-critical OSM Overpass fetch error: {e}")

    return result
