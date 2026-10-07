import logging
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import models
from auth import require_user
from database import get_db
from logger import RedactingFilter
from main import app
from maintenance.purge_provider_reviews import purge_reviews


@pytest.fixture
def security_client():
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    models.Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)

    def db_override():
        with sessions() as db:
            yield db

    previous_db = app.dependency_overrides.get(get_db)
    app.dependency_overrides[get_db] = db_override
    yield TestClient(app), sessions
    if previous_db is None:
        app.dependency_overrides.pop(get_db, None)
    else:
        app.dependency_overrides[get_db] = previous_db
    engine.dispose()


def test_health_and_photo_auth_exceptions_and_request_id(security_client):
    client, _ = security_client
    auth_override = app.dependency_overrides.pop(require_user)
    try:
        health = client.get("/health", headers={"X-Request-ID": "not-a-uuid"})
        assert health.status_code == 200
        assert health.headers["X-Request-ID"] != "not-a-uuid"
        assert client.get("/api/dishes/trending").status_code == 401
        # Public photo access reaches provider configuration rather than auth.
        assert client.get("/api/places/photo/example").status_code != 401
    finally:
        app.dependency_overrides[require_user] = auth_override


@pytest.mark.parametrize("token_error", [ValueError("expired"), RuntimeError("wrong project")])
def test_invalid_tokens_return_generic_401(security_client, token_error):
    client, _ = security_client
    auth_override = app.dependency_overrides.pop(require_user)
    try:
        with patch("auth.verify_firebase_token", side_effect=token_error):
            response = client.get(
                "/api/dishes/trending", headers={"Authorization": "Bearer bad-token"}
            )
        assert response.status_code == 401
        assert response.json()["detail"] == "Invalid authentication credentials."
    finally:
        app.dependency_overrides[require_user] = auth_override


def test_valid_token_claim_allows_protected_request(security_client):
    client, _ = security_client
    auth_override = app.dependency_overrides.pop(require_user)
    try:
        with patch("auth.verify_firebase_token", return_value={"uid": "alice"}):
            response = client.get(
                "/api/dishes/trending", headers={"Authorization": "Bearer valid-token"}
            )
        assert response.status_code == 200
    finally:
        app.dependency_overrides[require_user] = auth_override


def test_firebase_service_failure_returns_503_without_leaking_details(security_client):
    from google.auth.exceptions import DefaultCredentialsError

    client, _ = security_client
    auth_override = app.dependency_overrides.pop(require_user)
    try:
        with patch(
            "auth.verify_firebase_token",
            side_effect=DefaultCredentialsError("sensitive credential path"),
        ):
            response = client.get(
                "/api/dishes/trending",
                headers={"Authorization": "Bearer syntactically-valid-token"},
            )
        assert response.status_code == 503
        assert response.json()["detail"] == (
            "Authentication service is temporarily unavailable."
        )
        assert "sensitive" not in response.text
    finally:
        app.dependency_overrides[require_user] = auth_override


def test_conflicting_uid_and_cross_user_query_access(security_client):
    client, sessions = security_client
    conflict = client.post(
        "/api/profile",
        headers={"X-Test-User": "alice"},
        json={"user_id": "bob", "name": "Bob"},
    )
    assert conflict.status_code == 403

    with sessions() as db:
        query = models.SearchQuery(dish_name="Ramen", location="Queens")
        db.add(query)
        db.commit()
        db.refresh(query)
        db.add(models.SearchHistory(user_id="alice", query_id=query.id))
        db.commit()
        query_id = query.id
    assert client.get(
        f"/api/queries/{query_id}/recommendations", headers={"X-Test-User": "alice"}
    ).status_code == 200
    assert client.get(
        f"/api/queries/{query_id}/recommendations", headers={"X-Test-User": "bob"}
    ).status_code == 403


def test_redaction_filter_removes_tokens_keys_and_notes(monkeypatch):
    monkeypatch.setenv("YELP_API_KEY", "super-secret-provider-key")
    redactor = RedactingFilter()
    record = logging.LogRecord(
        "test", logging.INFO, __file__, 1,
        "Authorization: Bearer abc.def.ghi key=%s notes=private preference",
        ("super-secret-provider-key",), None,
    )
    assert redactor.filter(record)
    rendered = record.getMessage()
    assert "abc.def.ghi" not in rendered
    assert "super-secret-provider-key" not in rendered
    assert "private preference" not in rendered


def test_provider_review_cleanup_dry_run_execute_and_idempotency(tmp_path: Path):
    engine = create_engine("sqlite://")
    models.Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    with sessions() as db:
        db.add(models.Place(id="p1", name="Place", lat=1, lng=2))
        db.add_all([
            models.Review(place_id="p1", source="google", text="google text"),
            models.Review(place_id="p1", source="yelp", text="yelp text"),
            models.Review(place_id="p1", source="foursquare", text="keep me"),
        ])
        db.add(models.Recommendation(
            place_id="p1", name="Place", rating=4.5, total_reviews=10,
            reason="reason", helpful_quote="legacy provider sentence",
            lat=1, lng=2,
        ))
        db.commit()
        dry_run = purge_reviews(db)
        assert dry_run["total_rows"] == 2
        assert dry_run["legacy_quote_rows"] == 1
        assert db.query(models.Review).count() == 3
        assert "text" not in str(dry_run)

        audit = tmp_path / "audit.json"
        purge_reviews(db, audit_file=audit)
        result = purge_reviews(
            db,
            execute=True,
            audit_file=audit,
            now=datetime(2026, 10, 6, tzinfo=timezone.utc),
        )
        assert result["deleted_rows"] == 2
        assert result["cleared_legacy_quote_rows"] == 1
        assert db.query(models.Review).one().source == "foursquare"
        assert db.query(models.Recommendation).one().helpful_quote is None
        assert "google text" not in audit.read_text()
        purge_reviews(db, audit_file=audit)
        assert purge_reviews(db, execute=True, audit_file=audit)["deleted_rows"] == 0


def test_provider_review_cleanup_rejects_stale_audit(tmp_path: Path):
    engine = create_engine("sqlite://")
    models.Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    with sessions() as db:
        db.add(models.Place(id="p1", name="Place", lat=1, lng=2))
        db.add(models.Review(place_id="p1", source="google", text="first"))
        db.commit()
        audit = tmp_path / "audit.json"
        purge_reviews(db, audit_file=audit)
        db.add(models.Review(place_id="p1", source="yelp", text="new row"))
        db.commit()
        with pytest.raises(ValueError, match="no longer matches"):
            purge_reviews(db, execute=True, audit_file=audit)
        assert db.query(models.Review).count() == 2
