from pydantic import BaseModel
from typing import List, Optional

class SearchRequest(BaseModel):
    dish_name: str
    location: str
    user_id: Optional[str] = None

class ProfileRequest(BaseModel):
    user_id: str
    name: str
    preferred_cuisines: List[str] = []
    favorite_dishes: List[str] = []

class ProfileResponse(BaseModel):
    user_id: str
    name: str
    preferred_cuisines: List[str] = []
    favorite_dishes: List[str] = []

class SearchHistoryItem(BaseModel):
    id: int
    query_id: int
    dish_name: str
    location: str
    created_at: str

class RestaurantResult(BaseModel):
    id: str  # Database recommendation ID, used for feedback & unique keys
    place_id: str
    name: str
    rating: float
    total_reviews: int
    price_level: Optional[str] = None
    summary: Optional[str] = None
    open_now: Optional[bool] = None
    website: Optional[str] = None
    reason: str
    helpful_quote: Optional[str] = None
    lat: float
    lng: float
    helpful: Optional[bool] = None

class FeedbackRequest(BaseModel):
    recommendation_id: int
    helpful: bool
