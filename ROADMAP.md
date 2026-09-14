# BiteRadar - Product Roadmap & Next Steps

This document tracks completed milestones and outlines upcoming features, infrastructure improvements, and product directions for **BiteRadar**.

---

## 🎯 Current Status (Completed Milestones)

- [x] **Full-Stack Architecture**: Next.js 16 frontend + FastAPI backend.
- [x] **AI Recommendation Engine**: Gemini 3.6 Flash integration with graceful fallback heuristic.
- [x] **Multi-Provider Data Aggregation**: Google Places API + Yelp Fusion API + customer review sentiment.
- [x] **Dual-Engine Database**: PostgreSQL support via `DATABASE_URL` (production) + SQLite (local development).
- [x] **Production Cloud Deployment (Option 3)**:
  - Backend deployed to **Google Cloud Run** with Docker and `uv`.
  - Frontend deployed to **Firebase App Hosting**.
  - Managed PostgreSQL on Neon.
- [x] **Brand Identity & Logo**:
  - Custom artistic logo (Solid Red Geo Pin, Golden-Amber Radar Waves, Warm Orange Bowl).
  - Inline vector SVG components for instant, zero-cache rendering.
  - Multi-resolution Chrome tab favicons (`icon.svg`, `icon.png`, `favicon.ico`).
- [x] **Phase 4: Strategic Data Source Expansions (Completed & Deployed)**:
  - Foursquare Places API integration with live diner tips synthesized into Gemini recommendations.
  - Keyless OpenStreetMap Overpass community dietary badges (Halal, Vegan, Gluten-Free) and amenities.
  - Itemized dish pricing heuristics (`~$12 - $18`) and Documenu support.
  - Geographic Haversine distance bounding (60 km) & coordinate synchronization.
  - Custom touch-friendly map zoom controls (+/-) and tab resize stabilization.
- [x] **Phase 2: Mobile Experience, Discoverability & Multi-Provider Auth (Completed & Merged)**:
  - Progressive Web App (PWA) manifest and responsive icon suite (192px, 512px, maskable, Apple touch icon).
  - Open Graph 1200x630 and Twitter preview cards with branded graphics and dynamic title templates.
  - Two-way deep linking URL synchronization (`/?dish=...&loc=...`) with automatic search execution.
  - Native Web Share API (`navigator.share`) and animated clipboard toast copy actions.
  - Multi-Provider Auth: Email/Password (Sign In, Sign Up, Forgot Password), Google, and Apple ID & Outlook/Microsoft UI suite.
- [x] **Phase 5: Core Feature Enhancements & Dishes Catalog (Completed & Tested)**:
  - Dedicated `dishes` database catalog tracking popularity, timestamps, and primary photos.
  - 1-Click interactive "🔥 Trending Craves" chips in search header (`GET /api/dishes/trending`).
  - Dietary quick filter chips (Vegan, Halal, Vegetarian, Gluten-Free, Kosher, Dairy-Free).
  - Price tier (`$`, `$$`, `$$$`, `$$$$`) and distance radius selectors.
  - Google Places photo proxy `GET /api/places/photo/{ref}` with 30-day cache headers and visual card headers.
  - 1-Click direct delivery (`🛵 Order`) and reservation (`📅 Reserve`) deep links.
  - Interactive AI Foodie Concierge (`POST /api/chat`) with grounded restaurant citation tags.


---

## 🚀 Phase 1: Brand & Domain Setup

- [ ] **Custom Domain Acquisition**
  - Select and purchase a domain (e.g., `biteradar.app`, `getbiteradar.com`, `biteradar.co`, `biteradar.io`).
  - Recommended registrars: Cloudflare Registrar (wholesale cost, zero markup) or Porkbun.
- [ ] **Connect Domain to Firebase App Hosting**
  - Add custom domain in Firebase Console -> App Hosting.
  - Configure DNS A/CNAME records at your domain registrar.
  - Automatic Google Trust Services SSL certificate provisioning.
- [ ] **Authorize Custom Domain for Google Sign-In**
  - Add the custom domain to Firebase Console -> Authentication -> Settings -> Authorized Domains.
- [ ] **Custom Backend Subdomain (`api.yourdomain.com`)**
  - Map Cloud Run service to `api.yourdomain.com` for unified branding.
  - Update `NEXT_PUBLIC_API_BASE_URL` and backend `ALLOWED_ORIGINS`.

---

## 📱 Phase 2: Mobile Experience, Discoverability & Multi-Provider Auth [COMPLETED & MERGED]

- [x] **Progressive Web App (PWA) Support**
  - Added Web App Manifest (`manifest.webmanifest`) with app name, theme color (`#ea580c`), and standalone display.
  - Generated full responsive icon suite: 192x192, 512x512, 512x512 maskable, and 180x180 Apple touch icon.
  - Enabled "Add to Home Screen" on iOS Safari and Android Chrome for a native app feel.
- [x] **SEO & Social Share Preview Cards (Open Graph / Twitter)**
  - Created high-resolution 1200x630 social share preview images (`og:image`, `opengraph-image.png`).
  - Added rich meta tags (`og:title`, `og:description`, `twitter:card`) and viewport theme colors in `layout.tsx`.
