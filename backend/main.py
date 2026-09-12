from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import models
from database import engine
from routers import search, profile

# Ensure all database tables exist
models.Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="biteradar API",
    description="Intelligent restaurant and dish recommendation engine powered by Gemini, Google Maps, and Yelp.",
    version="1.0.0"
)

# Configure CORS for Next.js frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register route modules
app.include_router(search.router)
app.include_router(profile.router)

@app.get("/health", tags=["system"])
def health_check():
    return {"status": "ok", "service": "biteradar API"}
