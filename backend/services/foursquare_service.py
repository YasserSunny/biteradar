from typing import Dict, Any, List
import requests
from config import FOURSQUARE_API_KEY
from logger import get_logger

logger = get_logger("foursquare_service")

# Process-level circuit breaker: if API key is rejected with 401/403, stop calling Foursquare
_foursquare_auth_invalid = False

def fetch_foursquare_tips(name: str, lat: float, lng: float) -> Dict[str, Any]:
    """
    Search for a matching place on Foursquare Places API v3 and fetch diner tips.
    Returns a dictionary containing fsq_id, tips list, and categories.
    Fails silently and gracefully if FOURSQUARE_API_KEY is missing, invalid, or times out.
    """
    global _foursquare_auth_invalid

    result: Dict[str, Any] = {
        "fsq_id": None,
        "categories": [],
        "tips": []
    }

    if not FOURSQUARE_API_KEY or _foursquare_auth_invalid:
        return result

    headers = {
        "Accept": "application/json",
        "Authorization": FOURSQUARE_API_KEY.strip()
    }

    try:
        # 1. Search candidate by name and location
        search_url = "https://api.foursquare.com/v3/places/search"
        search_params = {
            "query": name,
            "ll": f"{lat},{lng}",
            "radius": 600,
            "limit": 1
        }

        resp = requests.get(search_url, headers=headers, params=search_params, timeout=2.5)
        if resp.status_code in (401, 403):
            _foursquare_auth_invalid = True
            logger.warning(
                f"Foursquare API key rejected (HTTP {resp.status_code}): {resp.text[:120]}. "
                "Note: Foursquare API v3 keys typically start with 'fsq3'. "
                "Skipping remaining Foursquare queries for this session."
            )
            return result
        elif resp.status_code != 200:
            logger.warning(f"Foursquare search failed for '{name}' (HTTP {resp.status_code}): {resp.text[:150]}")
            return result

        data = resp.json()
        results = data.get("results", [])
        if not results:
            logger.info(f"No Foursquare match found for '{name}' near ({lat}, {lng})")
            return result

        place = results[0]
        fsq_id = place.get("fsq_id")
        if not fsq_id:
            return result

        result["fsq_id"] = fsq_id
        result["categories"] = [c.get("name") for c in place.get("categories", []) if c.get("name")]

        # 2. Fetch tips for matched place
        tips_url = f"https://api.foursquare.com/v3/places/{fsq_id}/tips"
        tips_params = {"limit": 5, "sort": "POPULAR"}

        tips_resp = requests.get(tips_url, headers=headers, params=tips_params, timeout=4.0)
        if tips_resp.status_code == 200:
            raw_tips = tips_resp.json()
            if isinstance(raw_tips, list):
                for tip in raw_tips:
                    text = tip.get("text")
                    if text:
                        result["tips"].append({
                            "text": text.strip(),
                            "created_at": tip.get("created_at")
                        })
                logger.info(f"Foursquare enrichment succeeded for '{name}' ({len(result['tips'])} tip(s) fetched)")
        else:
            logger.warning(f"Foursquare tips fetch failed for fsq_id '{fsq_id}' (HTTP {tips_resp.status_code})")

    except requests.exceptions.Timeout:
        logger.warning(f"Foursquare request timed out for '{name}' - continuing without Foursquare data.")
    except Exception as e:
        logger.warning(f"Non-critical Foursquare fetch error for '{name}': {e}")

    return result
