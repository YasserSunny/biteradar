from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class Dish(Base):
    __tablename__ = "dishes"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)
    normalized_name = Column(String, index=True)
    cuisine = Column(String, nullable=True)
    description = Column(String, nullable=True)
    primary_photo_url = Column(String, nullable=True)
    typical_price_range = Column(String, nullable=True)
    dietary_attributes = Column(String, default="[]")  # JSON string list
    search_count = Column(Integer, default=1)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_searched_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    queries = relationship("SearchQuery", back_populates="dish")


class SearchQuery(Base):
    __tablename__ = "search_queries"

    id = Column(Integer, primary_key=True, index=True)
    dish_name = Column(String, index=True)
    location = Column(String, index=True)
    dish_id = Column(Integer, ForeignKey("dishes.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    dish = relationship("Dish", back_populates="queries")
    recommendations = relationship("Recommendation", back_populates="query")
    history_entries = relationship("SearchHistory", back_populates="query")


class SearchHistory(Base):
    __tablename__ = "search_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, index=True)
    query_id = Column(Integer, ForeignKey("search_queries.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    query = relationship("SearchQuery", back_populates="history_entries")


class UserProfile(Base):
    __tablename__ = "user_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, unique=True, index=True)
    name = Column(String)
    preferred_cuisines = Column(String, default="[]")  # JSON string
    favorite_dishes = Column(String, default="[]")     # JSON string
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class Recommendation(Base):
    __tablename__ = "recommendations"

    id = Column(Integer, primary_key=True, index=True)
    query_id = Column(Integer, ForeignKey("search_queries.id"))
    place_id = Column(String, index=True)
    name = Column(String)
    rating = Column(Float)
    total_reviews = Column(Integer, default=0)
    price_level = Column(String, nullable=True)
    summary = Column(String, nullable=True)
    open_now = Column(Boolean, nullable=True)
    website = Column(String, nullable=True)
    reason = Column(String)
    helpful_quote = Column(String, nullable=True)
    lat = Column(Float)
    lng = Column(Float)
    
    # Feedback fields
    helpful = Column(Boolean, nullable=True)

    # Phase 4 Expanded Data Attributes
    dietary_tags = Column(String, nullable=True)  # JSON string list e.g. '["Halal", "Vegan Friendly"]'
    amenities = Column(String, nullable=True)     # JSON string list e.g. '["Outdoor Seating"]'
    dish_price = Column(String, nullable=True)    # e.g. "$16.50" or "~$15 - $22"

    # Phase 5 Visual & Booking Attributes
    photo_url = Column(String, nullable=True)
    delivery_url = Column(String, nullable=True)
    reservation_url = Column(String, nullable=True)

    query = relationship("SearchQuery", back_populates="recommendations")


class Place(Base):
    __tablename__ = "places"
    
    id = Column(String, primary_key=True, index=True) # Google Place ID
    name = Column(String)
    website = Column(String, nullable=True)
    lat = Column(Float)
    lng = Column(Float)
    
    reviews = relationship("Review", back_populates="place")


class Review(Base):
    __tablename__ = "reviews"
    
    id = Column(Integer, primary_key=True, index=True)
    place_id = Column(String, ForeignKey("places.id"))
    source = Column(String) # "google" or "yelp"
    author_name = Column(String, nullable=True)
    rating = Column(Float, nullable=True)
    text = Column(String)
    
    place = relationship("Place", back_populates="reviews")
