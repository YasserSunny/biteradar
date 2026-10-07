# BiteRadar Roadmap v2

**Updated:** September 21, 2026  
**Planning horizon:** 6 months  
**Recommended operating assumption:** launch deeply in one metro, keep monthly API/marketing spend under $500 until retention is proven, and optimize first for trusted data and repeat usage.

## 1. Executive recommendation

BiteRadar should not try to become a permanent copy of Google, Yelp, or Foursquare. Those products limit how much review content their APIs return, and their licenses restrict long-term storage and reuse. BiteRadar's defensible dataset should instead contain:

- canonical restaurants, dishes, and restaurant-to-dish relationships;
- provider identifiers and short-lived provider snapshots with provenance and expiry;
- restaurant-owned or explicitly licensed menus;
- BiteRadar user reviews, photos, votes, saves, clicks, and search behavior;
- derived dish-level scores that can be recomputed from permitted source data;
- freshness, confidence, and evidence metadata for every important fact.

The recommended priority order is:

1. **Compliance, instrumentation, and canonical data model** — required before collecting more data.
2. **Incremental restaurant/dish/menu dataset and hybrid search** — the foundation for everything else.
3. **Better AI assistant and transparent ranking** — improves the existing product immediately.
4. **First-party contributions and lightweight community** — creates durable review and photo supply.
5. **Personalized recommendations** — start rules-based, then move to learning-to-rank when enough events exist.
6. **Focused one-city growth and restaurant partnerships** — scale acquisition only after retention is measurable.
7. **Full discussion boards and monetization** — valuable later, but premature before density and moderation capacity.

## 2. Direct answers to the product questions

### 2.1 How to obtain more restaurant reviews

#### Google

The supported Google Places API returns **at most five reviews per place**. Moving from the legacy Places client used in `places_service.py` to Places API (New) improves field selection and API lifecycle, but it does not raise this limit. There is no supported pagination parameter for fetching more public Google reviews. Repeating calls, changing language, or scraping Google Maps is not a reliable or compliant acquisition strategy.

Google Business Profile APIs can return reviews for locations managed by an authenticated business account, but that is a merchant-authorization workflow, not a way to fetch all reviews for arbitrary restaurants.

**Recommendation:** keep Google's five reviews as a fresh, attributed preview only. Store the Google Place ID as the durable cross-reference, display a link to Google Maps for more reviews, and do not design ranking quality around obtaining additional Google review text.

#### Yelp

Yelp's standard Reviews endpoint documents up to **three review excerpts** and requires an Enhanced or Premium permission. Yelp's plan comparison currently advertises as many as seven excerpts on some plans, while its endpoint documentation still says three; confirm the exact allowance for the selected contract with Yelp before implementation. Yelp does not provide complete public review history through normal developer access. Its documentation directs commercial analysis/full-text use to enterprise products such as Yelp Insights.

The current integration uses Yelp's GraphQL beta and matches the first name/coordinate search result. Replace this with the supported REST endpoints and Business Match where available. Persist the Yelp business ID, not the review text. Yelp currently allows API content to be cached for only 24 hours and business IDs to be stored indefinitely.

**Recommendation:** do not pay for Yelp solely to get a few more excerpts. Consider a paid Yelp plan only if its menu URL, attributes, photos, and coverage improve search conversion enough to justify the cost.

#### Foursquare

Foursquare's current Place Tips endpoint accepts a limit from 1 to **50**. BiteRadar currently asks for only five popular tips, so this is the easiest supported way to increase textual evidence. Start with 10–20 tips, measure cost and latency, and fetch `POPULAR` first. Fetch `NEWEST` as a second request only during background refreshes for high-demand restaurants; de-duplicate by the Foursquare tip ID.

Before persisting or analyzing tips, confirm the applicable Foursquare product license and retention rules. Store source IDs, timestamps, attribution, and fetch time even when the contract allows content storage.

#### Additional sources worth considering

Priority should be based on rights, coverage, and dish-level value rather than raw review count:

1. **BiteRadar user contributions:** the most important long-term source. Ask for a dish, rating, short note, price paid, visit date, and optional photo—not just a generic restaurant rating.
2. **Restaurant partners:** claimed profiles can provide menus, signature dishes, photos, dietary facts, and changes directly.
3. **Restaurant websites:** extract menus and structured facts when the site's terms and robots policy permit it; retain provenance and refresh timestamps.
4. **Foursquare tips:** increase the limit under the applicable license.
5. **Tripadvisor Content API:** investigate only through its official commercial access and display terms; use it as a link/summary source unless the contract explicitly permits more.
6. **Delivery/reservation platforms:** useful for menu availability and conversion, but typically require partner agreements. Do not scrape DoorDash, Uber Eats, Grubhub, or OpenTable.
7. **OpenStreetMap:** continue using it for location, dietary, accessibility, and amenity facts—not review text.

