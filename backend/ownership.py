"""Database ownership checks shared by protected endpoints."""
from fastapi import HTTPException
from sqlalchemy.orm import Session

import models


def require_query_access(db: Session, query_id: int, user_id: str) -> models.SearchQuery:
    query = db.query(models.SearchQuery).filter(models.SearchQuery.id == query_id).first()
    if not query:
        raise HTTPException(status_code=404, detail="Search query session not found.")
    owned = db.query(models.SearchHistory.id).filter(
        models.SearchHistory.query_id == query_id,
        models.SearchHistory.user_id == user_id,
    ).first()
    if not owned:
        raise HTTPException(status_code=403, detail="You cannot access this search.")
    return query


def require_recommendation_access(
    db: Session, recommendation_id: int, user_id: str
) -> models.Recommendation:
    recommendation = db.query(models.Recommendation).filter(
        models.Recommendation.id == recommendation_id
    ).first()
    if not recommendation:
        raise HTTPException(status_code=404, detail="Recommendation not found")
    require_query_access(db, recommendation.query_id, user_id)
    return recommendation
