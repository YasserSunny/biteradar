from typing import Dict, Any, List
import requests
from config import FOURSQUARE_API_KEY
from logger import get_logger

logger = get_logger("foursquare_service")

# Process-level circuit breaker: if API key is rejected with 401/403, stop calling Foursquare
_foursquare_auth_invalid = False

def fetch_foursquare_tips(name: str, lat: float, lng: float) -> Dict[str, Any]:
    """
    Search for a matching place on Foursquare Places API and fetch diner tips.
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

    raw_key = FOURSQUARE_API_KEY.strip()
    # Foursquare Places API expects 'Bearer <token>' or raw token
    auth_header = raw_key if raw_key.lower().startswith("bearer ") else f"Bearer {raw_key}"
    headers = {
        "Accept": "application/json",
        "Authorization": auth_header,
        "X-Places-Api-Version": "2025-06-17",
        "User-Agent": "BiteRadar/1.0 (https://biteradar.fyi)"
    }

    try:
        # 1. Search candidate by name and location using modern Places API
        search_url = "https://places-api.foursquare.com/places/search"
        search_params = {
            "query": name,
            "ll": f"{lat},{lng}",
            "radius": 600,
            "limit": 1
        }

        # Use stream=True so that if the CDN drops the connection on 401/403,
        # we read the status code cleanly without crashing with ChunkedEncodingError/IncompleteRead
        resp = requests.get(search_url, headers=headers, params=search_params, stream=True, timeout=3.0)
        if resp.status_code in (401, 403):
            _foursquare_auth_invalid = True
            logger.warning(
                f"Foursquare API key rejected (HTTP {resp.status_code}). "
                "Please verify your key and project permissions in the Foursquare Developer Console. "
                "Skipping remaining Foursquare queries for this session."
            )
            return result
        elif resp.status_code != 200:
            logger.warning(f"Foursquare search failed for '{name}' (HTTP {resp.status_code})")
            return result

        data = resp.json()
        results = data.get("results", [])
        if not results:
            logger.info(f"No Foursquare match found for '{name}' near ({lat}, {lng})")
            return result

        place = results[0]
        fsq_id = place.get("fsq_place_id") or place.get("fsq_id")
        if not fsq_id:
            return result

        result["fsq_id"] = fsq_id
        result["categories"] = [c.get("name") for c in place.get("categories", []) if c.get("name")]

        # 2. Fetch tips for matched place
        tips_url = f"https://places-api.foursquare.com/places/{fsq_id}/tips"
        tips_params = {"limit": 5, "sort": "POPULAR"}

        tips_resp = requests.get(tips_url, headers=headers, params=tips_params, stream=True, timeout=4.0)
        if tips_resp.status_code == 200:
            raw_tips = tips_resp.json()
            # The API returns a list of tip objects or an object with 'results'
            tip_items = raw_tips if isinstance(raw_tips, list) else raw_tips.get("results", [])
            for tip in tip_items:
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
