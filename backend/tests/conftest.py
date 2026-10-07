"""Shared authenticated-user fixture; tests never contact live Firebase."""
import pytest
from fastapi import Request

from auth import require_user
from main import app


async def authenticated_test_user(request: Request) -> str:
    explicit = request.headers.get("X-Test-User")
    if explicit:
        return explicit
    path_user = request.path_params.get("user_id")
    if path_user:
        return path_user
    if request.method in {"POST", "PUT", "PATCH"}:
        try:
            body = await request.json()
            if isinstance(body, dict) and body.get("user_id"):
                return body["user_id"]
        except Exception:
            pass
    return "test-user"


@pytest.fixture(autouse=True)
def override_firebase_user():
    previous = app.dependency_overrides.get(require_user)
    app.dependency_overrides[require_user] = authenticated_test_user
    yield
    if previous is None:
        app.dependency_overrides.pop(require_user, None)
    else:
        app.dependency_overrides[require_user] = previous
