# Responsive discovery redesign

BiteRadar now has a warm, food-focused discovery screen and a separate results workspace. The existing logo, Google/email authentication, restaurant providers, and ranking engine are retained.

## Layout and behavior

- **Desktop, 1024px and wider:** horizontal search, ranked restaurant list and sticky map, details and concierge drawers.
- **Tablet, 768–1023px:** full-width results with a list/map switch.
- **Mobile, below 768px:** stacked initial search, editable compact search summary, a list-first experience, bottom sheets for preferences/details, and full-height account insights/concierge panels. Fixed controls respect device safe areas.
- Restaurant cards highlight the recommendation reason. Details contain quotes, tags, directions, delivery/reservation search links, website, sharing, and feedback.
- Preferences are drafts until applied; searches preserve existing results during refresh. Stale responses are ignored. Location edits clear old coordinates. Shared URLs reflect the submitted search, and incoming links wait for sign-in.
- Geolocation is requested only through **Use my location**. Manual city/ZIP entry works without Google Maps. Missing photos use illustrated placeholders; map failures do not block the list.
- Native modal dialogs support keyboard focus containment, Escape, and focus restoration. Inputs have labels; touch controls are at least 44px; reduced-motion preferences are respected.
- Apple/Microsoft placeholder buttons were removed. No guest access, new identity providers, or bookmark features were introduced.

## Implementation

The page handles authentication and composes the workspace. `useDiscovery` owns submitted/draft search state, request cancellation, history restoration, URL updates, and result state. Discovery components own the search/preferences UI, map, cards, details, and concierge. The shared API client handles non-success responses consistently.

Styling uses the existing Geist font and a light palette with shared tokens in `globals.css`. The responsive layouts share data and behavior rather than duplicating state per device.

## Backend compatibility and rollout

The startup migration adds nullable `search_context` and indexed `cache_key` columns to `search_queries` on SQLite/PostgreSQL. No rows are deleted. Cache identity includes normalized dish/location, sorted dietary preferences, price, radius, and supplied coordinates; user identity is excluded. Only fully matching queries with recommendations are reused.

History responses add optional `search_context`. Existing clients can ignore it. Old history still opens, but the UI indicates that original preferences were not recorded. Legacy queries are excluded from new cache hits, so external provider traffic may rise temporarily as the new cache fills.

Deploy the backend before the frontend so history restoration can read the new metadata. The existing backend startup migration must succeed before serving requests. Keep the added nullable columns if rolling application code back. Production deployment is not part of this change.

## Verification

Run from `frontend`:

```sh
npm ci
npm run lint
npm run typecheck
npm run format:check
npm run build
npm run test:e2e
```

Browser tests use installed Google Chrome (`channel: "chrome"`) and start their own server on port 3100. Install Chrome first if it is not available. The normal suite mocks Firebase network responses and backend endpoints; it does not create real accounts, submit production feedback, or add an authentication bypass to the application. Maps is disabled in this suite to exercise the fallback. The opt-in map check uses the configured Maps key and live Google service:

```sh
BITERADAR_LIVE_MAPS=1 npm run test:e2e -- --grep @live
```

Run backend tests from `backend`:

```sh
.venv/bin/python -m pytest -q
```

Automated coverage includes sign-in/deep-link continuation, explicit preference application/reset, restored history and coordinate clearing, sharing submitted values, feedback failure/success, concierge citations, keyboard dismissal/focus restoration, profile saving, insights, password reset, empty/error states, request cancellation, and widths of 360, 390, 768, 1024, and 1440px (plus landscape). Backend tests cover cache separation/normalization, legacy history, matching response fields, and migration idempotence/data preservation.

Real Firebase login, actual email delivery, and physical-device keyboards are not exercised by the deterministic tests. The existing Google Autocomplete and Marker APIs emit deprecation notices; migration to the newer Google components remains separate work.

## Screenshots

Screenshots use deterministic demonstration restaurant data, with intentionally missing/broken photos to show fallback behavior. They are not real restaurant endorsements. The live-map screenshot combines real map tiles with those same fixture results.

| Screen | Desktop | Mobile |
| --- | --- | --- |
| Welcome | [View](welcome-desktop.png) | [View](welcome-mobile.png) |
| Discovery | [View](discovery-desktop.png) | [View](discovery-mobile.png) |
| Results / map fallback | [View](results-desktop.png) | [View](results-mobile.png) |

[Live Google Maps check](live-map-desktop.png)

## Manual-testing fixes

Place Details now requests the Python client's supported `photo` and `reviews` fields. Restaurant coordinates fall back to candidate-search geometry rather than the city center; entries without restaurant coordinates are skipped. Cache keys are versioned to avoid reusing the previously incorrect results. Saved searches whose restaurants all share one coordinate attempt a Place Details repair when opened.

The previous estimated three-step search feedback is restored: **Searching → Compiling → Making a list**, with a progress bar, animated active step, and descriptions. Timers are cleared on completion, cancellation, and failure. These are timed UI estimates because the API returns one complete response rather than streaming phase events.

Browser tests now use `.next-test` so they can run alongside the manual dev server.
