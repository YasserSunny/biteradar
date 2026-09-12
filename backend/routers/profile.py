import json
from typing import List
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session

from database import get_db
import models
from schemas import ProfileRequest, ProfileResponse, SearchHistoryItem

router = APIRouter(prefix="/api", tags=["profile"])

@router.get("/profile/{user_id}", response_model=ProfileResponse)
def get_profile(user_id: str, db: Session = Depends(get_db)):
    profile = db.query(models.UserProfile).filter(models.UserProfile.user_id == user_id).first()
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    try:
        cuisines = json.loads(profile.preferred_cuisines) if profile.preferred_cuisines else []
    except Exception:
        cuisines = []
    try:
        dishes = json.loads(profile.favorite_dishes) if profile.favorite_dishes else []
    except Exception:
        dishes = []
    return ProfileResponse(
        user_id=profile.user_id,
        name=profile.name,
        preferred_cuisines=cuisines,
        favorite_dishes=dishes
    )

@router.post("/profile", response_model=ProfileResponse)
def save_profile(req: ProfileRequest, db: Session = Depends(get_db)):
    profile = db.query(models.UserProfile).filter(models.UserProfile.user_id == req.user_id).first()
    if not profile:
        profile = models.UserProfile(
            user_id=req.user_id,
            name=req.name,
            preferred_cuisines=json.dumps(req.preferred_cuisines),
            favorite_dishes=json.dumps(req.favorite_dishes)
        )
        db.add(profile)
    else:
        profile.name = req.name
        profile.preferred_cuisines = json.dumps(req.preferred_cuisines)
        profile.favorite_dishes = json.dumps(req.favorite_dishes)
    db.commit()
    db.refresh(profile)
    return ProfileResponse(
        user_id=profile.user_id,
        name=profile.name,
        preferred_cuisines=req.preferred_cuisines,
        favorite_dishes=req.favorite_dishes
    )

@router.get("/history/{user_id}", response_model=List[SearchHistoryItem])
def get_history(user_id: str, db: Session = Depends(get_db)):
    histories = db.query(models.SearchHistory).filter(
        models.SearchHistory.user_id == user_id
    ).order_by(models.SearchHistory.created_at.desc()).all()

    seen = set()
    result = []
    for h in histories:
        if not h.query:
            continue
        key = (h.query.dish_name.lower().strip(), h.query.location.lower().strip())
        if key not in seen:
            seen.add(key)
            result.append(SearchHistoryItem(
                id=h.id,
                query_id=h.query_id,
                dish_name=h.query.dish_name,
                location=h.query.location,
                created_at=h.created_at.isoformat() if h.created_at else ""
            ))
        if len(result) >= 5:
            break
    return result
