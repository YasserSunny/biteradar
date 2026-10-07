"""Firebase authentication dependencies for user-facing API routes."""
import os
from functools import lru_cache
from typing import Optional

import firebase_admin
from fastapi import Depends, Header, HTTPException
from firebase_admin import auth, credentials
from google.auth import exceptions as google_auth_exceptions

from logger import get_logger


logger = get_logger("auth")

AUTH_SERVICE_ERRORS = (
    auth.CertificateFetchError,
    auth.ConfigurationNotFoundError,
    auth.InsufficientPermissionError,
    auth.UnexpectedResponseError,
    google_auth_exceptions.DefaultCredentialsError,
    google_auth_exceptions.RefreshError,
    google_auth_exceptions.TransportError,
)


@lru_cache(maxsize=1)
def get_firebase_app():
    """Initialize Firebase once, using ADC in every environment."""
    try:
        return firebase_admin.get_app()
    except ValueError:
        project_id = os.getenv("FIREBASE_PROJECT_ID")
        options = {"projectId": project_id} if project_id else None
        return firebase_admin.initialize_app(credentials.ApplicationDefault(), options)


def verify_firebase_token(token: str) -> dict:
    """Verify standard Firebase ID-token claims without a revocation lookup."""
    return auth.verify_id_token(token, app=get_firebase_app(), check_revoked=False)


def optional_user(authorization: Optional[str] = Header(default=None)) -> Optional[str]:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=401, detail="Authentication required.")
    try:
        claims = verify_firebase_token(token.strip())
        uid = claims.get("uid") or claims.get("sub")
        if not isinstance(uid, str) or not uid:
            raise ValueError("Token has no Firebase UID")
        return uid
    except AUTH_SERVICE_ERRORS as error:
        logger.error(
            "Firebase authentication service unavailable (%s)",
            type(error).__name__,
        )
        raise HTTPException(
            status_code=503,
            detail="Authentication service is temporarily unavailable.",
        ) from error
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials.")


def require_user(user_id: Optional[str] = Depends(optional_user)) -> str:
    if not user_id:
        raise HTTPException(status_code=401, detail="Authentication required.")
    return user_id


def verified_user_id(authenticated_uid: str, legacy_uid: Optional[str]) -> str:
    """Accept an absent/matching legacy ID, but never trust a conflicting one."""
    if legacy_uid and legacy_uid != authenticated_uid:
        raise HTTPException(status_code=403, detail="You cannot access another user's data.")
    return authenticated_uid
