import os
import time
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import models
from database import engine
from routers import search, profile
from logger import get_logger

logger = get_logger("app")

# Ensure all database tables exist safely
try:
    from sqlalchemy import text
    models.Base.metadata.create_all(bind=engine)
    logger.info("Database tables verified and initialized successfully.")
    # Safe column migration check for newly added columns
    with engine.connect() as conn:
        for col_name in ["dietary_tags", "amenities", "dish_price"]:
            try:
                conn.execute(text(f"ALTER TABLE recommendations ADD COLUMN {col_name} VARCHAR"))
                conn.commit()
                logger.info(f"Added column '{col_name}' to recommendations table.")
            except Exception:
                pass  # Column already exists
except Exception as e:
    logger.error(f"Error during database table initialization: {e}", exc_info=True)

app = FastAPI(
    title="biteradar API",
    description="Intelligent restaurant and dish recommendation engine powered by Gemini, Google Maps, and Yelp.",
    version="1.0.0"
)

# Configure CORS for Next.js frontend (local dev and deployed environments)
allowed_origins_env = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000")
allowed_origins = [o.strip() for o in allowed_origins_env.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=os.getenv("ALLOWED_ORIGIN_REGEX", r"^https?://.*"),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request timing & access logging middleware
@app.middleware("http")
async def log_requests(request: Request, call_next):
    start_time = time.perf_counter()
    client_host = request.client.host if request.client else "unknown"
    method = request.method
    path = request.url.path

    try:
        response = await call_next(request)
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.info(f"{method} {path} [{client_host}] -> {response.status_code} ({duration_ms:.1f}ms)")
        return response
    except Exception as e:
        duration_ms = (time.perf_counter() - start_time) * 1000
        logger.error(f"{method} {path} [{client_host}] FAILED after {duration_ms:.1f}ms with error: {e}", exc_info=True)
        raise

# Global exception handlers to prevent app crashes & provide clean error JSON
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    logger.warning(f"HTTPException on {request.method} {request.url.path}: {exc.status_code} - {exc.detail}")
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail, "status_code": exc.status_code}
    )

@app.exception_handler(Exception)
async def global_unhandled_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled server error on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "An unexpected server error occurred. Please try again later.",
            "status_code": 500
        }
    )

# Register route modules
app.include_router(search.router)
app.include_router(profile.router)

@app.get("/health", tags=["system"])
def health_check():
    return {"status": "ok", "service": "biteradar API"}
