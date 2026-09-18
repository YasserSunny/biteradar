import type { NextConfig } from "next";

// The backend address is used by the server, never by the visiting device.
// Accept the previous setting to keep existing deployment configuration working.
const backendUrl = (
  process.env.API_BACKEND_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "http://127.0.0.1:8000"
).replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // Isolate browser tests from the running manual-testing server.
  distDir: process.env.BITERADAR_TEST_BUILD === "1" ? ".next-test" : ".next",
  allowedDevOrigins: (process.env.DEV_ALLOWED_ORIGINS || "")
    .split(",")
    .map((hostname) => hostname.trim())
    .filter(Boolean),
  // Uncached searches can take longer than the proxy's default 30 seconds.
  experimental: { proxyTimeout: 180_000 },
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
