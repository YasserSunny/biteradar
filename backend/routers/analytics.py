import json
from typing import List, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from database import get_db
import models
from schemas import (
    AnalyticsSummaryResponse,
    CityTrendsResponse,
    CityTrendItem,
    TopRestaurantGem,
    DishItem
)
from logger import get_logger

logger = get_logger("routers.analytics")

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _parse_json_list(val: Optional[str]) -> List[str]:
    if not val:
        return []
    try:
        parsed = json.loads(val)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []


@router.get("/summary", response_model=AnalyticsSummaryResponse)
def get_analytics_summary(db: Session = Depends(get_db)):
    """
    Returns high-level platform insights: search counts, satisfaction rate,
    trending dishes, and top-rated restaurant gems based on community feedback.
    """
    total_searches = db.query(models.SearchQuery).count()
    unique_dishes = db.query(models.Dish).count()
    total_recs = db.query(models.Recommendation).count()

    # Feedback calculations
    positive_votes = db.query(models.Recommendation).filter(models.Recommendation.helpful == True).count()
    negative_votes = db.query(models.Recommendation).filter(models.Recommendation.helpful == False).count()
    total_votes = positive_votes + negative_votes

    satisfaction_rate = round((positive_votes / total_votes) * 100, 1) if total_votes > 0 else 100.0

    # Top searched dishes
    db_dishes = db.query(models.Dish).order_by(desc(models.Dish.search_count)).limit(6).all()
    top_dishes = [
        DishItem(
            id=d.id,
            name=d.name,
            cuisine=d.cuisine,
            description=d.description,
            primary_photo_url=d.primary_photo_url,
            typical_price_range=d.typical_price_range,
            dietary_attributes=_parse_json_list(d.dietary_attributes),
            search_count=d.search_count or 1
        )
        for d in db_dishes
    ]

    # Top restaurant gems (prioritize positive community votes, then highest ratings)
    top_gems = []
    gem_rows = db.query(
        models.Recommendation.place_id,
        models.Recommendation.name,
        func.count(models.Recommendation.id).label("pos_count"),
        func.avg(models.Recommendation.rating).label("avg_rating"),
        func.max(models.Recommendation.photo_url).label("photo")
    ).filter(
        models.Recommendation.helpful == True
    ).group_by(
        models.Recommendation.place_id,
        models.Recommendation.name
    ).order_by(
        desc("pos_count"),
        desc("avg_rating")
    ).limit(5).all()

    for row in gem_rows:
        top_gems.append(
            TopRestaurantGem(
                place_id=row[0],
                name=row[1],
                positive_votes=row[2],
                rating=round(float(row[3]), 1) if row[3] else 4.5,
                photo_url=row[4]
            )
        )

    # Fallback to high-rated recommendations if few/no explicit helpful votes yet
    if len(top_gems) < 3:
        seen_places = {g.place_id for g in top_gems}
        fallback_rows = db.query(
            models.Recommendation.place_id,
            models.Recommendation.name,
            models.Recommendation.rating,
            models.Recommendation.photo_url
        ).filter(
            models.Recommendation.rating >= 4.0
        ).order_by(
            desc(models.Recommendation.rating),
            desc(models.Recommendation.total_reviews)
        ).limit(10).all()

        for f_row in fallback_rows:
            if f_row[0] not in seen_places:
                seen_places.add(f_row[0])
                top_gems.append(
                    TopRestaurantGem(
                        place_id=f_row[0],
                        name=f_row[1],
                        positive_votes=0,
                        rating=round(float(f_row[2]), 1) if f_row[2] else 4.5,
                        photo_url=f_row[3]
                    )
                )
            if len(top_gems) >= 5:
                break

    return AnalyticsSummaryResponse(
        total_searches=total_searches,
        unique_dishes_cataloged=unique_dishes,
        total_recommendations=total_recs,
        satisfaction_rate_percent=satisfaction_rate,
        total_feedback_votes=total_votes,
        positive_feedback_votes=positive_votes,
        negative_feedback_votes=negative_votes,
        top_dishes=top_dishes,
        top_gems=top_gems
    )


@router.get("/trending-by-city", response_model=CityTrendsResponse)
def get_trending_by_city(
    location: Optional[str] = Query(None, description="Optional city filter to narrow trends"),
    limit: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db)
):
    """
    Returns popular dishes grouped by city to power the City Food Radar.
    """
    # 1. Get distinct cities available in searches
    city_rows = db.query(models.SearchQuery.location).distinct().limit(25).all()
    available_cities = sorted([r[0] for r in city_rows if r[0] and r[0].strip()])

    # 2. Query search queries grouped by location and dish
    query = db.query(
        models.SearchQuery.location,
        models.SearchQuery.dish_name,
        func.count(models.SearchQuery.id).label("cnt")
    )

    if location and location.strip():
        query = query.filter(func.lower(models.SearchQuery.location) == location.strip().lower())

    results = query.group_by(
        models.SearchQuery.location,
        models.SearchQuery.dish_name
    ).order_by(
        desc("cnt")
    ).limit(limit).all()

    trends = [
        CityTrendItem(
            location=row[0],
            dish_name=row[1],
            search_count=row[2]
        )
        for row in results
    ]

    return CityTrendsResponse(
        available_cities=available_cities,
        trends=trends
    )
