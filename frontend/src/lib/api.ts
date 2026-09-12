/**
 * BiteRadar API Configuration
 *
 * Resolves the backend API base URL dynamically:
 * - In production: set NEXT_PUBLIC_API_BASE_URL (e.g. https://biteradar-api-xyz.a.run.app)
 * - In local development: defaults to http://localhost:8000
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:8000";
