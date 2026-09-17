import { test, expect, type Page } from "@playwright/test";
import type { SearchInput } from "../src/lib/types";
const restaurants = [
  {
    id: "1",
    query_id: 7,
    place_id: "ramen-house",
    name: "The Ramen House",
    rating: 4.8,
    total_reviews: 328,
    lat: 40.72,
    lng: -73.99,
    reason:
      "Diners love the deeply savory broth and springy handmade noodles. A comforting bowl with a memorable finish.",
    dish_price: "~$16 – $22",
    open_now: true,
    helpful_quote: "The broth is the reason we keep coming back.",
    dietary_tags: ["Vegan options"],
    amenities: ["Outdoor seating"],
    website: "https://example.com/menu",
    delivery_url: "https://example.com/delivery",
    reservation_url: "https://example.com/reserve",
  },
  {
    id: "2",
    query_id: 7,
    place_id: "noodle-bar",
    name: "Little Noodle Bar",
    rating: 4.6,
    total_reviews: 192,
    lat: 40.73,
    lng: -74,
    reason:
      "A neighborhood favorite for rich miso ramen, generous portions, and a relaxed atmosphere.",
    price_level: "$$",
    open_now: false,
    photo_url: "/missing-photo",
  },
];
const saved: SearchInput = {
  dish_name: "Ramen",
  location: "Brooklyn",
  dietary_filters: ["vegan"],
  price_tier: "$$",
  max_distance_km: 8,
  lat: 40.68,
  lng: -73.94,
};
async function fixtures(page: Page) {
  const searches: SearchInput[] = [];
  const now = Math.floor(Date.now() / 1000);
  const token = `${Buffer.from(JSON.stringify({ alg: "none" })).toString("base64url")}.${Buffer.from(JSON.stringify({ sub: "test-diner", user_id: "test-diner", iat: now, exp: now + 3600, auth_time: now, aud: "biteradar-test", iss: "https://securetoken.google.com/biteradar-test", firebase: { sign_in_provider: "password" } })).toString("base64url")}.test`;
  await page.route("**/identitytoolkit.googleapis.com/**", (route) =>
    route.fulfill({
      json: route.request().url().includes("accounts:lookup")
        ? {
            users: [
              {
                localId: "test-diner",
                email: "diner@example.com",
                displayName: "Alex",
                emailVerified: true,
              },
            ],
          }
        : {
            localId: "test-diner",
            email: "diner@example.com",
            displayName: "Alex",
            idToken: token,
            refreshToken: "test-refresh",
            expiresIn: "3600",
            registered: true,
          },
    }),
  );
  await page.route("http://127.0.0.1:8100/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "OPTIONS")
      return route.fulfill({ status: 204 });
    if (path === "/api/search") {
      searches.push(route.request().postDataJSON());
      return route.fulfill({ json: restaurants });
    }
    if (path.startsWith("/api/profile/"))
      return route.fulfill({
        json: {
          name: "Alex",
          preferred_cuisines: ["Japanese"],
          favorite_dishes: ["Ramen", "Tacos"],
        },
      });
    if (path === "/api/profile")
      return route.fulfill({ json: route.request().postDataJSON() });
    if (path.startsWith("/api/history/"))
      return route.fulfill({
        json: [
          {
            id: 1,
            query_id: 7,
            dish_name: "Ramen",
            location: "Brooklyn",
            created_at: "",
            search_context: saved,
          },
        ],
      });
    if (path.startsWith("/api/queries/"))
      return route.fulfill({ json: restaurants });
    if (path === "/api/dishes/trending")
      return route.fulfill({
        json: ["Ramen", "Tacos", "Biryani", "Pizza"].map((name, i) => ({
          id: i + 1,
          name,
          search_count: 128 - i * 20,
        })),
      });
    if (path === "/api/chat")
      return route.fulfill({
        json: {
          response: "The Ramen House has outdoor seating.",
          cited_restaurants: ["The Ramen House"],
        },
      });
    if (path === "/api/feedback")
      return route.fulfill({ json: { status: "success" } });
    if (path === "/api/analytics/summary")
      return route.fulfill({
        json: {
          total_searches: 321,
          unique_dishes_cataloged: 28,
          total_recommendations: 1100,
          satisfaction_rate_percent: 92,
          total_feedback_votes: 78,
          top_dishes: [],
          top_gems: [],
        },
      });
    if (path === "/api/analytics/trending-by-city")
      return route.fulfill({
        json: {
          available_cities: ["Brooklyn"],
          trends: [
            { location: "Brooklyn", dish_name: "Ramen", search_count: 40 },
          ],
        },
      });
    return route.fulfill({ status: 404, json: { detail: "Not found" } });
  });
  return searches;
}
async function signIn(page: Page, url = "/") {
  await page.goto(url);
  await page.getByLabel("Email address").fill("diner@example.com");
  await page.getByLabel("Password", { exact: true }).fill("test-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Open account menu" }),
  ).toBeVisible();
}
async function search(page: Page) {
  await page.getByPlaceholder("Ramen, tacos, biryani…").fill("Ramen");
  await page.getByPlaceholder("City or ZIP code").fill("New York");
  await page.getByRole("button", { name: "Find my dish" }).click();
  await expect(
    page.getByRole("heading", { name: "Great spots for Ramen" }),
  ).toBeVisible();
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBeTruthy();
}

