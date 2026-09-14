import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import models
from database import Base, get_db
from main import app
from services.ai_service import _generate_fallback_ranking, answer_dish_chat

class TestPhase5CoreEnhancements(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool
        )
        cls.TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)
        Base.metadata.create_all(bind=cls.engine)

    def setUp(self):
        self.db = self.TestingSessionLocal()
        def override_get_db():
            try:
                yield self.db
            finally:
                pass
        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

    def tearDown(self):
        self.db.rollback()
        for table in reversed(Base.metadata.sorted_tables):
            self.db.execute(table.delete())
        self.db.commit()
        self.db.close()
        app.dependency_overrides.clear()

    # -------------------------------------------------------------
    # 1. Dishes Catalog & Trending Endpoint
    # -------------------------------------------------------------
    @patch("routers.search.gmaps")
    @patch("routers.search.geocode_location")
    @patch("routers.search.search_candidate_restaurants")
    @patch("routers.search.fetch_place_details")
    @patch("routers.search.rank_restaurants_with_gemini")
    def test_dishes_catalog_creation_and_search_count(
        self,
        mock_rank,
        mock_details,
        mock_search_places,
        mock_geocode,
        mock_gmaps
    ):
        """Verify searching a dish creates/increments a Dish catalog item and links to query."""
        mock_geocode.return_value = {"lat": 37.77, "lng": -122.41}
        mock_search_places.return_value = [{"place_id": "sf_taco_1", "name": "Taqueria San Francisco"}]
        mock_details.return_value = {
            "name": "Taqueria San Francisco",
            "rating": 4.7,
            "user_ratings_total": 900,
            "geometry": {"location": {"lat": 37.77, "lng": -122.41}},
            "photos": [{"photo_reference": "sf_taco_photo_ref_123"}]
        }
        mock_rank.return_value = [{"index": 0, "reason": "Best carnitas tacos in SF."}]

        # First search
        res1 = self.client.post("/api/search", json={
            "dish_name": "Carnitas Tacos",
            "location": "San Francisco",
            "dietary_filters": ["Gluten-Free"]
        })
        self.assertEqual(res1.status_code, 200)
        data1 = res1.json()
        self.assertEqual(len(data1), 1)
        self.assertEqual(data1[0]["photo_url"], "/api/places/photo/sf_taco_photo_ref_123")
        self.assertIn("ubereats.com", data1[0]["delivery_url"])
        self.assertIn("opentable.com", data1[0]["reservation_url"])

        # Verify Dish catalog item
        dish = self.db.query(models.Dish).filter(models.Dish.normalized_name == "carnitas tacos").first()
        self.assertIsNotNone(dish)
        self.assertEqual(dish.search_count, 1)
        self.assertEqual(dish.primary_photo_url, "/api/places/photo/sf_taco_photo_ref_123")

        # Verify SearchQuery links to dish
        query_row = self.db.query(models.SearchQuery).filter(models.SearchQuery.dish_name == "Carnitas Tacos").first()
        self.assertIsNotNone(query_row)
        self.assertEqual(query_row.dish_id, dish.id)

        # Second search for same dish in different city -> increments search_count
        mock_geocode.return_value = {"lat": 34.05, "lng": -118.25}
        mock_search_places.return_value = [{"place_id": "la_taco_1", "name": "Guisados"}]
        mock_details.return_value = {
            "name": "Guisados",
            "rating": 4.6,
            "user_ratings_total": 1200,
            "geometry": {"location": {"lat": 34.05, "lng": -118.25}}
        }
        mock_rank.return_value = [{"index": 0, "reason": "Handmade corn tortillas."}]

        res2 = self.client.post("/api/search", json={
            "dish_name": "Carnitas Tacos",
            "location": "Los Angeles"
        })
        self.assertEqual(res2.status_code, 200)

        # Re-fetch dish and verify search count incremented to 2
        dish_refreshed = self.db.query(models.Dish).filter(models.Dish.normalized_name == "carnitas tacos").first()
        self.assertEqual(dish_refreshed.search_count, 2)

    def test_get_trending_dishes(self):
        """Verify GET /api/dishes/trending returns dishes ordered by popularity."""
        d1 = models.Dish(name="Tonkotsu Ramen", normalized_name="tonkotsu ramen", search_count=15)
        d2 = models.Dish(name="Neapolitan Pizza", normalized_name="neapolitan pizza", search_count=25)
        d3 = models.Dish(name="Pad Thai", normalized_name="pad thai", search_count=8)
        self.db.add_all([d1, d2, d3])
        self.db.commit()

        res = self.client.get("/api/dishes/trending?limit=2")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]["name"], "Neapolitan Pizza")
        self.assertEqual(data[0]["search_count"], 25)
        self.assertEqual(data[1]["name"], "Tonkotsu Ramen")
        self.assertEqual(data[1]["search_count"], 15)

    # -------------------------------------------------------------
    # 2. Dietary & Price Filtering in Fallback Ranking
    # -------------------------------------------------------------
    def test_fallback_ranking_with_dietary_and_price_boost(self):
        """Verify fallback ranking boosts spots matching dietary tags and price tiers."""
        candidates = [
            {
                "name": "Standard Diner",
                "rating": 4.5,
                "total_reviews": 500,
                "price_level": "$$$",
                "dietary_tags": [],
                "reviews": ["Good burger and fries."]
            },
            {
                "name": "Green Garden Cafe",
                "rating": 4.4,
                "total_reviews": 300,
                "price_level": "$$",
                "dietary_tags": ["Vegan Friendly", "Gluten-Free"],
                "reviews": ["Delicious vegan bowl and plant-based dishes."]
            }
        ]

        # Without filters, Standard Diner with more reviews ranks first
        standard_rank = _generate_fallback_ranking("Bowl", candidates)
        self.assertEqual(standard_rank[0]["index"], 0)

        # With Vegan filter and $$ price tier, Green Garden Cafe is boosted to #1
        filtered_rank = _generate_fallback_ranking(
            "Bowl",
            candidates,
            dietary_filters=["Vegan"],
            price_tier="$$"
        )
        self.assertEqual(filtered_rank[0]["index"], 1)
        self.assertIn("Vegan", filtered_rank[0]["reason"])

    # -------------------------------------------------------------
    # 3. Google Places Photo Proxy Endpoint
    # -------------------------------------------------------------
    @patch("routers.search.GOOGLE_MAPS_API_KEY", "fake-test-key")
    @patch("routers.search.requests.get")
    def test_places_photo_proxy_success(self, mock_requests_get):
        """Verify /api/places/photo/{ref} proxies image content with 30-day cache headers."""
        fake_response = MagicMock()
        fake_response.status_code = 200
        fake_response.content = b"\xff\xd8\xff\xe0\x00\x10JFIF"  # JPEG magic bytes
        fake_response.headers = {"Content-Type": "image/jpeg"}
        mock_requests_get.return_value = fake_response

        res = self.client.get("/api/places/photo/sample_photo_reference_abc123")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.headers.get("content-type"), "image/jpeg")
        self.assertIn("max-age=2592000", res.headers.get("cache-control", ""))
        self.assertEqual(res.content, b"\xff\xd8\xff\xe0\x00\x10JFIF")

    @patch("routers.search.GOOGLE_MAPS_API_KEY", "fake-test-key")
    @patch("routers.search.requests.get")
    def test_places_photo_proxy_google_error(self, mock_requests_get):
        """Verify photo proxy forwards Google error codes cleanly."""
        fake_response = MagicMock()
        fake_response.status_code = 403
        mock_requests_get.return_value = fake_response

        res = self.client.get("/api/places/photo/invalid_reference")
        self.assertEqual(res.status_code, 403)

    # -------------------------------------------------------------
    # 4. Interactive AI Dish Chat Concierge Endpoint
    # -------------------------------------------------------------
    def test_chat_concierge_query_not_found(self):
        """Verify /api/chat returns 404 for nonexistent query session."""
        res = self.client.post("/api/chat", json={
            "query_id": 9999,
            "message": "Which place is cheapest?"
        })
        self.assertEqual(res.status_code, 404)

    def test_chat_concierge_empty_message(self):
        """Verify /api/chat rejects empty queries with 400."""
        res = self.client.post("/api/chat", json={
            "query_id": 1,
            "message": "   "
        })
        self.assertEqual(res.status_code, 400)

    def test_chat_concierge_grounded_fallback(self):
        """Verify /api/chat provides grounded recommendations and citations via fallback."""
        # Create SearchQuery with 2 recommendations in DB
        query = models.SearchQuery(dish_name="Birria Tacos", location="Austin")
        self.db.add(query)
        self.db.commit()
        self.db.refresh(query)

        rec1 = models.Recommendation(
            query_id=query.id,
            place_id="atx_birria_1",
            name="Taqueria El Cuñado",
            rating=4.8,
            total_reviews=600,
            price_level="$",
            dish_price="$11.50",
            reason="Crispy golden birria shells with rich consome.",
            lat=30.26,
            lng=-97.74
        )
        rec2 = models.Recommendation(
            query_id=query.id,
            place_id="atx_birria_2",
            name="Austin Mexican Kitchen",
            rating=4.6,
            total_reviews=450,
            price_level="$$",
            dish_price="$16.00",
            amenities='["Outdoor Seating", "Cocktail Bar"]',
            reason="Upscale birria tacos with patio seating.",
            lat=30.27,
            lng=-97.75
        )
        self.db.add_all([rec1, rec2])
        self.db.commit()

        # Query about price / budget
        res_budget = self.client.post("/api/chat", json={
            "query_id": query.id,
            "message": "Which spot has the best budget-friendly price?"
        })
        self.assertEqual(res_budget.status_code, 200)
        data_budget = res_budget.json()
        self.assertIn("Taqueria El Cuñado", data_budget["response"])
        self.assertIn("Taqueria El Cuñado", data_budget["cited_restaurants"])

        # Query about outdoor seating / patio
        res_patio = self.client.post("/api/chat", json={
            "query_id": query.id,
            "message": "Do any of these spots have outdoor patio seating?"
        })
        self.assertEqual(res_patio.status_code, 200)
        data_patio = res_patio.json()
        self.assertIn("Austin Mexican Kitchen", data_patio["response"])
        self.assertIn("Austin Mexican Kitchen", data_patio["cited_restaurants"])

if __name__ == "__main__":
    unittest.main()
