import os
from dotenv import load_dotenv
import googlemaps
from google import genai

load_dotenv(override=True)

GOOGLE_MAPS_API_KEY = os.getenv("GOOGLE_MAPS_API_KEY")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
YELP_API_KEY = os.getenv("YELP_API_KEY")
FOURSQUARE_API_KEY = os.getenv("FOURSQUARE_API_KEY")
DOCUMENU_API_KEY = os.getenv("DOCUMENU_API_KEY")

print("LOADED YELP KEY:", YELP_API_KEY[:10] if YELP_API_KEY else "NONE")

gmaps = googlemaps.Client(key=GOOGLE_MAPS_API_KEY) if GOOGLE_MAPS_API_KEY else None
ai_client = genai.Client(api_key=GEMINI_API_KEY) if GEMINI_API_KEY else None