Avoid review brokers or search-result scraping services as a core dependency. They create legal, data-quality, attribution, and availability risk without producing a durable moat.

### 2.2 How to obtain restaurant menus

Google Places does not expose a general full-menu field for arbitrary restaurants. Google Business Profile has a Food Menus API, but it requires OAuth access to a business-managed location; it is suitable later for restaurants that claim their BiteRadar profile.

Menus should use a source waterfall:

1. restaurant-verified menu entered/uploaded through BiteRadar;
2. licensed partner feed or merchant-authorized Google Business Profile menu;
3. structured data on the restaurant's official website (`schema.org/Menu`, `MenuSection`, and `MenuItem`);
4. accessible HTML menu pages;
5. PDF or image menus, parsed with OCR and flagged as lower confidence;
6. Yelp menu URL or another provider's menu link, when the contracted plan exposes it;
7. price-tier estimate as a clearly labeled fallback, never presented as an actual item price.

Do not parse menus synchronously inside a user's search request. The current pipeline already calls several providers serially and has required a job/polling workaround. Instead:

- return the best stored menu immediately, including `last_verified_at` and confidence;
- enqueue an asynchronous refresh when the record is missing or stale;
- fetch only the official restaurant domain or an explicitly licensed provider URL;
- protect the crawler against SSRF: allow only HTTPS, resolve and block private/link-local IP ranges, limit redirects/body size/time, reject arbitrary user-supplied URLs, and sandbox PDF/OCR processing;
- respect robots directives, site terms, rate limits, and takedown requests;
- save the original source URL, content hash, extraction method, fetched time, and expiry;
- show extracted content as “unverified” until a restaurant or trusted user confirms it.

For the existing Documenu adapter, first verify that the account, coverage, current API contract, and retention rights are still viable. Keep it behind a provider interface so it can be removed without changing the domain model.

### 2.3 How to build the dataset incrementally

The current system does useful partial persistence, but it treats generated search results as the main record. It also has no provider-content TTL and stores Google/Yelp review text indefinitely. The next version should separate durable first-party entities from expiring external observations.

#### Proposed durable entities

- `restaurants`: BiteRadar canonical ID, normalized name/address, coordinates, status, claimed state, and timestamps.
- `restaurant_external_ids`: restaurant ID, provider, provider place/business ID, match confidence, match method, and last verified time. Unique on `(provider, external_id)`.
- `dishes`: canonical dish, aliases, cuisine, description, and dietary taxonomy.
- `restaurant_dishes`: restaurant, dish, name as printed, description, price/currency, availability, confidence, verification status, source, and freshness timestamps.
- `menu_sources`: restaurant, source type, URL/provider ID, rights/verification state, refresh policy, content hash, and last fetch result.
- `menu_versions` and `menu_items`: immutable source snapshots plus normalized current items. Preserve history without treating stale prices as current.
- `user_contributions`: author, restaurant, optional dish, rating, text, visit date, status, and edit history.
- `media_assets`: owner, restaurant/dish link, object-storage key, moderation status, dimensions, and attribution.
- `user_events`: impression, result click, detail open, save, share, directions, menu, order, reserve, hide, feedback, and contribution events with request/session context.
- `recommendation_feedback`: user, restaurant, dish, search/session, vote, reason tags, and timestamp. Do not overwrite one global `Recommendation.helpful` value.
- `provider_snapshots`: provider, external ID, permitted payload or selected fields, fetched time, expiry, attribution, and deletion status. Encrypt or omit content where the provider contract requires it.
- `fact_evidence`: normalized fact, source type/ID, observed time, confidence, and expiry. This supports transparent citations without conflating sources.

Search queries and generated recommendation explanations remain useful audit records, but they should not be the source of truth for restaurants, dishes, or user preference.

#### Hybrid search flow

