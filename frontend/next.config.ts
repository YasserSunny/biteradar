import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Isolate browser tests from the running manual-testing server.
  distDir: process.env.BITERADAR_TEST_BUILD === "1" ? ".next-test" : ".next",
};

export default nextConfig;
