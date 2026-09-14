import json
from typing import List, Optional
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from database import get_db
import models
from schemas import ChatRequest, ChatResponse
from services.ai_service import answer_dish_chat
from logger import get_logger

logger = get_logger("routers.chat")

def _parse_json_list(val: Optional[str]) -> List[str]:
    if not val:
        return []
    try:
        parsed = json.loads(val)
        return parsed if isinstance(parsed, list) else []
    except Exception:
        return []

router = APIRouter(prefix="/api", tags=["chat"])

@router.post("/chat", response_model=ChatResponse)
def dish_chat(request: ChatRequest, db: Session = Depends(get_db)):
    """
    Interactive AI Dish Concierge: Answers follow-up questions about the recommended spots
    (e.g., comparing prices, inquiring about dietary options, patio seating, reservation advice)
    grounded directly in the restaurant attributes and reviews.
    """
    user_msg = request.message.strip()
    if not user_msg:
        raise HTTPException(status_code=400, detail="Message cannot be empty.")

    query = db.query(models.SearchQuery).filter(models.SearchQuery.id == request.query_id).first()
    if not query:
        logger.warning(f"Chat request received for nonexistent query_id {request.query_id}")
        raise HTTPException(status_code=404, detail="Search query session not found.")

    recs_data = []
    for r in query.recommendations:
        recs_data.append({
            "name": r.name,
            "rating": r.rating,
            "total_reviews": r.total_reviews,
            "price_level": r.price_level,
            "dish_price": r.dish_price,
            "dietary_tags": _parse_json_list(r.dietary_tags),
            "amenities": _parse_json_list(r.amenities),
            "summary": r.summary,
            "reason": r.reason,
            "helpful_quote": r.helpful_quote
        })

    logger.info(f"Processing chat for query_id={request.query_id} ('{query.dish_name}' in '{query.location}') with {len(recs_data)} recommendations")
    ai_result = answer_dish_chat(
        dish_name=query.dish_name,
        location=query.location,
        recommendations=recs_data,
        user_message=user_msg,
        history=request.history
    )

    return ChatResponse(
        response=ai_result.get("response", "Here's what our foodie concierge found based on these spots!"),
        cited_restaurants=ai_result.get("cited_restaurants", [])
    )
