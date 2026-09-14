import unittest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import models
from database import Base, get_db
from main import app

class TestPhase3Analytics(unittest.TestCase):
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
    # 1. Platform Summary & Curation Metrics
    # -------------------------------------------------------------
    def test_analytics_summary_empty_db(self):
        """Verify analytics summary on a fresh, empty database."""
        res = self.client.get("/api/analytics/summary")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(data["total_searches"], 0)
        self.assertEqual(data["unique_dishes_cataloged"], 0)
        self.assertEqual(data["total_recommendations"], 0)
        self.assertEqual(data["satisfaction_rate_percent"], 100.0)
        self.assertEqual(data["total_feedback_votes"], 0)
        self.assertEqual(data["top_dishes"], [])
        self.assertEqual(data["top_gems"], [])

    def test_analytics_summary_with_feedback_and_dishes(self):
        """Verify satisfaction rate and top gems calculation with community feedback."""
        # 1. Create Dishes
        dish1 = models.Dish(name="Neapolitan Pizza", normalized_name="neapolitan pizza", search_count=12)
        dish2 = models.Dish(name="Tonkotsu Ramen", normalized_name="tonkotsu ramen", search_count=25)
        self.db.add_all([dish1, dish2])
        self.db.commit()

        # 2. Create Search Queries
        sq1 = models.SearchQuery(dish_name="Tonkotsu Ramen", location="Tokyo", dish_id=dish2.id)
        sq2 = models.SearchQuery(dish_name="Neapolitan Pizza", location="Naples", dish_id=dish1.id)
        self.db.add_all([sq1, sq2])
        self.db.commit()

        # 3. Create Recommendations with feedback
        rec1 = models.Recommendation(
            query_id=sq1.id,
            place_id="gem_tokyo_1",
            name="Ichiran Shibuya",
            rating=4.8,
            total_reviews=1200,
            helpful=True,
            photo_url="https://images.example.com/ichiran.jpg"
        )
        rec2 = models.Recommendation(
            query_id=sq1.id,
            place_id="gem_tokyo_1",
            name="Ichiran Shibuya",
            rating=4.8,
            total_reviews=1200,
            helpful=True,
            photo_url="https://images.example.com/ichiran.jpg"
        )
        rec3 = models.Recommendation(
            query_id=sq2.id,
            place_id="gem_naples_1",
            name="L'Antica Pizzeria da Michele",
            rating=4.9,
            total_reviews=2500,
            helpful=True
        )
        rec4 = models.Recommendation(
            query_id=sq2.id,
            place_id="gem_naples_2",
            name="Average Pizza Spot",
            rating=3.5,
            total_reviews=80,
            helpful=False  # Negative vote
        )
        self.db.add_all([rec1, rec2, rec3, rec4])
        self.db.commit()

        # Call analytics summary endpoint
        res = self.client.get("/api/analytics/summary")
        self.assertEqual(res.status_code, 200)
        data = res.json()

        self.assertEqual(data["total_searches"], 2)
        self.assertEqual(data["unique_dishes_cataloged"], 2)
        self.assertEqual(data["total_recommendations"], 4)
        self.assertEqual(data["total_feedback_votes"], 4)
        self.assertEqual(data["positive_feedback_votes"], 3)
        self.assertEqual(data["negative_feedback_votes"], 1)
        # 3 positive out of 4 total = 75.0%
        self.assertEqual(data["satisfaction_rate_percent"], 75.0)

        # Top dishes should have Tonkotsu Ramen first (search_count 25)
        self.assertEqual(len(data["top_dishes"]), 2)
        self.assertEqual(data["top_dishes"][0]["name"], "Tonkotsu Ramen")
        self.assertEqual(data["top_dishes"][0]["search_count"], 25)

        # Top gems should list Ichiran Shibuya first (2 positive votes)
        self.assertTrue(len(data["top_gems"]) >= 2)
        self.assertEqual(data["top_gems"][0]["name"], "Ichiran Shibuya")
        self.assertEqual(data["top_gems"][0]["positive_votes"], 2)

    # -------------------------------------------------------------
    # 2. Trending Food Radar by City
    # -------------------------------------------------------------
    def test_trending_by_city(self):
        """Verify city trends aggregation and location filtering."""
        sq1 = models.SearchQuery(dish_name="Tacos", location="Austin")
        sq2 = models.SearchQuery(dish_name="Tacos", location="Austin")
        sq3 = models.SearchQuery(dish_name="BBQ Brisket", location="Austin")
        sq4 = models.SearchQuery(dish_name="Croissant", location="Paris")
        self.db.add_all([sq1, sq2, sq3, sq4])
        self.db.commit()

        # All cities
        res_all = self.client.get("/api/analytics/trending-by-city")
        self.assertEqual(res_all.status_code, 200)
        data_all = res_all.json()
        self.assertIn("Austin", data_all["available_cities"])
        self.assertIn("Paris", data_all["available_cities"])
        # Austin Tacos should be top with 2 searches
        self.assertEqual(data_all["trends"][0]["dish_name"], "Tacos")
        self.assertEqual(data_all["trends"][0]["location"], "Austin")
        self.assertEqual(data_all["trends"][0]["search_count"], 2)

        # Filtered by location: Paris
        res_paris = self.client.get("/api/analytics/trending-by-city?location=Paris")
        self.assertEqual(res_paris.status_code, 200)
        data_paris = res_paris.json()
        self.assertEqual(len(data_paris["trends"]), 1)
        self.assertEqual(data_paris["trends"][0]["dish_name"], "Croissant")
        self.assertEqual(data_paris["trends"][0]["location"], "Paris")

if __name__ == "__main__":
    unittest.main()