1. Normalize dish aliases and resolve the requested location/geography.
2. Retrieve BiteRadar restaurants and `restaurant_dishes` inside the requested radius.
3. Call live external search only when owned coverage is below a target or records are stale.
4. Resolve external candidates to canonical restaurants using provider ID first, then phone/domain, then address and geo/name similarity. Never merge on name alone.
5. Upsert durable provider IDs and allowed facts; put restricted content into expiring provider snapshots.
6. Merge owned and external candidates using explicit field-level source precedence.
7. Rank candidates, record impressions, and generate an explanation from cited evidence.
8. Refresh popular records asynchronously using demand-based schedules.

Initial field precedence should be:

- merchant-verified fact;
- recent BiteRadar community consensus;
- official restaurant website;
- live licensed provider data, displayed with its attribution;
- inferred value, visibly labeled as an estimate.

Replace permanent query caching with **stale-while-revalidate**:

- cache a rendered search response for fast reuse;
- give each contributing source its own expiry;
- serve a usable stale response only within a bounded grace period;
- refresh in the background rather than blocking the search;
- regenerate rankings when menu, restaurant, or evidence versions change;
- delete or refresh provider content at the contractually required interval.

### 2.4 How to improve the AI assistant

The current concierge sees only saved recommendation fields, accepts client-supplied history, and generates a short answer with restaurant-name citations. It cannot run a new search, inspect a menu, apply a new constraint, or explain the evidence behind a claim.

Build the next assistant as a small tool-using layer over BiteRadar services:

- `search_restaurants(dish, location, filters)`;
- `filter_current_results(price, dietary, distance, open_now)`;
- `compare_restaurants(restaurant_ids)`;
- `get_menu_items(restaurant_id, query)`;
- `get_restaurant_evidence(restaurant_id, dish_id)`;
- `save_restaurant`, `record_preference`, and `start_new_search` with explicit user confirmation where appropriate.

Assistant responses should return structured blocks: answer, restaurant IDs, fact/evidence IDs, suggested actions, uncertainty, and whether the data is stale. Render citations from evidence records rather than trusting names generated by the model.

Product behavior:

- ask one clarifying question when location, dish, party needs, budget, or dietary safety is material and missing;
- distinguish “provider says,” “restaurant verified,” “community reported,” and “estimated” claims;
- never claim allergy safety from tags or model inference; advise confirming with the restaurant;
- use server-owned conversation sessions and authenticated user IDs instead of accepting the entire truth-bearing history from the browser;
- retrieve only the relevant facts/menu items to reduce cost and hallucination risk;
- support comparison tables, “why this result,” “find a similar cheaper option,” and “what should I order here?”;
- capture thumbs-up/down plus reason tags such as inaccurate, stale, irrelevant, too far, or dietary mismatch.

Create a versioned evaluation set before changing prompts or models. Start with at least 100 representative questions covering dish relevance, comparisons, dietary constraints, price, distance, hours, missing data, prompt injection in provider/UGC text, and requests outside the available evidence. Track citation correctness, unsupported-claim rate, task completion, p95 latency, and cost per completed conversation.

### 2.5 Community and discussion features

Do not begin with a general-purpose discussion board. Begin with structured, contextual contributions that directly improve recommendations:

1. dish-level “I tried this” rating and short note;
2. price paid and visit date;
3. dish/restaurant photo upload;
4. helpful vote and report action;
5. restaurant and dish threads after contribution density exists;
6. follows, notifications, lists, and city communities later.

Each post should be linkable to a restaurant, dish, and optional location. Allow replies, but keep the primary contribution structured so it can feed ranking and menu verification.

Community launch requires, from day one:

- verified Firebase identity, display-name rules, blocks, deletes, and data export;
- image metadata stripping and object storage with signed upload URLs;
- automated text/image safety checks plus a human moderation queue;
- report reasons, rate limits, spam controls, duplicate detection, and account trust levels;
- moderator audit log, appeals/takedown path, community guidelines, privacy policy, and terms;
- `noindex` for untrusted/new-user pages until they pass quality thresholds;
- clear ownership/license terms for user photos and reviews.

Never reuse a provider review as a BiteRadar community post. Provider content and BiteRadar user content must remain visibly and technically separate.

### 2.6 Recommendation system

Use a staged system so personalization begins immediately without pretending there is enough data for collaborative filtering.

#### Stage A: transparent scoring

Create a deterministic candidate score using:

- evidence that the requested dish is actually served;
- dish-specific BiteRadar ratings and helpful votes;
- overall quality with Bayesian shrinkage so low-count restaurants do not dominate;
- distance and current availability;
- menu/evidence freshness and confidence;
- dietary/price constraint satisfaction;
- diversity penalty so results are not all the same chain or cuisine subtype.

