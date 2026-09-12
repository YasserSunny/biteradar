from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

app = FastAPI(title="biteradar API")

# Allow CORS for Next.js development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class SearchRequest(BaseModel):
    dish_name: str
    location: str

class RestaurantMock(BaseModel):
    id: str
    name: str
    rating: float
    reason: str
    lat: float
    lng: float

@app.post("/api/search", response_model=List[RestaurantMock])
def search_dish(request: SearchRequest):
    # Mock data for Milestone 1 prototype
    mock_results = [
        RestaurantMock(
            id="1",
            name="Sushi Nakazawa",
            rating=4.8,
            reason=f"Highly rated for their {request.dish_name}. Reviewers frequently mention the incredible flavor and freshness.",
            lat=40.7316,
            lng=-74.0048
        ),
        RestaurantMock(
            id="2",
            name="Sugarfish",
            rating=4.7,
            reason=f"Popular spot for {request.dish_name}. Known for warm rice and melt-in-your-mouth texture.",
            lat=40.7388,
            lng=-73.9902
        ),
        RestaurantMock(
            id="3",
            name="Blue Ribbon Sushi",
            rating=4.5,
            reason=f"A staple in the neighborhood. They serve a consistently great {request.dish_name}.",
            lat=40.7261,
            lng=-74.0026
        )
    ]
    return mock_results
