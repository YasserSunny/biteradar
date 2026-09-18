"""Short browser requests backed by durable jobs and authenticated Cloud Tasks."""
import base64
import json
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from sqlalchemy import and_, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from pydantic import BaseModel

import models
from database import SessionLocal, get_db
from logger import get_logger
from routers.search import search_dish
from schemas import SearchRequest

router = APIRouter(prefix="/api", tags=["search jobs"])
logger = get_logger("routers.search_jobs")
local_workers = ThreadPoolExecutor(max_workers=4, thread_name_prefix="search-job")


def utcnow():
    return datetime.now(timezone.utc)


def expired(job):
    expiry = job.expires_at
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    return expiry < utcnow()


def executor_mode():
    mode = os.getenv("SEARCH_JOB_EXECUTOR", "cloud_tasks" if os.getenv("K_SERVICE") else "local")
    if mode not in {"local", "cloud_tasks"} or (mode == "local" and os.getenv("K_SERVICE")):
        raise HTTPException(503, "Search worker configuration is unavailable.")
    return mode


def task_settings():
    queue = os.getenv("SEARCH_TASK_QUEUE", "")
    worker_url = os.getenv("SEARCH_WORKER_URL", "").rstrip("/")
    account = os.getenv("SEARCH_TASK_SERVICE_ACCOUNT", "")
    if not queue or not worker_url.startswith("https://") or not account:
        raise HTTPException(503, "Search worker configuration is unavailable.")
    if SessionLocal.kw["bind"].dialect.name == "sqlite":
        raise HTTPException(503, "Search workers require a shared production database.")
    return queue, worker_url, account


def dispatch(job_id):
    if executor_mode() == "local":
        local_workers.submit(run_job, job_id)
        return
    import google.auth
    from google.auth.transport.requests import AuthorizedSession

    queue, worker_url, account = task_settings()
    credentials, _ = google.auth.default(scopes=["https://www.googleapis.com/auth/cloud-platform"])
    task = {
        "name": f"{queue}/tasks/search-{job_id}",
        "dispatchDeadline": "600s",
        "httpRequest": {
            "httpMethod": "POST",
            "url": worker_url + "/api/internal/search-jobs/run",
            "headers": {"Content-Type": "application/json"},
            "body": base64.b64encode(json.dumps({"job_id": job_id}).encode()).decode(),
            "oidcToken": {"serviceAccountEmail": account, "audience": worker_url},
        },
    }
    with AuthorizedSession(credentials) as client:
        result = client.post(f"https://cloudtasks.googleapis.com/v2/{queue}/tasks", json={"task": task}, timeout=10)
        if result.status_code != 409:  # Named tasks make dispatch retries idempotent.
            result.raise_for_status()


def job_payload(job):
    return {
        "job_id": job.id,
        "status": job.status,
        "results": json.loads(job.result_json) if job.status == "completed" else None,
        "error": job.error if job.status == "failed" else None,
    }


@router.post("/search-jobs", status_code=202)
def create_job(request: SearchRequest, response: Response,
               idempotency_key: str = Header(alias="Idempotency-Key"),
               db: Session = Depends(get_db)):
    try:
        job_id = str(UUID(idempotency_key))
    except ValueError:
        raise HTTPException(400, "Invalid search request ID.")
    if not request.dish_name.strip() or not request.location.strip():
        raise HTTPException(400, "Enter a dish and a location.")
    # Validate configuration before accepting a job that cannot run.
    if executor_mode() == "cloud_tasks":
        task_settings()
    payload = json.dumps(request.model_dump(), sort_keys=True)
    job = db.get(models.SearchJob, job_id)
    if not job:
        # Keep completed results for one day; prune expired jobs on submissions.
        db.query(models.SearchJob).filter(models.SearchJob.expires_at < utcnow()).delete(synchronize_session=False)
        job = models.SearchJob(id=job_id, request_json=payload, status="queued",
                               expires_at=utcnow() + timedelta(days=1))
        db.add(job)
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            job = db.get(models.SearchJob, job_id)
    if expired(job):
        raise HTTPException(404, "This search has expired. Please search again.")
    if job.request_json != payload:
        raise HTTPException(409, "This search request ID is already in use.")
    if job.status == "queued":
        try:
            dispatch(job_id)
        except HTTPException:
            raise
        except Exception:
            logger.exception("Could not dispatch search job %s", job_id)
            raise HTTPException(503, "Could not start the search. Please try again.")
    response.headers["Cache-Control"] = "no-store"
    # The task can finish concurrently; refresh to reflect its persisted status.
    db.refresh(job)
    return job_payload(job)


@router.get("/search-jobs/{job_id}")
def get_job(job_id: str, response: Response, db: Session = Depends(get_db)):
    job = db.get(models.SearchJob, job_id)
    if not job or expired(job):
        raise HTTPException(404, "This search has expired. Please search again.")
    response.headers["Cache-Control"] = "no-store"
    return job_payload(job)


def run_job(job_id):
    """Claim a lease; duplicates wait while an active worker owns the job."""
    token = str(uuid4())
    with SessionLocal() as db:
        job = db.get(models.SearchJob, job_id)
        if not job or expired(job) or job.status in {"completed", "failed"}:
            return
        claimed = db.query(models.SearchJob).filter(
            models.SearchJob.id == job_id,
            models.SearchJob.expires_at > utcnow(),
            or_(models.SearchJob.status == "queued", and_(
                models.SearchJob.status == "running", models.SearchJob.lease_until < utcnow()))
        ).update({"status": "running", "lease_token": token,
                  "lease_until": utcnow() + timedelta(minutes=15)}, synchronize_session=False)
        db.commit()
        if not claimed:
            raise HTTPException(503, "Search worker is already running. Retry later.")
        db.refresh(job)
        request = SearchRequest.model_validate_json(job.request_json)
        try:
            results = search_dish(request, db)
            update = {"status": "completed", "result_json": json.dumps([
                item.model_dump() if hasattr(item, "model_dump") else item for item in results
            ]), "error": None}
        except HTTPException as error:
            db.rollback()
            update = {"status": "failed", "error": str(error.detail)}
        except Exception:
            db.rollback()
            logger.exception("Search job %s failed", job_id)
            update = {"status": "failed", "error": "Search could not be completed. Please try again."}
        # A late worker must not overwrite a newer worker's lease/result.
        db.query(models.SearchJob).filter(models.SearchJob.id == job_id,
                                         models.SearchJob.lease_token == token).update(update, synchronize_session=False)
        db.commit()


class WorkerRequest(BaseModel):
    job_id: str


@router.post("/internal/search-jobs/run", include_in_schema=False)
def run_task(request: WorkerRequest, authorization: str = Header(default="")):
    from google.auth.transport.requests import Request
    from google.oauth2 import id_token

    _, worker_url, account = task_settings()
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Worker authentication required.")
    try:
        claims = id_token.verify_oauth2_token(authorization[7:], Request(), audience=worker_url)
        if claims.get("email") != account or claims.get("email_verified") is not True:
            raise ValueError("Wrong worker identity")
    except Exception:
        raise HTTPException(401, "Invalid worker identity.")
    run_job(request.job_id)
    return {"ok": True}