The LLM may summarize why a result scored well, but it must not decide the numeric order. This makes ranking testable, cheaper, and safer.

#### Stage B: content-based personalization

After explicit consent, build a preference profile from cuisines, dishes, price range, typical travel distance, dietary constraints, saved restaurants, positive/negative feedback, and recent behavior. Apply time decay and let users inspect/reset preferences. Keep hard dietary filters separate from learned preferences.

#### Stage C: learning-to-rank

Consider a trained ranking model only after BiteRadar has at least 10,000 clean impression rows, 500 users with five or more meaningful events, and reliable negative signals. Train on grouped search impressions to avoid treating unshown restaurants as dislikes. Use time-based offline validation and compare against the deterministic baseline using NDCG@5, click/save rate, contribution rate, and coverage/diversity.

Deploy with a small experiment allocation, guardrail metrics, a kill switch, model/version logging, and fallback to Stage A. Do not train on Google/Yelp review text unless the applicable contract explicitly permits that use.

### 2.7 Marketing and advertising plan

#### Positioning

Use one clear message: **“Find the best place for the exact dish you crave—not just the highest-rated restaurant.”**

Begin with one metro and three to five dish categories that have strong visual appeal, frequent intent, and enough restaurants to compare. The goal is local density: a user should see credible dish evidence and useful menus, not merely broad geographic availability.

#### First 90 days

**Weeks 1–2: measurement and audience**

- Choose the launch metro and initial dish categories using existing search logs, result coverage, and local supply.
- Instrument the funnel: landing → search → useful result → detail → menu/directions/order/save → return search → contribution.
- Interview 15–20 local diners and 10 restaurant owners; test the positioning, missing facts, contribution prompt, and profile-claim value.
- Establish baseline search success, activation, day-7 retention, and cost per successful search.

**Weeks 3–6: seed useful supply**

- Manually verify the top 100–200 restaurants and their signature dishes in the launch area.
- Recruit 10–20 restaurant partners to claim profiles and provide menus/photos; offer free verification and analytics, not paid ranking.
- Recruit 20–30 local food contributors with a specific weekly dish mission.
- Publish a small number of high-quality, indexable dish/city and restaurant/dish pages containing original BiteRadar evidence, current menus, and community contributions.

**Weeks 7–10: organic distribution loops**

- Add shareable comparison cards, dish lists, and “best dish near me” result links.
- Partner with micro-creators on trackable dish challenges; compensate for content creation, never for a positive review.
- Share genuinely useful local findings in neighborhood, campus, cultural, and dietary communities where promotion is allowed.
- Launch referral prompts only after a user saves, shares, or positively rates a result.

**Weeks 11–12: small paid experiments**

- Test two channels with $10–$20/day each for two weeks: high-intent search ads and geo-targeted creator/social content.
- Send every campaign to a dish-and-location experience, not the generic home page.
- Stop any channel that cannot produce activated users at a sustainable cost; do not optimize to clicks alone.

#### Marketing metrics and gates

Track:

- search activation: percentage of new users who complete a search and open a result;
- search success: percentage of searches producing at least three credible, in-radius results;
- useful action rate: menu, directions, save, share, order, reserve, or positive feedback;
- day-7 and day-30 returning-search rate;
- contribution rate and accepted-contribution rate;
- provider and AI cost per successful search;
- organic landing-page impressions → search conversion;
- restaurant claim and menu-verification rate;
- paid cost per activated user, then retained user—not cost per click.

Do not materially scale advertising until the selected cohort has a repeat-use signal—for example, at least 20% of activated users return within 30 days—or qualitative research shows a clear recurring use case. Treat that threshold as a decision gate, not a promise that 20% alone proves product-market fit.

SEO should be based on genuinely useful, owned/verified pages. Do not generate thousands of thin “dish in city” pages from provider snippets. Google explicitly warns against scaled, unoriginal content. When community threads launch, use the applicable discussion/profile structured data only for real user-authored content and keep spammy or untrusted content out of the index.

## 3. Six-month execution plan

### Phase 0 — Compliance and measurement (weeks 1–2, P0)

**Deliverables**

