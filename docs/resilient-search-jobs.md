# Resilient searches for mobile browsers

The failing iPhone Chrome request reached Firebase App Hosting at 03:13:01 UTC and ended after 46.9 seconds without a recorded response status. The backend completed its five recommendations about 6.5 seconds later. This establishes that results were ready after the browser-facing request had ended; it does not establish which layer closed the connection.

The frontend now submits a job and polls its status with short requests instead of waiting for generation in one connection. The existing `/api/search` endpoint remains available for older clients.

## Behavior

- `POST /api/search-jobs` accepts the usual search body and an `Idempotency-Key` UUID header. It returns HTTP 202 with `job_id`, `status`, `results`, and `error`. It does not run providers in the submission request.
- `GET /api/search-jobs/{id}` reads persisted queued/running/completed/failed state. Both responses use `Cache-Control: no-store`. Results include successful empty lists.
- IDs are unguessable capability URLs; do not publish them. Existing user-ID authentication limitations are unchanged. Jobs store the original input, including history attribution, and expire after one day. Expired rows are removed on later submissions.
- Every submission retry uses the same ID and input. Conflicting reuse returns 409. A successful worker result is durable, so polling/reloading never reruns providers.
- The frontend retries temporary network failures, 408/429 and server errors. Each request has a 15-second deadline. Six consecutive failures show a reconnect message; retrying the same search reconnects to the saved ID. The polling session stops after 20 minutes without discarding that ID.
- Pending input and ID are kept in sessionStorage per user. A reload resumes the job. Home reset, choosing history, or starting another search supersedes the UI's pending job; the server may still finish already-started work. Unavailable browser storage permits ordinary searches/retries but prevents reload recovery.
- Search feedback remains timed estimates rather than streamed backend phases.

## Worker execution

Local development uses a four-thread worker with the existing SQLite database. Cloud Run defaults to Cloud Tasks; local threads are intentionally rejected on Cloud Run because CPU can be throttled after a response and instances can shut down.

Cloud Tasks delivers an authenticated request directly to the backend `/api/internal/search-jobs/run`. The endpoint verifies the Google-signed OIDC token, audience, verified email, and exact configured service account; a forged queue header is insufficient. The worker uses its own database session and a conditional database lease. Active duplicate deliveries return 503 for retry, completed/failed deliveries are acknowledged, and interrupted workers can be reclaimed after a 15-minute lease. A lease token prevents late workers overwriting newer results. As with any at-least-once queue, a process crash during provider calls can require repeating some work; exactly-once external calls are not guaranteed.

## Required production setup

**Configure this before deploying the new frontend.** The backend requires a shared PostgreSQL `DATABASE_URL`; instance-local SQLite cannot share status between Cloud Run workers. Existing startup migrations create the additive `search_jobs` table. Existing search/history tables are retained.

Backend environment:

```env
SEARCH_JOB_EXECUTOR=cloud_tasks
SEARCH_TASK_QUEUE=projects/biteradar-508416/locations/europe-west1/queues/biteradar-searches
SEARCH_WORKER_URL=https://biteradar-493220793264.europe-west1.run.app
SEARCH_TASK_SERVICE_ACCOUNT=biteradar-search-worker@biteradar-508416.iam.gserviceaccount.com
```

`SEARCH_WORKER_URL` is the backend base URL, with no `/api` suffix. The production runtime uses Application Default Credentials; do not add service-account key files.

Example setup with Google Cloud CLI (run by an operator with the required permissions):

