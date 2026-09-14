import unittest
from unittest.mock import patch, MagicMock
import requests

from services.foursquare_service import fetch_foursquare_tips
from services.osm_service import fetch_osm_amenities_and_dietary
from services.menu_service import fetch_dish_pricing_and_menu, estimate_price_from_level

class TestDataSources(unittest.TestCase):

    # ------------------ Foursquare Tests ------------------
    @patch("services.foursquare_service.FOURSQUARE_API_KEY", "")
    def test_foursquare_missing_key(self):
        """When FOURSQUARE_API_KEY is missing, it should return empty result without error."""
        res = fetch_foursquare_tips("Ippudo", 40.73, -73.99)
        self.assertEqual(res["fsq_id"], None)
        self.assertEqual(res["tips"], [])
        self.assertEqual(res["categories"], [])

    @patch("services.foursquare_service.FOURSQUARE_API_KEY", "mock_fsq_key_123")
    @patch("services.foursquare_service.requests.get")
    def test_foursquare_success(self, mock_get):
        """When Foursquare API returns valid data, parse tips and categories."""
        # Mock search response
        search_resp = MagicMock()
        search_resp.status_code = 200
        search_resp.json.return_value = {
            "results": [{
                "fsq_id": "fsq_ippudo_123",
                "name": "Ippudo NY",
                "categories": [{"name": "Ramen Restaurant"}]
            }]
        }

        # Mock tips response
        tips_resp = MagicMock()
        tips_resp.status_code = 200
        tips_resp.json.return_value = [
            {"text": "Try the Akamaru Shinaji with extra pork belly!", "created_at": "2024-01-01"},
            {"text": "The pork buns are legendary.", "created_at": "2024-01-02"}
        ]

        mock_get.side_effect = [search_resp, tips_resp]

        res = fetch_foursquare_tips("Ippudo", 40.73, -73.99)
        self.assertEqual(res["fsq_id"], "fsq_ippudo_123")
        self.assertEqual(res["categories"], ["Ramen Restaurant"])
        self.assertEqual(len(res["tips"]), 2)
        self.assertIn("Akamaru", res["tips"][0]["text"])

    @patch("services.foursquare_service.FOURSQUARE_API_KEY", "mock_fsq_key_123")
    @patch("services.foursquare_service.requests.get")
    def test_foursquare_timeout(self, mock_get):
        """Foursquare timeout should be handled gracefully."""
        mock_get.side_effect = requests.exceptions.Timeout("Connection timed out")
        res = fetch_foursquare_tips("Ippudo", 40.73, -73.99)
        self.assertEqual(res["tips"], [])

    # ------------------ OpenStreetMap (OSM) Tests ------------------
    @patch("services.osm_service.requests.post")
    def test_osm_dietary_and_amenities_parsing(self, mock_post):
        """Test that Overpass API response parses dietary and amenity tags."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "elements": [
                {
                    "type": "node",
                    "tags": {
                        "name": "Falafel King",
                        "amenity": "restaurant",
                        "diet:halal": "yes",
                        "diet:vegan": "yes",
                        "outdoor_seating": "yes",
                        "wheelchair": "yes"
                    }
                }
            ]
        }
        mock_post.return_value = mock_resp

        res = fetch_osm_amenities_and_dietary(40.71, -74.00, restaurant_name="Falafel King")
        self.assertIn("Halal", res["dietary_tags"])
        self.assertIn("Vegan Friendly", res["dietary_tags"])
        self.assertIn("Outdoor Seating", res["amenities"])
        self.assertIn("Wheelchair Accessible", res["amenities"])

    @patch("services.osm_service.requests.post")
    def test_osm_timeout_handled(self, mock_post):
        """Test OSM timeout handled gracefully."""
        mock_post.side_effect = requests.exceptions.Timeout("Overpass timeout")
        res = fetch_osm_amenities_and_dietary(40.71, -74.00)
        self.assertEqual(res["dietary_tags"], [])
        self.assertEqual(res["amenities"], [])

    # ------------------ Menu & Pricing Tests ------------------
    def test_estimate_price_from_level(self):
        self.assertEqual(estimate_price_from_level("$"), "~$10 - $14")
        self.assertEqual(estimate_price_from_level("$$"), "~$15 - $22")
        self.assertEqual(estimate_price_from_level("$$$"), "~$25 - $40")
        self.assertEqual(estimate_price_from_level("$$$$"), "~$45+")
        self.assertIsNone(estimate_price_from_level(None))

    @patch("services.menu_service.DOCUMENU_API_KEY", "mock_documenu_key")
    @patch("services.menu_service.requests.get")
    def test_documenu_item_match(self, mock_get):
        """Test Documenu exact item price match."""
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "data": [
                {
                    "restaurant_name": "Taco Corner",
                    "menus": [
                        {
                            "menu_sections": [
                                {
                                    "menu_items": [
                                        {"name": "Carne Asada Tacos", "price": 14.50, "description": "Three grilled steak tacos with cilantro and onions"}
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ]
        }
        mock_get.return_value = mock_resp

        res = fetch_dish_pricing_and_menu("carne asada tacos", "Taco Corner", 33.74, -84.38, price_level="$$")
        self.assertEqual(res["dish_price"], "$14.50")
        self.assertEqual(res["menu_item_name"], "Carne Asada Tacos")
        self.assertIn("grilled steak", res["menu_description"])

    @patch("services.menu_service.DOCUMENU_API_KEY", "")
    def test_documenu_fallback_to_level_estimate(self):
        """When Documenu key is absent, use price_level estimate."""
        res = fetch_dish_pricing_and_menu("ramen", "Ramen Spot", 40.71, -74.00, price_level="$$")
        self.assertEqual(res["dish_price"], "~$15 - $22")

if __name__ == "__main__":
    unittest.main()
