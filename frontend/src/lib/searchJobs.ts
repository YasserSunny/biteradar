import { ApiError, request } from "./api";
import type { Restaurant, SearchInput } from "./types";

type Job = {
  job_id: string;
  status: "queued" | "running" | "completed" | "failed";
  results: Restaurant[] | null;
  error: string | null;
};
type Pending = { id: string; input: SearchInput; identity: string };
function requestId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const storageKey = (userId: string) => `biteradar-search-job:${userId}`;
// Ignore undefined optional fields, just as JSON request/storage serialization does.
const identity = (input: SearchInput) =>
  JSON.stringify(input, Object.keys(input).sort());

export function pendingSearch(userId: string): Pending | null {
  try {
    const value = JSON.parse(
      sessionStorage.getItem(storageKey(userId)) || "null",
    );
    return value &&
      typeof value.id === "string" &&
      typeof value.identity === "string" &&
      typeof value.input?.dish_name === "string" &&
      typeof value.input?.location === "string"
      ? value
      : null;
  } catch {
    return null;
  }
}
export function clearPendingSearch(userId: string) {
  try {
    sessionStorage.removeItem(storageKey(userId));
  } catch {
    // Searches still work when browser storage is unavailable.
  }
}
function remember(userId: string, pending: Pending) {
  try {
    sessionStorage.setItem(storageKey(userId), JSON.stringify(pending));
  } catch {
    // The in-memory ID still protects retries in this tab.
  }
}
function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      reject(new DOMException("Search cancelled", "AbortError"));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
async function shortRequest(
  path: string,
  signal: AbortSignal,
  init?: RequestInit,
) {
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) controller.abort();
  const timer = setTimeout(abort, 15_000);
  try {
    return await request<Job>(path, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", abort);
  }
}

export async function searchWithJob(
  input: SearchInput,
  userId: string,
  signal: AbortSignal,
): Promise<Restaurant[]> {
  const saved = pendingSearch(userId);
  const key = identity(input);
  const pending =
    saved?.identity === key ? saved : { id: requestId(), input, identity: key };
  remember(userId, pending);
  let accepted = false;
  let failures = 0;
  const deadline = Date.now() + 20 * 60_000;
  while (Date.now() < deadline) {
    if (signal.aborted)
      throw new DOMException("Search cancelled", "AbortError");
    let job: Job;
    try {
      job = accepted
        ? await shortRequest(`/api/search-jobs/${pending.id}`, signal)
        : await shortRequest("/api/search-jobs", signal, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": pending.id,
            },
            body: JSON.stringify({ ...input, user_id: userId }),
          });
      if (
        !job ||
        !["queued", "running", "completed", "failed"].includes(job.status) ||
        (job.status === "completed" && !Array.isArray(job.results))
      ) {
        throw new Error("The search response was incomplete.");
      }
      if (signal.aborted)
        throw new DOMException("Search cancelled", "AbortError");
      accepted = true;
      failures = 0;
    } catch (error) {
      if (signal.aborted) throw error;
      if (
        error instanceof ApiError &&
        error.status < 500 &&
        ![408, 429].includes(error.status)
      ) {
        clearPendingSearch(userId);
        throw error;
      }
      // A lost submission response reuses its ID; polling never repeats generation.
      failures += 1;
      if (failures >= 6) {
        throw new Error(
          error instanceof ApiError
            ? error.message
            : "The connection was interrupted. Retry this search to reconnect to its results.",
        );
      }
      await pause(Math.min(5000, failures * 1000), signal);
      continue;
    }
    if (job.status === "completed") {
      clearPendingSearch(userId);
      return job.results || [];
    }
    if (job.status === "failed") {
      clearPendingSearch(userId);
      throw new Error(
        job.error || "Search could not be completed. Please try again.",
      );
    }
    await pause(1000, signal);
  }
  throw new Error(
    "The search is taking longer than expected. Retry this search to reconnect to its results.",
  );
}