- [x] **Dynamic Page Titles & Shareable Dish URLs (Deep Linking)**
  - Implemented two-way URL parameter synchronization (`/?dish=...&loc=...`).
  - Automated search execution on shared URL visits.
  - Dynamic document titles (`${dish} in ${location} | BiteRadar`).
  - Native Web Share API (`navigator.share`) on mobile with clipboard toast fallback on desktop.
- [x] **Multi-Provider Authentication Suite**
  - Full Email & Password login, signup, password visibility toggle, and password recovery email flow.
  - Google Sign-In integration.
  - Apple ID and Outlook / Microsoft sign-in buttons with friendly status notifications.

---

## 📊 Phase 3: Analytics & User Insights

- [ ] **Privacy-Friendly Web Analytics**
  - Integrate Google Analytics 4, Plausible, or PostHog.
  - Track user search conversion, popular dish keywords, and filter usage without collecting invasive PII.
- [ ] **User Feedback & Curation Analytics**
  - Dashboard to monitor thumbs up / thumbs down recommendations.
  - Identify search queries where users felt recommendations were missing or exceptionally good.
- [ ] **Trending Food Radar**
  - "What's trending today in [City]" section highlighting dishes frequently searched by local users.

---

## 🌐 Phase 4: Strategic Data Source Expansions [COMPLETED & DEPLOYED]

- [x] **Foursquare Places API Integration (Dish Tips & Free Credits)**
  - Connected Foursquare Places API v3 for venue discovery and top diner tips.
  - Tips synthesized in Gemini 3.6 Flash prompt to surface authentic quotes.
  - Database persistence in `reviews` table (`source="foursquare"`).
  - Built-in circuit breaker to gracefully bypass 429 quota exhaustion.
- [x] **Itemized Menus & Dish Pricing (Documenu / Delivery Feeds)**
  - Added Documenu provider support and dish price parsing.
  - Intelligent fallback pricing heuristics (`~$12 - $18`) rendered directly on restaurant cards.
- [x] **OpenStreetMap (OSM) Integration for Zero-Cost Dietary & Amenity Tags**
  - Keyless Overpass API queries around candidate restaurant coordinates.
  - Community tags extracted: `diet:vegan`, `diet:halal`, `diet:gluten_free`, `takeaway`, `delivery`, `outdoor_seating`.
- [x] **Geographic Distance Bounding & Coordinate Synchronization**
  - Strict 60 km Haversine cutoff to eliminate out-of-market results.
  - Direct coordinate propagation bypassing ambiguous string geocoding.
- [x] **Interactive Map Controls & Camera Stability**
  - Custom touch-friendly `+` / `−` zoom controls with proper street-level vs. city-level zoom.
  - Decoupled map bounds triggers to eliminate tab toggle jitter.

---

## 🍽️ Phase 5: Core Feature Enhancements [COMPLETED & TESTED]

- [x] **Dedicated Dishes Catalog & Trending Craves**
  - Database-backed `dishes` entity tracking popularity (`search_count`), timestamps, and primary photos.
  - Linked every search query and recommendation directly to its dish catalog record.
  - `GET /api/dishes/trending` endpoint surfacing top community craves.
  - 1-Click interactive "🔥 Trending Craves" chips in the search header.
- [x] **Dietary & Lifestyle Quick Filters**
  - Interactive filter chips: Vegan, Halal, Vegetarian, Gluten-Free, Kosher, Dairy-Free.
  - Gemini 3.6 Flash prompt enforcement with smart fallback popularity and compliance score boosting.
- [x] **Price Tier & Distance Radius Filters**
  - Price tiers: `$` (Budget), `$$` (Casual), `$$$` (Upscale), `$$$$` (Fine Dining).
  - Distance radius selection: Walking (1 mi), Short Drive (5 mi), Metro Area (15 mi) with Haversine distance cutoff.
- [x] **Google Places Photo Gallery & Visual Cards**
  - Secure backend photo proxy `GET /api/places/photo/{photo_reference}` with 30-day client cache headers.
  - Hidden API key security eliminates frontend key leakage and saves quota.
  - Appetizing visual dish photo banners on recommendation cards.
- [x] **Direct Delivery & Reservation Integrations**
  - 1-Click action buttons on cards: `🛵 Order` (Uber Eats / DoorDash) and `📅 Reserve` (OpenTable).
- [x] **Interactive AI Foodie Concierge / Follow-Up Q&A Assistant**
  - `POST /api/chat` conversational endpoint powered by Gemini 3.6 Flash.
  - Grounded directly on the recommended restaurants, reviews, pricing, dietary suitability, and amenities.
  - Interactive chat box with quick prompts ("Which spot is best on a budget?", "Do any have outdoor patio seating?") and clickable restaurant citation pills that select and focus the card.


---

## 💡 Phase 6: Monetization & Expansion (Future)

- [ ] **Affiliate Delivery Partnerships**: Earn small commissions when users order delivery through referral links.
- [ ] **Featured / Promoted Dish Badges**: Local restaurants sponsor their signature dish at the top of relevant radar searches.
- [ ] **User Food Lists / Bookmark Collections**: Let users save "Must-Try Spots" to a personal collection or share with friends.

---

## 📝 User Notes & Custom Ideas

*Add your own ideas and notes below:*

- [ ] 
