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
  - Standardized **BiteRadar** typography across the platform.

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

## 📱 Phase 2: Mobile Experience & Discoverability

- [ ] **Progressive Web App (PWA) Support**
  - Add Web App Manifest (`manifest.json`) with app name, theme colors (`#ea580c`), and splash background.
  - Generate 192x192 and 512x512 maskable app icons.
  - Enable "Add to Home Screen" on iOS Safari and Android Chrome for a native app feel with zero App Store friction.
- [ ] **SEO & Social Share Preview Cards (Open Graph / Twitter)**
  - Create high-resolution social share preview image (`og:image`) featuring the new BiteRadar logo and tagline.
  - Add meta tags (`og:title`, `og:description`, `twitter:card`) in `layout.tsx`.
  - Ensure rich previews when links are shared on iMessage, X/Twitter, WhatsApp, and Slack.
- [ ] **Dynamic Page Titles & Shareable Dish URLs**
  - Implement deep-link routes (e.g. `/search?dish=spicy-ramen&loc=nyc`).
  - Allow users to share specific search results directly with friends.

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

## 🌐 Phase 4: Strategic Data Source Expansions

- [x] **Foursquare Places API Integration (Dish Tips & Free Credits)**
  - Tap into Foursquare's dedicated **"Tips"** endpoint (punchy, dish-specific recommendations written by diners).
  - Supplies Gemini with cleaner, denser dish signals compared to multi-paragraph reviews.
  - Takes advantage of Foursquare's recurring **$200/month free credit** to double our data intelligence at $0 cost.
- [x] **Itemized Menus & Dish Pricing (Documenu / Delivery Feeds)**
  - Integrate Documenu or delivery platform feeds (DoorDash/UberEats) to surface exact dish prices (e.g. `Spicy Tonkotsu Ramen - $17.50`) and full ingredient descriptions directly on cards.
  - Bridges the gap between generic restaurant ratings and exact dish costs.
- [x] **OpenStreetMap (OSM) Integration for Zero-Cost Dietary & Amenity Tags**
  - Use Overpass API / Overture Maps to query community-verified tags (`diet:vegan=yes`, `diet:halal=yes`, `diet:gluten_free=yes`, `outdoor_seating=yes`, `wheelchair=yes`).
  - Provides unmetered, completely free dietary and amenity verification with zero third-party API costs or rate limits.

---

## 🍽️ Phase 5: Core Feature Enhancements

- [ ] **Dietary & Lifestyle Filters**
  - Quick toggle filters: Vegan, Vegetarian, Halal, Kosher, Gluten-Free, Dairy-Free.
  - Prompt engineering updates to instruct Gemini to prioritize certified/dedicated kitchens.
- [ ] **Price & Distance Filters**
  - Price tiers: `$` (Budget), `$$` (Casual), `$$$` (Upscale), `$$$$` (Fine Dining).
  - Distance radius slider: 1 mile (walking), 5 miles (biking/short drive), 15 miles (metro area).
- [ ] **Direct Ordering & Booking Integrations**
  - Deep links to delivery apps (UberEats, DoorDash) or reservation platforms (OpenTable, Resy) when available.
- [ ] **Photo Carousel on Restaurant Cards**
  - Fetch and display top dish photos from Google Places Photo API to make recommendations visually appetizing.
- [ ] **Interactive AI Dish Chat / Follow-Up**
  - Allow users to ask follow-up questions: *"Which of these spots has outdoor patio seating?"* or *"Compare #1 and #2"*.

---

## 💡 Phase 6: Monetization & Expansion (Future)

- [ ] **Affiliate Delivery Partnerships**: Earn small commissions when users order delivery through referral links.
- [ ] **Featured / Promoted Dish Badges**: Local restaurants sponsor their signature dish at the top of relevant radar searches.
- [ ] **User Food Lists / Bookmark Collections**: Let users save "Must-Try Spots" to a personal collection or share with friends.

---

## 📝 User Notes & Custom Ideas

*Add your own ideas and notes below:*

- [ ] 