- Inventory each provider field currently fetched, stored, displayed, sent to AI, and retained.
- Obtain a contract/legal review for Google Places, Yelp, Foursquare, Documenu, OSM, user photos, and AI training/analysis use.
- Stop indefinite storage of Google/Yelp review text; add provider-specific expiry/deletion and attribution rules.
- Remove the API-key prefix print from backend configuration and rotate any key exposed in logs.
- Add per-provider request count, latency, failure, quota, and estimated-cost telemetry.
- Define the product funnel and add server-side impression/action events.
- Establish privacy policy, provider attribution, retention schedule, and user deletion/export behavior.

**Exit criteria**

- Every stored external field has an owner, source, permitted purpose, retention duration, and deletion path.
- Dashboard shows search success, p50/p95 latency, external/AI cost, and provider error rate.
- No restricted review text survives beyond its allowed cache window.

### Phase 1 — Canonical data foundation (weeks 3–6, P0)

**Deliverables**

- Introduce canonical restaurant IDs and external-ID mappings.
- Normalize dishes and aliases; add `restaurant_dishes`, evidence, confidence, and freshness.
- Add provider snapshots with TTL and source-specific attribution.
- Replace ad-hoc `create_all`/column additions with versioned database migrations before expanding the schema.
- Implement deterministic entity resolution and a manual merge/review queue.
- Replace permanent search cache reuse with stale-while-revalidate.
- Upgrade Foursquare retrieval from five tips to a measured 10–20 popular tips; store tip IDs and deduplicate.
- Move Yelp to supported REST matching/review endpoints and enforce its cache window.

**Exit criteria**

- Repeated searches enrich the same canonical restaurant/dish records instead of duplicating results.
- Matching tests cover chains, same-name restaurants, moved/closed businesses, and incorrect provider matches.
- Search remains functional when any provider is unavailable.

### Phase 2 — Menu pipeline and merchant verification (weeks 7–10, P1)

**Deliverables**

- Add menu sources, immutable versions, normalized items, prices, currency, and verification state.
- Build background refresh jobs for structured data, HTML, PDF, and image menus with SSRF/content limits.
- Add “last updated,” source, and estimated/unverified labels in the UI.
- Add restaurant profile claiming and simple menu upload/edit workflow.
- Create a review queue for low-confidence extraction and conflicting facts.

**Exit criteria**

- At least 100 launch-market restaurants have a current menu source.
- At least 80% of sampled parsed menu items match their source; prices never silently fall back to estimates.
- Search latency is not coupled to menu crawling/OCR.

### Phase 3 — Ranking and assistant v2 (weeks 11–14, P1)

**Deliverables**

- Move ordering from LLM output to a deterministic, versioned scoring service.
- Add dish-evidence, freshness, Bayesian quality, distance, constraint, and diversity features.
- Implement assistant tools, evidence-ID citations, server-side sessions, and action suggestions.
- Add structured feedback reasons and a 100-question assistant/ranking evaluation suite.
- Add prompt-injection tests for menus, provider content, and UGC.

**Exit criteria**

- Every recommendation can show a concise “why” backed by stored evidence.
- Assistant unsupported-claim and citation metrics meet an agreed release threshold on the evaluation set.
- p95 assistant latency and cost stay within the product budget.

### Phase 4 — First-party contributions and community MVP (weeks 15–19, P1)

**Deliverables**

- Launch dish-level reviews, visit dates, price paid, photos, helpful votes, and reports.
- Add Cloud Storage signed uploads, metadata stripping, moderation states, and admin queue.
- Add contribution prompts after a high-intent action or later visit reminder—not before users receive value.
- Add restaurant/dish feeds and replies only after moderation and reporting work end to end.
- Publish community guidelines, content license, privacy/delete/export controls, and appeal flow.

**Exit criteria**

- All public UGC has author, moderation state, report path, edit/delete behavior, and audit history.
- Moderator can remove content and suspend an account without database intervention.
- Contribution acceptance, report, and moderation turnaround metrics are visible.

### Phase 5 — Personalization and launch-market growth (weeks 20–24, P2)

**Deliverables**

- Add consented user taste profiles and content-based reranking with a reset/control screen.
- Run the one-city restaurant/contributor seeding program and creator experiments.
- Publish original high-quality landing pages only where data completeness passes a threshold.
- Run small paid tests after retention and activation gates are met.
- Prepare the learning-to-rank dataset, but train/deploy only if the event-volume and quality gates are reached.

**Exit criteria**

- Personalized results outperform the non-personalized baseline without reducing coverage/diversity.
- Growth dashboard reports activated and retained users by channel.
- A documented go/no-go decision exists for a second city, paid scaling, and ML ranking.

## 4. API and data-contract changes

Keep current endpoints compatible while introducing versioned resources:

