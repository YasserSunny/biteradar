from sqlalchemy import Column, Integer, String, Float, ForeignKey, DateTime, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base

class SearchQuery(Base):
    __tablename__ = "search_queries"

    id = Column(Integer, primary_key=True, index=True)
    dish_name = Column(String, index=True)
    location = Column(String, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    recommendations = relationship("Recommendation", back_populates="query")


class Recommendation(Base):
    __tablename__ = "recommendations"

    id = Column(Integer, primary_key=True, index=True)
    query_id = Column(Integer, ForeignKey("search_queries.id"))
    place_id = Column(String, index=True)
    name = Column(String)
    rating = Column(Float)
    total_reviews = Column(Integer, default=0)
    reason = Column(String)
    helpful_quote = Column(String, nullable=True)
    lat = Column(Float)
    lng = Column(Float)
    
    # Feedback fields
    helpful = Column(Boolean, nullable=True)

    query = relationship("SearchQuery", back_populates="recommendations")


class Place(Base):
    __tablename__ = "places"
    
    id = Column(String, primary_key=True, index=True) # Google Place ID
    name = Column(String)
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
