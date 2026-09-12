import unittest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import models
from database import get_db
from main import app

# In-memory SQLite for test isolation
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

class TestHealthAndProfile(unittest.TestCase):
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

    def test_health_check(self):
        """Verify health check returns 200 and healthy status."""
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok", "service": "biteradar API"})

    def test_profile_lifecycle(self):
        """Test creating, fetching, and updating a user profile."""
        user_id = "test_usr_42"

        # 1. Fetching non-existent profile returns 404
        res = self.client.get(f"/api/profile/{user_id}")
        self.assertEqual(res.status_code, 404)

        # 2. Create profile
        payload = {
            "user_id": user_id,
            "name": "Chef Gordon",
            "preferred_cuisines": ["French", "Italian"],
            "favorite_dishes": ["Beef Wellington", "Risotto"]
        }
        res_post = self.client.post("/api/profile", json=payload)
        self.assertEqual(res_post.status_code, 200)
        data = res_post.json()
        self.assertEqual(data["user_id"], user_id)
        self.assertEqual(data["name"], "Chef Gordon")
        self.assertEqual(data["preferred_cuisines"], ["French", "Italian"])

        # 3. Retrieve created profile
        res_get = self.client.get(f"/api/profile/{user_id}")
        self.assertEqual(res_get.status_code, 200)
        get_data = res_get.json()
        self.assertEqual(get_data["name"], "Chef Gordon")
        self.assertEqual(get_data["favorite_dishes"], ["Beef Wellington", "Risotto"])

        # 4. Update existing profile
        update_payload = {
            "user_id": user_id,
            "name": "Gordon Ramsay",
            "preferred_cuisines": ["British", "French"],
            "favorite_dishes": ["Scrambled Eggs"]
        }
        res_update = self.client.post("/api/profile", json=update_payload)
        self.assertEqual(res_update.status_code, 200)
        self.assertEqual(res_update.json()["name"], "Gordon Ramsay")

    def test_history_deduplication_and_limit(self):
        """Test that search history is deduplicated by (dish, location) and limited to 5."""
        user_id = "history_tester"

        # Create query records in DB
        q1 = models.SearchQuery(dish_name="Pizza", location="NYC")
        q2 = models.SearchQuery(dish_name="pizza", location="nyc")  # Duplicate
        q3 = models.SearchQuery(dish_name="Sushi", location="NYC")
        q4 = models.SearchQuery(dish_name="Ramen", location="NYC")
        q5 = models.SearchQuery(dish_name="Burgers", location="NYC")
        q6 = models.SearchQuery(dish_name="Tacos", location="NYC")
        q7 = models.SearchQuery(dish_name="Pad Thai", location="NYC")
        self.db.add_all([q1, q2, q3, q4, q5, q6, q7])
        self.db.commit()

        # Add history entries
        for q in [q1, q2, q3, q4, q5, q6, q7]:
            h = models.SearchHistory(user_id=user_id, query_id=q.id)
            self.db.add(h)
        self.db.commit()

        res = self.client.get(f"/api/history/{user_id}")
        self.assertEqual(res.status_code, 200)
        history = res.json()

        # Max 5 items returned
        self.assertLessEqual(len(history), 5)

        # Pizza should only appear once despite duplicate query entries
        dish_names = [item["dish_name"].lower() for item in history]
        self.assertEqual(dish_names.count("pizza"), 1)

if __name__ == "__main__":
    unittest.main()
