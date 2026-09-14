from typing import Dict, Any, Optional
import requests
from config import DOCUMENU_API_KEY
from logger import get_logger

logger = get_logger("menu_service")

def estimate_price_from_level(price_level: Optional[str]) -> Optional[str]:
    """Provide estimated dish pricing bracket based on restaurant price tier."""
    if not price_level:
        return None
    cleaned = price_level.strip()
    if cleaned == "$":
        return "~$10 - $14"
    elif cleaned == "$$":
        return "~$15 - $22"
    elif cleaned == "$$$":
        return "~$25 - $40"
    elif cleaned == "$$$$":
        return "~$45+"
    return None

def fetch_dish_pricing_and_menu(
    dish_name: str,
    restaurant_name: str,
    lat: float,
    lng: float,
    price_level: Optional[str] = None
) -> Dict[str, Any]:
    """
    Fetch itemized dish pricing and menu descriptions from Documenu (if DOCUMENU_API_KEY is configured),
    with intelligent fallback to price-bracket estimates based on restaurant price level.
    """
    result: Dict[str, Any] = {
        "dish_price": estimate_price_from_level(price_level),
        "menu_item_name": None,
        "menu_description": None
    }

    if not DOCUMENU_API_KEY:
        logger.debug("Documenu API key not configured; using price-bracket estimation.")
        return result

    try:
        url = "https://api.documenu.com/v2/restaurants/search/geo"
        headers = {
            "X-API-KEY": DOCUMENU_API_KEY.strip(),
            "Accept": "application/json"
        }
        params = {
            "lat": lat,
            "lon": lng,
            "distance": 1,
            "search": restaurant_name
        }

        resp = requests.get(url, headers=headers, params=params, timeout=3.5)
        if resp.status_code != 200:
            logger.debug(f"Documenu returned {resp.status_code} for '{restaurant_name}'")
            return result

        data = resp.json()
        restaurants = data.get("data", [])
        if not restaurants:
            return result

        doc_rest = restaurants[0]
        # Look through menu sections for a matching dish item
        dish_lower = dish_name.lower().strip()
        for menu in doc_rest.get("menus", []):
            for section in menu.get("menu_sections", []):
                for item in section.get("menu_items", []):
                    item_name = item.get("name", "")
                    if dish_lower in item_name.lower():
                        price = item.get("price")
                        formatted_price = f"${price:.2f}" if isinstance(price, (int, float)) else str(price or "")
                        if formatted_price and not formatted_price.startswith("$"):
                            formatted_price = f"${formatted_price}"

                        result["dish_price"] = formatted_price or result["dish_price"]
                        result["menu_item_name"] = item_name
                        result["menu_description"] = item.get("description")
                        logger.info(f"Documenu found exact menu match for '{dish_name}': {formatted_price}")
                        return result

    except requests.exceptions.Timeout:
        logger.debug(f"Documenu request timed out for '{restaurant_name}' - using estimate.")
    except Exception as e:
        logger.debug(f"Non-critical Documenu fetch error for '{restaurant_name}': {e}")

    return result
