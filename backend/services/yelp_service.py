from typing import Dict, Any, List
import requests
from config import YELP_API_KEY
from logger import get_logger

logger = get_logger("yelp_service")

def fetch_yelp_details_and_reviews(name: str, lat: float, lng: float) -> Dict[str, Any]:
    """Search for a matching business on Yelp and fetch reviews/categories via GraphQL safely."""
    result: Dict[str, Any] = {
        "price": None,
        "categories": [],
        "reviews": []
    }
    
    if not YELP_API_KEY:
        logger.debug("Yelp API key missing; skipping Yelp enrichment.")
        return result

    try:
        headers = {"Authorization": f"Bearer {YELP_API_KEY}"}
        search_url = "https://api.yelp.com/v3/businesses/search"
        params = {"term": name, "latitude": lat, "longitude": lng, "limit": 1}
        
        resp = requests.get(search_url, headers=headers, params=params, timeout=5.0)
        if resp.status_code != 200:
            logger.warning(f"Yelp search failed for '{name}' (HTTP {resp.status_code}): {resp.text[:200]}")
            return result

        y_res = resp.json()
        businesses = y_res.get("businesses", [])
        if not businesses:
            logger.info(f"No Yelp business match found for '{name}' near ({lat}, {lng})")
            return result

        yelp_id = businesses[0]["id"]
        logger.info(f"Yelp matched '{name}' -> business ID '{yelp_id}'")

        # Use GraphQL query for reviews
        graphql_url = "https://api.yelp.com/v3/graphql"
        gql_headers = {
            "Authorization": f"Bearer {YELP_API_KEY}",
            "Content-Type": "application/graphql"
        }
        # Escape quotes in yelp_id for GraphQL safety
        safe_yelp_id = yelp_id.replace('"', '\\"')
        query = '{ business(id: "' + safe_yelp_id + '") { price categories { title } reviews { text rating user { name } } } }'
        
        gql_resp = requests.post(graphql_url, headers=gql_headers, data=query, timeout=5.0)
        if gql_resp.status_code != 200:
            logger.warning(f"Yelp GraphQL failed for '{yelp_id}' (HTTP {gql_resp.status_code})")
            return result

        yr_res = gql_resp.json()
        if "errors" in yr_res:
            logger.warning(f"Yelp GraphQL errors for '{yelp_id}': {yr_res['errors']}")

        business_data = yr_res.get("data", {}).get("business") or {}
        result["price"] = business_data.get("price")
        result["categories"] = [c.get("title") for c in business_data.get("categories", []) if c.get("title")]

        for r in business_data.get("reviews", []):
            text = r.get("text")
            if text:
                result["reviews"].append({
                    "text": text,
                    "rating": float(r.get("rating", 0) or 0),
                    "author_name": r.get("user", {}).get("name", "Yelp User")
                })

        logger.info(f"Yelp enrichment succeeded for '{name}' ({len(result['reviews'])} review(s) fetched)")

    except requests.exceptions.Timeout:
        logger.warning(f"Yelp request timed out for '{name}' - continuing without Yelp data.")
    except Exception as e:
        logger.warning(f"Non-critical Yelp fetch error for '{name}': {e}")

    return result
