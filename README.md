# Biteradar 🍕🎯

Biteradar is an AI-powered restaurant discovery web application designed to help users find the best restaurants for a *specific dish* they are craving, rather than just general restaurant ratings. It utilizes the Google Maps API for geocoding and fetching restaurant reviews, and the Google Gemini LLM to analyze the sentiment of those reviews and rank the restaurants accordingly.

## Features Implemented So Far

- **Modern Web Interface**: Built with Next.js 15, React 19, and Tailwind CSS.
- **Google Maps Integration**:
  - Interactive map using `@vis.gl/react-google-maps`.
  - Geocoding and Place Search via the Google Maps Python Client in the backend.
  - Live Location Autocomplete widget to easily select cities and zip codes.
- **AI-Powered Ranking**:
  - Backend integration with Google Gemini 3.6 Flash.
  - The AI reads through the latest Google reviews of nearby restaurants, specifically searching for mentions of the user's craved dish.
  - Generates a customized 1-2 sentence justification for why the restaurant is recommended for that specific dish.
- **Relational Database**: 
  - Integrated SQLite (via SQLAlchemy) to store user search queries and LLM-generated recommendations.
- **User Feedback Loop**: 
  - Users can rate the AI's recommendations with "Thumbs Up" or "Thumbs Down".
  - Feedback is securely saved in the database, laying the groundwork for training a future custom machine learning recommendation model.
- **Search Caching**:
  - To minimize API costs, identical searches (same dish, same location) bypass the Google and Gemini APIs and instantly return cached recommendations directly from the database.
- **Authentication**:
  - Secured the app using Firebase Authentication (Google Sign-In). 
  - Users must log in with their Google account before they can perform searches or leave feedback.

## Tech Stack

### Frontend
- **Framework**: Next.js (App Router), React
- **Styling**: Tailwind CSS
- **Authentication**: Firebase Auth
- **Mapping**: `@vis.gl/react-google-maps`

### Backend
- **Framework**: FastAPI (Python)
- **Database**: SQLite (SQLAlchemy ORM)
- **APIs**: Google Maps API, Google Generative AI (Gemini) API

## Getting Started

### Prerequisites
- Node.js & npm
- Python 3.12
- A Google Cloud Project with the Maps API and Generative Language API enabled.
- A Firebase Project for authentication.

### 1. Backend Setup
```bash
cd backend
uv sync --frozen
```
Create a `.env` file in the `backend/` directory:
```env
GOOGLE_MAPS_API_KEY="your_maps_api_key_here"
GEMINI_API_KEY="your_gemini_api_key_here"
FIREBASE_PROJECT_ID="your_firebase_project_id"
```
Firebase Admin validates browser ID tokens using Application Default
Credentials (ADC). For local development, run `gcloud auth
application-default login` with access to the Firebase project. Cloud Run uses
its attached service account; never download or commit a service-account JSON
file.

Start the backend server:
```bash
uv run uvicorn main:app --reload --port 8000
```

### 2. Frontend Setup
```bash
cd frontend
npm install
```
Create a `.env.local` file in the `frontend/` directory:
```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY="your_maps_api_key_here"
NEXT_PUBLIC_FIREBASE_API_KEY="your_firebase_api_key"
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN="your_firebase_auth_domain"
NEXT_PUBLIC_FIREBASE_PROJECT_ID="your_firebase_project_id"
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET="your_firebase_storage_bucket"
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID="your_firebase_messaging_sender_id"
NEXT_PUBLIC_FIREBASE_APP_ID="your_firebase_app_id"
```
Start the frontend server (Webpack is recommended for this environment):
```bash
npm run dev -- --webpack
```

Navigate to `http://localhost:3000` to log in and start searching!

### Verification

Run the same checks used by GitHub Actions:

```bash
cd backend && uv sync --frozen && uv run pytest -q
cd ../frontend && npm ci
npm run lint && npm run typecheck && npm run format:check && npm run build
npx playwright install chrome && npm run test:e2e
```

Every user-facing API route requires a Firebase bearer token except `/health`
and `/api/places/photo/*`. The Cloud Tasks worker keeps its separate OIDC
identity check. Responses include `X-Request-ID`; clients may send a UUID in
that header to correlate a request.

### Provider review retention cleanup

Google and Yelp review text is used transiently during a live ranking request
and is not stored. Recommendation explanations may include a generated summary
of recurring review signals, but never an exact provider quote. After deploying
this version, inspect the cleanup without changing data:

```bash
cd backend
uv run python -m maintenance.purge_provider_reviews \
  --audit-file ./provider-review-purge-audit.json
```

Inspect and securely retain that text-free audit. Then run the deletion manually
against the same resolved production `DATABASE_URL`; execution stops if the
database counts no longer match the confirmed audit:

```bash
uv run python -m maintenance.purge_provider_reviews \
  --execute --audit-file ./provider-review-purge-audit.json
```

The audit contains only source, place ID, counts, the number of legacy quote
fields to clear, and deletion time. Execution deletes Google/Yelp review rows
and clears legacy recommendation quotes. Keep the audit in your secure
operations records and do not commit it. Foursquare rows are not changed
pending a separate retention-rights review. Provider telemetry emits
`provider`, `operation`, `duration_ms`, `status`, `category`, `timeout`,
`quota_response`, and `request_id`; these are the fields to use for quota and
cost alerts in the dashboard PR. If the old Yelp key prefix appeared in any
deployed logs, rotate that key before rollout.

### Testing from a phone

The browser sends API requests to the frontend's `/api` routes. Next.js forwards them to `API_BACKEND_URL` (default `http://127.0.0.1:8000`); the backend can stay bound to the laptop's loopback interface. The previous `NEXT_PUBLIC_API_BASE_URL` setting is accepted as a server-side fallback.

Start the frontend on the local network:

```bash
DEV_ALLOWED_ORIGINS=<laptop-LAN-IP> npm run dev -- --hostname 0.0.0.0 --port 3000
```

Replace `<laptop-LAN-IP>` with the laptop's Wi-Fi address. With both devices on the same Wi-Fi, open `http://<laptop-LAN-IP>:3000` on the phone. Allow the frontend port through the laptop firewall if needed. `DEV_ALLOWED_ORIGINS` permits development assets for that hostname; it accepts comma-separated hostnames without schemes or ports. For deployment, set `API_BACKEND_URL` to the backend URL before building and rebuild/restart after changing it. HTTPS frontends can proxy HTTP backends without browser mixed-content requests.

Firebase sign-in and Google Maps still require their own authorized domains/key restrictions. Browser geolocation requires HTTPS (except on localhost); use manual location entry when testing over a LAN HTTP address.

### Resilient search jobs

New searches return a job ID and poll for results, allowing reconnects after mobile connection failures. Local development runs jobs automatically. **Production requires Cloud Tasks and a shared PostgreSQL database before deploying the frontend.** See [worker setup and rollout](docs/resilient-search-jobs.md).
