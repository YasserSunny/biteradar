from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool
import models
from database import get_db
from main import app
from routers import search_jobs as jobs

task_dispatch = jobs.dispatch


@pytest.fixture
def setup(monkeypatch):
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    models.Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine)
    monkeypatch.setattr(jobs, 'SessionLocal', sessions)
    monkeypatch.setenv('SEARCH_JOB_EXECUTOR', 'local')
    monkeypatch.delenv('K_SERVICE', raising=False)
    def dependency():
        with sessions() as db:
            yield db
    app.dependency_overrides[get_db] = dependency
    with patch.object(jobs, 'dispatch') as dispatch:
        yield TestClient(app), sessions, dispatch
    app.dependency_overrides.pop(get_db, None)
    engine.dispose()


def submit(client, key=None, **change):
    key = key or str(uuid4())
    response = client.post('/api/search-jobs', headers={'Idempotency-Key': key},
                           json={'dish_name': 'Mango smoothie', 'location': 'Roswell', **change})
    return response, key


def test_submission_is_short_and_retries_reuse_one_job(setup):
    client, sessions, _ = setup
    with patch.object(jobs, 'search_dish') as search:
        first, key = submit(client)
        second, _ = submit(client, key)
    assert first.status_code == second.status_code == 202
    assert first.json()['job_id'] == second.json()['job_id'] == key
    search.assert_not_called()
    with sessions() as db:
        assert db.query(models.SearchJob).count() == 1
    assert first.headers['cache-control'] == 'no-store'


def test_idempotency_conflict_and_validation(setup):
    client, _, _ = setup
    _, key = submit(client)
    assert submit(client, key, location='Atlanta')[0].status_code == 409
    assert submit(client, 'invalid')[0].status_code == 400
    assert submit(client, dish_name=' ')[0].status_code == 400


def test_result_survives_new_sessions_and_duplicate_worker_delivery(setup):
    client, _, _ = setup
    _, key = submit(client)
    results = [{'id': '1', 'name': 'Smoothie cafe', 'query_id': 7}]
    with patch.object(jobs, 'search_dish', return_value=results) as search:
        jobs.run_job(key)
        jobs.run_job(key)
        repeat, _ = submit(client, key)
    search.assert_called_once()
    fetched = client.get('/api/search-jobs/' + key)
    assert fetched.json()['status'] == repeat.json()['status'] == 'completed'
    assert fetched.json()['results'] == results
    assert fetched.headers['cache-control'] == 'no-store'


def test_worker_reports_failure_and_empty_results(setup):
    client, _, _ = setup
    _, key = submit(client)
    with patch.object(jobs, 'search_dish', side_effect=HTTPException(503, 'Provider unavailable')):
        jobs.run_job(key)
    assert client.get('/api/search-jobs/' + key).json()['error'] == 'Provider unavailable'
    _, empty = submit(client)
    with patch.object(jobs, 'search_dish', return_value=[]):
        jobs.run_job(empty)
    assert client.get('/api/search-jobs/' + empty).json()['results'] == []


def test_active_lease_rejects_duplicates_and_expired_lease_recovers(setup):
    client, sessions, _ = setup
    _, key = submit(client)
    with sessions() as db:
        job = db.get(models.SearchJob, key)
        job.status = 'running'
        job.lease_until = jobs.utcnow() + timedelta(minutes=1)
        db.commit()
    with pytest.raises(HTTPException) as error:
        jobs.run_job(key)
    assert error.value.status_code == 503
    with sessions() as db:
        db.get(models.SearchJob, key).lease_until = jobs.utcnow() - timedelta(seconds=1)
        db.commit()
    with patch.object(jobs, 'search_dish', return_value=[]):
        jobs.run_job(key)
    assert client.get('/api/search-jobs/' + key).json()['status'] == 'completed'


def test_dispatch_failure_allows_retry_with_same_id(setup):
    client, sessions, dispatch = setup
    dispatch.side_effect = RuntimeError('queue unavailable')
    first, key = submit(client)
    assert first.status_code == 503
    dispatch.side_effect = None
    assert submit(client, key)[0].status_code == 202
    with sessions() as db:
        assert db.query(models.SearchJob).count() == 1


