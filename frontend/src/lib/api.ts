/**
 * BiteRadar API Configuration
 *
 * Resolves the backend API base URL dynamically:
 * - In production: set NEXT_PUBLIC_API_BASE_URL (e.g. https://biteradar-api-xyz.a.run.app)
 * - In local development: defaults to http://localhost:8000
 */
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:8000";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, init);
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      typeof body?.detail === "string"
        ? body.detail
        : "Something went wrong. Please try again.",
      response.status,
    );
  return body as T;
}
export function post<T>(path: string, body: unknown, signal?: AbortSignal) {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}
export function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
}
export function photoUrl(url: string) {
  return url.startsWith("/") ? `${API_BASE_URL}${url}` : url;
}
