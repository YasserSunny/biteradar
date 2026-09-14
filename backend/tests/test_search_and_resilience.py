import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import models
from database import get_db
from main import app

SQLALCHEMY_DATABASE_URL = "sqlite:///:memory:"
test_engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

class TestSearchAndResilience(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        app.dependency_overrides[get_db] = override_get_db
        cls.client = TestClient(app)

    def setUp(self):
        models.Base.metadata.create_all(bind=test_engine)
        self.db = TestingSessionLocal()

    def tearDown(self):
        self.db.close()
        models.Base.metadata.drop_all(bind=test_engine)

    def test_search_validation(self):
        """Test that missing dish or location triggers 400 Bad Request."""
        res1 = self.client.post("/api/search", json={"dish_name": "", "location": "Atlanta"})
        self.assertEqual(res1.status_code, 400)

        res2 = self.client.post("/api/search", json={"dish_name": "Tacos", "location": "  "})
        self.assertEqual(res2.status_code, 400)

    def test_search_cache_hit(self):
        """Test that cached queries return immediately without external API calls."""
        # 1. Create existing search query and recommendations in DB
        query = models.SearchQuery(dish_name="Croissant", location="Paris")
        self.db.add(query)
        self.db.commit()
        self.db.refresh(query)

        rec = models.Recommendation(
            query_id=query.id,
            place_id="place_croissant_1",
            name="Du Pain et des Idees",
            rating=4.9,
            total_reviews=3500,
            price_level="$$",
            summary="Renowned Parisian bakery",
            open_now=True,
            website="http://dupainetdesidees.com",
            reason="Famous for exquisite buttery croissants.",
            helpful_quote="Best escargot pastry and croissant in Paris!",
            lat=48.871,
            lng=2.363
        )
        self.db.add(rec)
        self.db.commit()

        # 2. Search for the exact query (case-insensitive)
        payload = {"dish_name": "croissant", "location": "paris", "user_id": "paris_traveler"}
        res = self.client.post("/api/search", json=payload)
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["name"], "Du Pain et des Idees")
        self.assertEqual(data[0]["rating"], 4.9)
        self.assertEqual(data[0]["website"], "http://dupainetdesidees.com")

        # 3. Verify search history was recorded
        history = self.db.query(models.SearchHistory).filter(models.SearchHistory.user_id == "paris_traveler").all()
        self.assertEqual(len(history), 1)

    @patch("routers.search.geocode_location")
    def test_search_location_not_found(self, mock_geocode):
        """Test that invalid locations return a clean 404 response."""
        mock_geocode.return_value = None
        res = self.client.post("/api/search", json={"dish_name": "Ramen", "location": "NonExistentCityXYZ"})
        self.assertEqual(res.status_code, 404)
        self.assertIn("could not be resolved", res.json()["detail"])

    @patch("routers.search.geocode_location")
    @patch("routers.search.search_candidate_restaurants")
    @patch("routers.search.fetch_place_details")
    @patch("routers.search.fetch_yelp_details_and_reviews")
    @patch("routers.search.rank_restaurants_with_gemini")
    def test_search_cache_miss_with_mock(
        self,
        mock_rank,
        mock_yelp,
        mock_details,
        mock_search_places,
        mock_geocode
    ):
        """Test full search flow when external APIs return candidates."""
        mock_geocode.return_value = {"lat": 33.749, "lng": -84.388}
        mock_search_places.return_value = [{"place_id": "atl_taco_1", "name": "Taqueria del Sol"}]
        mock_details.return_value = {
            "name": "Taqueria del Sol",
            "rating": 4.6,
            "user_ratings_total": 1200,
            "price_level": 1,
            "editorial_summary": {"overview": "Popular Southern-infused taco joint"},
            "opening_hours": {"open_now": True},
            "website": "https://www.taqueriadelsol.com",
            "geometry": {"location": {"lat": 33.771, "lng": -84.415}},
            "reviews": [{"text": "The brisket taco is out of this world!"}]
        }
        mock_yelp.return_value = {
            "price": "$",
            "categories": ["Mexican", "Tex-Mex"],
            "reviews": [{"text": "Must try the carnitas tacos", "rating": 5.0, "author_name": "Foodie Guy"}]
        }
        mock_rank.return_value = [
            {
                "index": 0,
                "reason": "Acclaimed for their savory carnitas and brisket tacos.",
                "helpful_quote": "The brisket taco is out of this world!"
            }
        ]

        res = self.client.post("/api/search", json={"dish_name": "Tacos", "location": "Atlanta"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["name"], "Taqueria del Sol")
        self.assertEqual(data[0]["website"], "https://www.taqueriadelsol.com")
        self.assertEqual(data[0]["price_level"], "$")
        self.assertEqual(data[0]["helpful_quote"], "The brisket taco is out of this world!")

    @patch("routers.search.geocode_location")
    @patch("routers.search.search_candidate_restaurants")
    @patch("routers.search.fetch_place_details")
    @patch("routers.search.fetch_yelp_details_and_reviews")
    @patch("services.ai_service.ai_client")
    def test_search_gemini_failure_fallback(
        self,
        mock_ai_client,
        mock_yelp,
        mock_details,
        mock_search_places,
        mock_geocode
    ):
        """CRITICAL: Test that when Gemini API fails, search does NOT crash and falls back smoothly."""
        # Force Gemini call to raise an exception
        mock_ai_client.models.generate_content.side_effect = Exception("Gemini 503 Service Unavailable / Quota Exhausted")

        mock_geocode.return_value = {"lat": 34.052, "lng": -118.243}
        mock_search_places.return_value = [
            {"place_id": "la_ramen_1", "name": "Daikokuya Little Tokyo"},
            {"place_id": "la_ramen_2", "name": "Shin-Sen-Gumi Hakata Ramen"}
        ]
        mock_details.side_effect = [
            {
                "name": "Daikokuya Little Tokyo",
                "rating": 4.5,
                "user_ratings_total": 4500,
                "reviews": [{"text": "Their rich tonkotsu ramen broth is legendary."}],
                "geometry": {"location": {"lat": 34.050, "lng": -118.240}}
            },
            {
                "name": "Shin-Sen-Gumi Hakata Ramen",
                "rating": 4.6,
                "user_ratings_total": 2800,
                "reviews": [{"text": "Customizable tonkotsu broth and chewy noodles."}],
                "geometry": {"location": {"lat": 34.051, "lng": -118.241}}
            }
        ]
        mock_yelp.return_value = {"price": "$$", "categories": ["Ramen"], "reviews": []}

        # Call search - should return 200 with fallback ranking rather than crashing with 500!
        res = self.client.post("/api/search", json={"dish_name": "tonkotsu ramen", "location": "Los Angeles"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 2)
        # Verify valid reasons and ratings were generated by fallback
        self.assertTrue(all(r["name"] for r in data))
        self.assertTrue(all(r["reason"] for r in data))

    def test_feedback_endpoint(self):
        """Test submitting feedback on a recommendation."""
        # Setup query and rec
        query = models.SearchQuery(dish_name="Pasta", location="Rome")
        self.db.add(query)
        self.db.commit()
        self.db.refresh(query)

        rec = models.Recommendation(
            query_id=query.id,
            place_id="p1",
            name="Trattoria Da Enzo",
            rating=4.8,
            total_reviews=1500,
            reason="Legendary cacio e pepe.",
            lat=41.9,
            lng=12.5
        )
        self.db.add(rec)
        self.db.commit()
        self.db.refresh(rec)

        # 1. Successful helpful vote
        res = self.client.post("/api/feedback", json={"recommendation_id": rec.id, "helpful": True})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json(), {"status": "success", "helpful": True})

        # 2. Non-existent recommendation ID returns 404
        res_404 = self.client.post("/api/feedback", json={"recommendation_id": 999999, "helpful": False})
        self.assertEqual(res_404.status_code, 404)

    def test_queries_recommendations_endpoint(self):
        """Test retrieving recommendations for a specific query ID."""
        query = models.SearchQuery(dish_name="Steak", location="Dallas")
        self.db.add(query)
        self.db.commit()
        self.db.refresh(query)

        rec = models.Recommendation(
            query_id=query.id,
            place_id="steak_1",
            name="Bob's Steak & Chop House",
            rating=4.7,
            total_reviews=800,
            reason="Outstanding prime ribeye.",
            lat=32.8,
            lng=-96.8
        )
        self.db.add(rec)
        self.db.commit()

        # Success case
        res = self.client.get(f"/api/queries/{query.id}/recommendations")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 1)
        self.assertEqual(res.json()[0]["name"], "Bob's Steak & Chop House")

        # 404 case
        res_404 = self.client.get("/api/queries/99999/recommendations")
        self.assertEqual(res_404.status_code, 404)

    @patch("routers.search.geocode_location")
    @patch("routers.search.search_candidate_restaurants")
    @patch("routers.search.fetch_place_details")
    @patch("routers.search.fetch_yelp_details_and_reviews")
    @patch("routers.search.fetch_foursquare_tips")
    @patch("routers.search.fetch_osm_amenities_and_dietary")
    @patch("routers.search.fetch_dish_pricing_and_menu")
    @patch("routers.search.rank_restaurants_with_gemini")
    def test_search_phase_4_data_enrichment(
        self,
        mock_rank,
        mock_menu,
        mock_osm,
        mock_fsq,
        mock_yelp,
        mock_details,
        mock_search_places,
        mock_geocode
    ):
        """Verify that Foursquare tips, OSM tags, and menu pricing enrich the search response."""
        mock_geocode.return_value = {"lat": 40.75, "lng": -73.98}
        mock_search_places.return_value = [{"place_id": "nyc_halal_1", "name": "The Halal Guys"}]
        mock_details.return_value = {
            "name": "The Halal Guys",
            "rating": 4.5,
            "user_ratings_total": 8500,
            "price_level": 1,
            "editorial_summary": {"overview": "World-famous American Halal food cart"},
            "opening_hours": {"open_now": True},
            "website": "https://thehalalguys.com",
            "geometry": {"location": {"lat": 40.76, "lng": -73.98}},
            "reviews": [{"text": "Get the chicken and gyro combo platter!"}]
        }
        mock_yelp.return_value = {"price": "$", "categories": ["Middle Eastern", "Halal"], "reviews": []}
        mock_fsq.return_value = {
            "fsq_id": "fsq_halal_1",
            "tips": [{"text": "Be careful with the red hot sauce, it's fiery!", "created_at": "2024-01-01"}]
        }
        mock_osm.return_value = {
            "dietary_tags": ["Halal"],
            "amenities": ["Outdoor Seating", "Takeout"]
        }
        mock_menu.return_value = {
            "dish_price": "$12.99",
            "menu_item_name": "Chicken & Gyro Combo Platter"
        }
        mock_rank.return_value = [
            {
                "index": 0,
                "reason": "Iconic cart famous for legendary platters and white sauce.",
                "helpful_quote": "Get the chicken and gyro combo platter!"
            }
        ]

        res = self.client.post("/api/search", json={"dish_name": "Chicken and Rice", "location": "New York"})
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 1)
        item = data[0]
        self.assertEqual(item["name"], "The Halal Guys")
        self.assertEqual(item["dish_price"], "$12.99")
        self.assertIn("Halal", item["dietary_tags"])
        self.assertIn("Outdoor Seating", item["amenities"])

        # Check DB persistence
        db_rec = self.db.query(models.Recommendation).filter(models.Recommendation.place_id == "nyc_halal_1").first()
        self.assertIsNotNone(db_rec)
        self.assertEqual(db_rec.dish_price, "$12.99")
        self.assertIn("Halal", db_rec.dietary_tags)
        self.assertIn("Outdoor Seating", db_rec.amenities)

        # Check Foursquare review saved to Review table
        fsq_review = self.db.query(models.Review).filter(
            models.Review.place_id == "nyc_halal_1",
            models.Review.source == "foursquare"
        ).first()
        self.assertIsNotNone(fsq_review)
        self.assertIn("red hot sauce", fsq_review.text)

    @patch("routers.search.geocode_location")
    @patch("routers.search.search_candidate_restaurants")
    @patch("routers.search.fetch_place_details")
    @patch("routers.search.rank_restaurants_with_gemini")
    def test_search_with_client_coordinates_bypasses_geocoding(
        self,
        mock_rank,
        mock_details,
        mock_search_places,
        mock_geocode
    ):
        """When client provides lat and lng, geocode_location must NOT be called."""
        mock_search_places.return_value = [{"place_id": "dor_kebab_1", "name": "Nafas Mediterranean"}]
        mock_details.return_value = {
            "name": "Nafas Mediterranean",
            "rating": 4.8,
            "user_ratings_total": 450,
            "geometry": {"location": {"lat": 33.898, "lng": -84.283}},
            "reviews": [{"text": "Best lamb shish kebab in Doraville!"}]
        }
        mock_rank.return_value = [{"index": 0, "reason": "Delicious tender shish kebab."}]

        res = self.client.post("/api/search", json={
            "dish_name": "lamb shish kebab",
            "location": "Doraville, GA",
            "lat": 33.8981,
            "lng": -84.2832
        })
        self.assertEqual(res.status_code, 200)
        # Geocoding should NOT have been called because coordinates were supplied directly
        mock_geocode.assert_not_called()
        # Places search should have been called with the client's coordinates
        mock_search_places.assert_called_once_with("lamb shish kebab", "Doraville, GA", 33.8981, -84.2832)

    @patch("services.places_service.gmaps")
    def test_distance_filtering_rejects_distant_places(self, mock_gmaps):
        """Ensure candidates > 60km away (e.g. Orlando, FL from Georgia) are rejected."""
        from services.places_service import search_candidate_restaurants, haversine_distance_km

        # Doraville, GA coordinates: ~33.898, -84.283
        doraville_lat, doraville_lng = 33.898, -84.283

        # Orlando, FL coordinates: ~28.538, -81.379 (approx 650 km away)
        orlando_lat, orlando_lng = 28.538, -81.379
        dist_to_orlando = haversine_distance_km(doraville_lat, doraville_lng, orlando_lat, orlando_lng)
        self.assertGreater(dist_to_orlando, 600)  # > 600 km away

        # Mock gmaps.places returning 1 local restaurant in Doraville (2 km away) and 1 in Orlando (650 km away)
        mock_gmaps.places.return_value = {
            "results": [
                {
                    "place_id": "local_spot",
                    "name": "Nafas Mediterranean Doraville",
                    "geometry": {"location": {"lat": 33.905, "lng": -84.280}}
                },
                {
                    "place_id": "orlando_spot",
                    "name": "Orlando Shish Kebab House",
                    "geometry": {"location": {"lat": 28.538, "lng": -81.379}}
                }
            ]
        }

        candidates = search_candidate_restaurants("lamb shish kebab", "Doraville, GA", doraville_lat, doraville_lng)
        # Only the local spot in Doraville should pass the 60km filter
        self.assertEqual(len(candidates), 1)
        self.assertEqual(candidates[0]["name"], "Nafas Mediterranean Doraville")
        self.assertEqual(candidates[0]["place_id"], "local_spot")

if __name__ == "__main__":
    unittest.main()