- `POST /api/v2/search` returns `search_id`, canonical `restaurant_id`, `dish_id`, rank score/version, freshness, evidence summaries, and a job/status contract.
- `GET /api/v2/restaurants/{id}` returns durable BiteRadar facts plus clearly separated, live/expiring provider sections.
- `GET /api/v2/restaurants/{id}/menu` returns menu version, source, verification, freshness, currency, sections, and items.
- `POST /api/v2/events` records batched authenticated impressions/actions with an idempotency key.
- `POST /api/v2/contributions` and media-upload endpoints create moderated first-party content.
- `POST /api/v2/chat/sessions` and `/messages` maintain server-side conversation state and return restaurant/evidence IDs.
- Admin-only endpoints handle entity merges, menu verification, reports, and moderation actions.

All write endpoints should derive `user_id` from verified Firebase tokens; do not trust a user ID supplied in JSON. Add authorization checks to search history, profiles, feedback, chat sessions, and contributions before community launch.

## 5. Testing and operational requirements

- **Provider contracts:** fixture tests for missing fields, 401/403/429, quotas, timeouts, changed payloads, and TTL deletion.
- **Entity resolution:** golden cases for duplicate chains, branches, shared kitchens, moves, closures, and ambiguous matches.
- **Menus:** parser fixtures for JSON-LD, HTML, PDFs, images, multiple currencies, option prices, and stale/conflicting versions; security tests for SSRF, redirect loops, oversized files, and malformed documents.
- **Search/ranking:** deterministic replay tests, source-outage fallbacks, geographic bounds, filter correctness, diversity, and stale-while-revalidate behavior.
- **Assistant:** citation validity, unsupported claims, dietary/allergy language, prompt injection, stale facts, session ownership, and cost/latency budgets.
- **Community:** upload authorization, MIME validation, moderation transitions, reports, rate limits, blocks, deletion/export, and abuse scenarios.
- **Recommendation experiments:** exposure logging, consistent assignment, rollback, time-based offline evaluation, and guardrail monitoring.
- **Migrations:** forward migration, production-size rehearsal, rollback/compensating plan, and dual-read/dual-write compatibility during rollout.

## 6. Decisions to defer until evidence exists

- Do not purchase an enterprise review feed until a coverage test shows it improves useful-action or retention metrics.
- Do not build a general social feed before dish-level contributions have repeat contributors and moderation is sustainable.
- Do not train a collaborative-filtering or deep recommendation model before clean exposure/event data reaches the stated gate.
- Do not sell promoted placement until organic ranking is stable; when introduced, sponsored results must be clearly labeled and must not override hard dietary/safety constraints.
- Do not expand beyond the first metro until search success, menu freshness, contribution supply, and retention meet explicit targets.

## 7. Provider and platform references

These links are planning inputs, not legal advice; re-check them before implementation because pricing and terms change.

- [Google Places resource: maximum five reviews](https://developers.google.com/maps/documentation/places/web-service/reference/rest/v1/places)
- [Google Places policies and caching restrictions](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Google Place IDs can be stored and should be refreshed](https://developers.google.com/maps/documentation/places/web-service/place-id)
- [Google Business Profile Food Menus API](https://developers.google.com/my-business/reference/rest/v4/accounts.locations/getFoodMenus)
- [Yelp Reviews endpoint](https://docs.developer.yelp.com/reference/v3_business_reviews)
- [Yelp Places plans and available attributes](https://docs.developer.yelp.com/page/start-your-free-trial)
- [Yelp FAQ: 24-hour cache and analysis limitations](https://docs.developer.yelp.com/docs/places-faq)
- [Foursquare Place Tips: up to 50 tips](https://docs.foursquare.com/fsq-developers-places/reference/place-tips)
- [Schema.org Menu structure](https://schema.org/Menu)
- [Google Search guidance on people-first content and scaled AI pages](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [Google discussion-forum structured data](https://developers.google.com/search/docs/appearance/structured-data/discussion-forum)

## 8. Final priority summary

The next feature should **not** be a full discussion board or a complex recommendation model. The next release should make the existing search trustworthy and cumulative: compliant provider handling, canonical restaurants/dishes, event instrumentation, source-aware freshness, and background menu acquisition. Once those foundations are live, assistant v2 and structured user contributions will create the data needed for personalization. Marketing should begin in parallel at small scale through local interviews and restaurant/contributor seeding, but paid acquisition should wait until the product shows repeat use.
