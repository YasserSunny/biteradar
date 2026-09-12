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
    reason = Column(String)
    lat = Column(Float)
    lng = Column(Float)
    
    # Feedback fields
    helpful = Column(Boolean, nullable=True) # True = Thumbs Up, False = Thumbs Down, None = No feedback

    query = relationship("SearchQuery", back_populates="recommendations")