test("sign-in gate preserves a deep link; preferences apply and reset explicitly", async ({
  page,
}) => {
  const searches = await fixtures(page);
  await page.goto("/?dish=Ramen&loc=New+York");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  expect(searches).toHaveLength(0);
  await signIn(page, "/?dish=Ramen&loc=New+York");
  await expect(
    page.getByRole("heading", { name: "Great spots for Ramen" }),
  ).toBeVisible();
  expect(searches).toHaveLength(1);
  await page.getByRole("button", { name: "Preferences", exact: true }).click();
  await page.getByRole("button", { name: "Vegan", exact: true }).click();
  await page.getByRole("button", { name: "$$", exact: true }).click();
  expect(searches).toHaveLength(1);
  await page.getByRole("button", { name: "Apply preferences" }).click();
  await expect.poll(() => searches.length).toBe(2);
  expect(searches[1].dietary_filters).toEqual(["Vegan"]);
  expect(searches[1].price_tier).toBe("$$");
  await page.getByRole("button", { name: /Preferences/ }).click();
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await page.getByRole("button", { name: "Apply preferences" }).click();
  await expect.poll(() => searches.length).toBe(3);
  expect(searches[2].dietary_filters).toEqual([]);
});

test("history restores settings; location edits drop coordinates; share uses submitted values", async ({
  page,
  context,
}) => {
  const searches = await fixtures(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "share", { value: undefined }),
  );
  await signIn(page);
  await page.getByRole("button", { name: "Ramen Brooklyn" }).click();
  await expect(
    page.getByRole("heading", { name: "Great spots for Ramen" }),
  ).toBeVisible();
  await expect(page.getByPlaceholder("City or ZIP code")).toHaveValue(
    "Brooklyn",
  );
  await page.getByRole("button", { name: "Share search", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("loc=Brooklyn");
  await page.getByPlaceholder("City or ZIP code").fill("Boston");
  await page.getByRole("button", { name: "Share search", exact: true }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain("loc=Brooklyn");
  await page.getByRole("button", { name: "Find my dish" }).click();
  await expect.poll(() => searches.length).toBe(1);
  expect(searches[0].lat).toBeUndefined();
  expect(searches[0].price_tier).toBe("$$");
});

test("details, feedback failures, concierge citations, and keyboard dismissal", async ({
  page,
}) => {
  await fixtures(page);
  await signIn(page);
  await search(page);
  await page.getByRole("button", { name: "View details" }).first().click();
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "The Ramen House",
  );
  await page.route("**/api/feedback", (route) =>
    route.fulfill({
      status: 500,
      json: { detail: "Could not record feedback." },
    }),
  );
  await page.getByRole("button", { name: "Yes, helpful" }).click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "Could not record feedback",
  );
  await expect(
    page.getByRole("button", { name: "Yes, helpful" }),
  ).toHaveAttribute("aria-pressed", "false");
  await page.unroute("**/api/feedback");
  await page.getByRole("button", { name: "Yes, helpful" }).click();
  await expect(
    page.getByRole("button", { name: "Yes, helpful" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("button", { name: "View details" }).first(),
  ).toBeFocused();
  await page.getByRole("button", { name: "Help me choose" }).click();
  await page.getByRole("button", { name: "Any outdoor seating?" }).click();
  await expect(page.getByRole("log")).toContainText(
    "The Ramen House has outdoor seating",
  );
  await page
    .getByRole("button", { name: "The Ramen House", exact: true })
    .last()
    .click();
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "The Ramen House",
  );
});

for (const width of [360, 390, 768, 1024, 1440]) {
  test(`responsive layout and screenshots at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
    await fixtures(page);
    await signIn(page);
    await expect(
      page.getByRole("heading", { name: "Big cravings. Great discoveries." }),
    ).toBeVisible();
    await noOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`discovery-${width}.png`),
      fullPage: true,
      style: "nextjs-portal { display: none; }",
    });
    await search(page);
    await noOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(`results-${width}.png`),
      fullPage: true,
      style: "nextjs-portal { display: none; }",
    });
    if (width < 1024) {
      await page.getByRole("button", { name: "Show map" }).click();
      await expect(
        page.getByRole("heading", { name: "Map unavailable" }),
      ).toBeVisible();
      await page.getByRole("button", { name: "Show list" }).click();
      await expect(
        page.getByRole("button", { name: "View details" }).first(),
      ).toBeVisible();
    }
    if (width < 768) {
      await page.getByRole("button", { name: /Ramen New York Edit/ }).click();
      await expect(page.getByPlaceholder("City or ZIP code")).toBeVisible();
    }
    await page
      .getByRole("button", { name: "Preferences", exact: true })
      .click();
    await noOverflow(page);
    await page.keyboard.press("Escape");
    await page.setViewportSize({ width: 844, height: 390 });
    await noOverflow(page);
  });
}

test("empty and failed searches leave the app usable", async ({ page }) => {
  await fixtures(page);
  await signIn(page);
  await search(page);
  await page.route("**/api/search", (route) =>
    route.fulfill({
      status: 503,
      json: { detail: "Search is temporarily unavailable." },
    }),
  );
  await page.getByRole("button", { name: "Find my dish" }).click();
  await expect(page.locator(".error-banner")).toContainText(
    "temporarily unavailable",
  );
  await expect(
    page.getByRole("button", { name: "View details" }).first(),
  ).toBeVisible();
  await page.route("**/api/search", (route) => route.fulfill({ json: [] }));
  await page.getByRole("button", { name: "Find my dish" }).click();
  await expect(
    page.getByRole("heading", { name: "No spots found this time" }),
  ).toBeVisible();
});

test("welcome, password reset, account and insights flows", async ({
  page,
}, testInfo) => {
  await fixtures(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Good to see you." }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("welcome-desktop.png"),
    fullPage: true,
    style: "nextjs-portal { display: none; }",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath("welcome-mobile.png"),
    fullPage: true,
    style: "nextjs-portal { display: none; }",
  });
  await page.getByRole("button", { name: "Forgot password?" }).click();
  await page.getByLabel("Email address").fill("diner@example.com");
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("status")).toContainText("reset link");
  await page.getByRole("button", { name: "Back to sign in" }).click();
  await signIn(page);
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("button", { name: "Food preferences" }).click();
  await page.getByLabel("Your name").fill("Alex Foodie");
  await page.getByRole("button", { name: "Save preferences" }).click();
  await expect(page.getByRole("status")).toContainText("saved");
  await page.getByRole("button", { name: "Open account menu" }).click();
  await page.getByRole("button", { name: "Community insights" }).click();
  await expect(page.getByText("92%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "By city" }).click();
  await page
    .getByRole("button", { name: "Ramen Brooklyn · 40 searches" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Great spots for Ramen" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "BiteRadar home" }).click();
  await expect(
    page.getByRole("heading", { name: "Big cravings. Great discoveries." }),
  ).toBeVisible();
});

test("returning home cancels an in-flight search", async ({ page }) => {
  await fixtures(page);
  await signIn(page);
  let complete!: () => void;
  const finished = new Promise<void>((resolve) => {
    complete = resolve;
  });
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/search", async (route) => {
    await gate;
    await route.fulfill({ json: restaurants }).catch(() => {});
    complete();
  });
  await page.getByPlaceholder("Ramen, tacos, biryani…").fill("Ramen");
  await page.getByPlaceholder("City or ZIP code").fill("New York");
  const incoming = page.waitForRequest("**/api/search");
  await page.getByRole("button", { name: "Find my dish" }).click();
  await incoming;
  await page.getByRole("link", { name: "BiteRadar home" }).click();
  release();
  await finished;
  await expect(
    page.getByRole("heading", { name: "Big cravings. Great discoveries." }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Great spots for Ramen" }),
  ).toHaveCount(0);
});

test("live Google Maps smoke @live", async ({ page }, testInfo) => {
  test.skip(
    !process.env.BITERADAR_LIVE_MAPS,
    "Opt-in: uses the configured Google Maps key and live map service.",
  );
  await fixtures(page);
  await signIn(page);
  await search(page);
  await expect(
    page.getByRole("region", { name: "Map", exact: true }),
  ).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.map-canvas[aria-busy="false"]')).toBeVisible({
    timeout: 20000,
  });
  await expect(
    page.getByRole("button", { name: "Zoom in", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("live-map-desktop.png"),
    fullPage: true,
    style: "nextjs-portal { display: none; }",
  });
  await page
    .locator(".map-canvas")
    .getByRole("img", { name: "The Ramen House", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveAccessibleName(
    "The Ramen House",
  );
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Show map" }).click();
  await expect(page.locator(".map-canvas")).toBeVisible();
  await page.getByRole("button", { name: "Show list" }).click();
  await expect(page.locator("#restaurant-1")).toHaveClass(/selected/);
});