```sh
gcloud services enable cloudtasks.googleapis.com --project=biteradar-508416

gcloud iam service-accounts create biteradar-search-worker \
  --project=biteradar-508416 --display-name="BiteRadar search task caller"

gcloud tasks queues create biteradar-searches \
  --project=biteradar-508416 --location=europe-west1 \
  --max-concurrent-dispatches=4 --max-dispatches-per-second=4 \
  --min-backoff=5s --max-backoff=60s --max-attempts=100 --max-retry-duration=3600s

# Read the service's runtime identity; verify this is a nonempty email.
search_runtime_account=$(gcloud run services describe biteradar \
  --project=biteradar-508416 --region=europe-west1 \
  --format='value(spec.template.spec.serviceAccountName)')

gcloud projects add-iam-policy-binding biteradar-508416 \
  --member="serviceAccount:${search_runtime_account}" --role=roles/cloudtasks.enqueuer

gcloud iam service-accounts add-iam-policy-binding \
  biteradar-search-worker@biteradar-508416.iam.gserviceaccount.com \
  --project=biteradar-508416 \
  --member="serviceAccount:${search_runtime_account}" --role=roles/iam.serviceAccountUser

gcloud run services add-iam-policy-binding biteradar \
  --project=biteradar-508416 --region=europe-west1 \
  --member=serviceAccount:biteradar-search-worker@biteradar-508416.iam.gserviceaccount.com \
  --role=roles/run.invoker

gcloud run services update biteradar \
  --project=biteradar-508416 --region=europe-west1 --timeout=600 \
  --update-env-vars=SEARCH_JOB_EXECUTOR=cloud_tasks,SEARCH_TASK_QUEUE=projects/biteradar-508416/locations/europe-west1/queues/biteradar-searches,SEARCH_WORKER_URL=https://biteradar-493220793264.europe-west1.run.app,SEARCH_TASK_SERVICE_ACCOUNT=biteradar-search-worker@biteradar-508416.iam.gserviceaccount.com
```

If the queue/service account already exists, verify/update it rather than creating it again. Ensure the Google-managed Cloud Tasks service agent has its normal `roles/cloudtasks.serviceAgent` role so it can mint OIDC tokens. Verify queue project/region, runtime IAM identity, shared database, and URLs against the actual deployment before running these commands. `DATABASE_URL` should remain configured through the existing secret/environment mechanism.

Deploy backend first and verify a job reaches completed/failed status through Cloud Tasks. Then deploy the frontend (Firebase App Hosting backend `biteradar-web` in project `biteradar-626ac`), keeping its existing upstream configuration. Do not route worker tasks through Firebase App Hosting. Missing queue configuration or a production SQLite database returns a clear 503 rather than silently accepting unusable work.

The task request deadline and backend request timeout are ten minutes; hosting deadlines are independent of browser polling. Configure alerts for queue failures and worker 401/503 responses. Completed jobs are safe to redeliver. Rolling the frontend back can use the unchanged legacy search endpoint; retain the additive table until pending tasks have drained.

## Verification

Backend tests cover immediate acceptance, duplicate submissions, input conflicts, terminal errors/empty results, independent sessions, duplicate worker deliveries, lease recovery/fencing, dispatch failures, expiry, OIDC identity checks, task construction and refusal of instance-local production databases.

Validation: 61 backend tests and 19 browser scenarios passed (including focused reruns), plus production build, lint, TypeScript and formatting checks. A mobile-layout search completed after 53 seconds through short polls with a single submission. Android Chrome / Pixel 7 and iPhone WebKit / iPhone 13 emulation also passed against the real local job API: submissions took 24–41ms, each loaded five cached results, touch details and all three progress steps worked, and no API network failures or JavaScript errors occurred. Authentication was simulated only in the test browser.

Browser tests cover lost submission responses, lost polling responses, reload recovery with the same ID, superseding/cancelling work, and the existing discovery/auth/layout flows. Local end-to-end worker checks use real cached restaurant results; queue construction/OIDC are tested with mocks. Production queue delivery cannot be verified in this workspace: Google Cloud CLI and an authenticated deployment connection are not provided. The production backend already uses PostgreSQL; keep its existing DATABASE_URL.

References: [Cloud Run with Cloud Tasks](https://docs.cloud.google.com/run/docs/triggering/using-tasks), [Cloud Tasks OIDC delivery](https://docs.cloud.google.com/tasks/docs/samples/cloud-tasks-create-http-task-with-token), [Cloud Run CPU allocation](https://docs.cloud.google.com/run/docs/configuring/billing-settings).