def test_expiry_and_cloud_run_configuration_fail_closed(setup, monkeypatch):
    client, sessions, _ = setup
    _, key = submit(client)
    with sessions() as db:
        db.get(models.SearchJob, key).expires_at = jobs.utcnow() - timedelta(seconds=1)
        db.commit()
    assert client.get('/api/search-jobs/' + key).status_code == 404
    with patch.object(jobs, 'search_dish') as search:
        jobs.run_job(key)
        search.assert_not_called()
    monkeypatch.setenv('K_SERVICE', 'cloud-run')
    assert submit(client)[0].status_code == 503


def test_internal_worker_rejects_wrong_identity(setup):
    client, _, _ = setup
    with patch.object(jobs, 'task_settings', return_value=('queue', 'https://worker.run.app', 'worker@example.com')):
        assert client.post('/api/internal/search-jobs/run', json={'job_id': str(uuid4())}).status_code == 401
        with patch('google.oauth2.id_token.verify_oauth2_token', return_value={'email': 'attacker@example.com', 'email_verified': True}):
            response = client.post('/api/internal/search-jobs/run', headers={'Authorization': 'Bearer token'}, json={'job_id': str(uuid4())})
    assert response.status_code == 401


def test_cloud_task_dispatch_uses_named_task_oidc_and_worker_deadline(setup, monkeypatch):
    import base64
    import json
    _, _, _ = setup
    monkeypatch.setenv('SEARCH_JOB_EXECUTOR', 'cloud_tasks')
    key = str(uuid4())
    queue = 'projects/backend/locations/europe-west1/queues/searches'
    with patch.object(jobs, 'task_settings', return_value=(queue, 'https://worker.run.app', 'worker@example.com')), patch('google.auth.default', return_value=(object(), 'backend')), patch('google.auth.transport.requests.AuthorizedSession') as transport:
        client = transport.return_value.__enter__.return_value
        client.post.return_value.status_code = 409
        task_dispatch(key)
    url = client.post.call_args.args[0]
    task = client.post.call_args.kwargs['json']['task']
    assert url == f'https://cloudtasks.googleapis.com/v2/{queue}/tasks'
    assert task['name'].endswith('search-' + key)
    assert task['dispatchDeadline'] == '600s'
    assert task['httpRequest']['oidcToken']['audience'] == 'https://worker.run.app'
    assert json.loads(base64.b64decode(task['httpRequest']['body'])) == {'job_id': key}


def test_valid_worker_identity_runs_job(setup):
    client, _, _ = setup
    key = str(uuid4())
    with patch.object(jobs, 'task_settings', return_value=('queue', 'https://worker.run.app', 'worker@example.com')), patch('google.oauth2.id_token.verify_oauth2_token', return_value={'email': 'worker@example.com', 'email_verified': True}), patch.object(jobs, 'run_job') as run:
        response = client.post('/api/internal/search-jobs/run', headers={'Authorization': 'Bearer token'}, json={'job_id': key})
    assert response.status_code == 200
    run.assert_called_once_with(key)


def test_late_worker_cannot_overwrite_new_lease(setup):
    client, sessions, _ = setup
    _, key = submit(client)
    def other_worker(*args):
        with sessions() as db:
            db.get(models.SearchJob, key).lease_token = 'another-lease'
            db.commit()
        return [{'id': 'old'}]
    with patch.object(jobs, 'search_dish', side_effect=other_worker):
        jobs.run_job(key)
    result = client.get('/api/search-jobs/' + key).json()
    assert result['status'] == 'running'
    assert result['results'] is None


def test_cloud_tasks_rejects_instance_local_database(setup, monkeypatch):
    client, _, _ = setup
    monkeypatch.setenv('SEARCH_JOB_EXECUTOR', 'cloud_tasks')
    monkeypatch.setenv('SEARCH_TASK_QUEUE', 'projects/backend/locations/europe-west1/queues/searches')
    monkeypatch.setenv('SEARCH_WORKER_URL', 'https://worker.run.app')
    monkeypatch.setenv('SEARCH_TASK_SERVICE_ACCOUNT', 'worker@example.com')
    assert submit(client)[0].status_code == 503
