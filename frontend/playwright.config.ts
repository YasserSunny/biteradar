import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:3100",
    channel: "chrome",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_API_BASE_URL: "http://127.0.0.1:8100",
      ...(process.env.BITERADAR_LIVE_MAPS
        ? {}
        : { NEXT_PUBLIC_GOOGLE_MAPS_API_KEY: "" }),
      NEXT_PUBLIC_FIREBASE_API_KEY: "biteradar-browser-test",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "biteradar-test",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "biteradar-test.firebaseapp.com",
      NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: "",
    },
  },
});
