import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# Using PostgreSQL when DATABASE_URL is provided (e.g. Cloud Run with Neon/Supabase),
# with automatic fallback to SQLite for local development.
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./biteradar.db")

# Standardize URL prefix for SQLAlchemy (e.g., Heroku/Neon postgres:// -> postgresql://)
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

connect_args = {}
if "sqlite" in DATABASE_URL:
    connect_args["check_same_thread"] = False

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def run_database_migrations(target_engine=None):
    """
    Safely ensures all tables exist and performs non-destructive schema migrations
    for both SQLite and PostgreSQL without transaction abort issues.
    """
    from sqlalchemy import text, inspect
    import models
    from logger import get_logger

    logger = get_logger("database.migrations")
    eng = target_engine or engine

    try:
        models.Base.metadata.create_all(bind=eng)
        logger.info("Database tables verified and initialized successfully.")

        inspector = inspect(eng)
        existing_tables = inspector.get_table_names()

        # 1. recommendations table migrations
        if "recommendations" in existing_tables:
            rec_cols = {col["name"] for col in inspector.get_columns("recommendations")}
            for col_name in ["dietary_tags", "amenities", "dish_price", "photo_url", "delivery_url", "reservation_url"]:
                if col_name not in rec_cols:
                    try:
                        with eng.begin() as conn:
                            conn.execute(text(f"ALTER TABLE recommendations ADD COLUMN {col_name} VARCHAR"))
                        logger.info(f"Added column '{col_name}' to recommendations table.")
                    except Exception as col_err:
                        logger.warning(f"Could not add column '{col_name}' to recommendations: {col_err}")

        # 2. search_queries table migrations
        if "search_queries" in existing_tables:
            sq_cols = {col["name"] for col in inspector.get_columns("search_queries")}
            if "dish_id" not in sq_cols:
                try:
                    with eng.begin() as conn:
                        conn.execute(text("ALTER TABLE search_queries ADD COLUMN dish_id INTEGER"))
                    logger.info("Added column 'dish_id' to search_queries table.")
                except Exception as col_err:
                    logger.warning(f"Could not add column 'dish_id' to search_queries: {col_err}")

            for col_name in ["search_context", "cache_key"]:
                if col_name not in sq_cols:
                    with eng.begin() as conn:
                        conn.execute(text(f"ALTER TABLE search_queries ADD COLUMN {col_name} VARCHAR"))
            with eng.begin() as conn:
                conn.execute(text("CREATE INDEX IF NOT EXISTS ix_search_queries_cache_key ON search_queries (cache_key)"))

        # 3. dishes table migrations
        if "dishes" in existing_tables:
            dish_cols = {col["name"] for col in inspector.get_columns("dishes")}
            for col_name in ["cuisine", "description", "primary_photo_url", "typical_price_range", "dietary_attributes"]:
                if col_name not in dish_cols:
                    try:
                        with eng.begin() as conn:
                            conn.execute(text(f"ALTER TABLE dishes ADD COLUMN {col_name} VARCHAR"))
                        logger.info(f"Added column '{col_name}' to dishes table.")
                    except Exception as col_err:
                        logger.warning(f"Could not add column '{col_name}' to dishes: {col_err}")
            if "search_count" not in dish_cols:
                try:
                    with eng.begin() as conn:
                        conn.execute(text("ALTER TABLE dishes ADD COLUMN search_count INTEGER DEFAULT 1"))
                    logger.info("Added column 'search_count' to dishes table.")
                except Exception as col_err:
                    logger.warning(f"Could not add column 'search_count' to dishes: {col_err}")

    except Exception as e:
        logger.error(f"Error during database table initialization: {e}", exc_info=True)
