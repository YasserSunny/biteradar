from pydantic import BaseModel
from typing import List, Optional

class SearchRequest(BaseModel):
    dish_name: str
    location: str
    user_id: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    dietary_filters: Optional[List[str]] = []
    price_tier: Optional[str] = None
    max_distance_km: Optional[float] = None

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
    dietary_tags: Optional[List[str]] = []
    amenities: Optional[List[str]] = []
    dish_price: Optional[str] = None
    photo_url: Optional[str] = None
    delivery_url: Optional[str] = None
    reservation_url: Optional[str] = None
    query_id: Optional[int] = None

class FeedbackRequest(BaseModel):
    recommendation_id: int
    helpful: bool

class DishItem(BaseModel):
    id: int
    name: str
    cuisine: Optional[str] = None
    description: Optional[str] = None
    primary_photo_url: Optional[str] = None
    typical_price_range: Optional[str] = None
    dietary_attributes: Optional[List[str]] = []
    search_count: int

class ChatRequest(BaseModel):
    query_id: int
    message: str
    history: Optional[List[dict]] = []

class ChatResponse(BaseModel):
    response: str
    cited_restaurants: List[str] = []

