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
- Python 3.9+
- A Google Cloud Project with the Maps API and Generative Language API enabled.
- A Firebase Project for authentication.

### 1. Backend Setup
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```
Create a `.env` file in the `backend/` directory:
```env
GOOGLE_MAPS_API_KEY="your_maps_api_key_here"
GEMINI_API_KEY="your_gemini_api_key_here"
```
Start the backend server:
```bash
uvicorn main:app --reload --port 8000
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
