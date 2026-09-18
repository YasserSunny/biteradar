/**
 * BiteRadar API Configuration
 *
 * Keep browser requests on the frontend's origin. Next.js forwards /api to the
 * configured backend, so localhost refers to the server rather than a phone.
 */
export const API_BASE_URL = "";

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
