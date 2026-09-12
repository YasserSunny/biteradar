from typing import Dict, Any, List
import requests
from config import YELP_API_KEY

def fetch_yelp_details_and_reviews(name: str, lat: float, lng: float) -> Dict[str, Any]:
    """Search for a matching business on Yelp and fetch reviews/categories via GraphQL."""
    result: Dict[str, Any] = {
        "price": None,
        "categories": [],
        "reviews": []
    }
    
    if not YELP_API_KEY:
        return result

    try:
        headers = {"Authorization": f"Bearer {YELP_API_KEY}"}
        search_url = "https://api.yelp.com/v3/businesses/search"
        params = {"term": name, "latitude": lat, "longitude": lng, "limit": 1}
        y_res = requests.get(search_url, headers=headers, params=params).json()

        if not y_res.get("businesses"):
            return result

        yelp_id = y_res["businesses"][0]["id"]
        print(f"Yelp matched {name} to {yelp_id}")

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
    except Exception as e:
        print("Yelp fetch error:", e)

    return result
