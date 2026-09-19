"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { request, errorMessage } from "@/lib/api";
import {
  emptySearch,
  type HistoryItem,
  type Restaurant,
  type SearchInput,
} from "@/lib/types";
import {
  searchWithJob,
  pendingSearch,
  clearPendingSearch,
} from "@/lib/searchJobs";
import { trackSearch } from "@/lib/analytics";

const currentPosition = () =>
  new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("unsupported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      timeout: 10000,
      maximumAge: 300000,
    });
  });

const locationError = (error: unknown) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 1
  )
    return "Location permission was denied. Allow location access or enter a city or ZIP code.";
  if (error instanceof Error && error.message === "unsupported")
    return "Location is unavailable. Enter a city or ZIP code.";
  return "Could not determine your current location. Enter a city or ZIP code.";
};

export function useDiscovery(userId: string, onComplete: () => void) {
  const [draft, setDraft] = useState<SearchInput>(emptySearch);
  const [submitted, setSubmitted] = useState<SearchInput | null>(null);
  const [results, setResults] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchStep, setSearchStep] = useState(1);
  const [error, setError] = useState("");
  const [legacyHistory, setLegacyHistory] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const active = useRef<AbortController | null>(null);
  const completion = useRef(onComplete);
  useEffect(() => {
    completion.current = onComplete;
  }, [onComplete]);
  useEffect(() => () => active.current?.abort(), []);

  const execute = useCallback(
    async (input: SearchInput, history?: HistoryItem) => {
      let next = {
        ...input,
        dish_name: input.dish_name.trim(),
        location: input.location.trim(),
      };
      setDraft(next);
      if (!next.dish_name) {
        setError("Enter a dish to begin.");
        return;
      }
      active.current?.abort();
      const controller = new AbortController();
      active.current = controller;
      setLoading(true);
      setError("");
      if (!next.location) {
        try {
          const position = await currentPosition();
          if (controller.signal.aborted) return;
          next = {
            ...next,
            location: "Current location",
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setDraft(next);
        } catch (err) {
          if (!controller.signal.aborted) {
            setError(locationError(err));
            setLoading(false);
          }
          return;
        }
      }
      if (history) clearPendingSearch(userId);
      setSearchStep(1);
      const timers = [
        setTimeout(() => setSearchStep(2), history ? 400 : 1600),
        setTimeout(() => setSearchStep(3), history ? 800 : 3600),
      ];
      const clearSteps = () => timers.forEach(clearTimeout);
      controller.signal.addEventListener("abort", clearSteps, { once: true });
      try {
        let data: Restaurant[];
        if (history) {
          data = await request<Restaurant[]>(
            `/api/queries/${history.query_id}/recommendations`,
            { signal: controller.signal },
          );
        } else {
          trackSearch(
            next.dish_name,
            next.location,
            next.dietary_filters,
            next.price_tier || undefined,
            next.max_distance_km || undefined,
          );
          data = await searchWithJob(next, userId, controller.signal);
        }
        if (controller.signal.aborted) return;
        setResults(data);
        setSubmitted(next);
        setSelectedId(null);
        setRevision((r) => r + 1);
        setLegacyHistory(!!history && !history.search_context);
        const params = new URLSearchParams({
          dish: next.dish_name,
          loc: next.location,
        });
        window.history.replaceState(null, "", `?${params}`);
        document.title = `${next.dish_name} in ${next.location} | BiteRadar`;
        completion.current();
      } catch (err) {
        if (!controller.signal.aborted) setError(errorMessage(err));
      } finally {
        clearSteps();
        controller.signal.removeEventListener("abort", clearSteps);
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [userId],
  );

  const initial = useRef(false);
  useEffect(() => {
    if (initial.current) return;
    initial.current = true;
    const params = new URLSearchParams(window.location.search);
    const input = pendingSearch(userId)?.input || {
      ...emptySearch,
      dish_name: params.get("dish") || "",
      location: params.get("loc") || "",
    };
    // Defer so the Strict Mode effect rehearsal cannot abort the only initial search.
    const timer = window.setTimeout(() => {
      setDraft(input);
      if (input.dish_name && input.location) void execute(input);
    }, 0);
    return () => {
      clearTimeout(timer);
      initial.current = false;
    };
  }, [execute, userId]);

  const reset = () => {
    clearPendingSearch(userId);
    active.current?.abort();
    setLoading(false);
    setSubmitted(null);
    setResults([]);
    setError("");
    setSelectedId(null);
    setDraft((previous) => ({
      ...emptySearch,
      location: previous.location,
      lat: previous.lat,
      lng: previous.lng,
    }));
    window.history.replaceState(null, "", "/");
    document.title = "BiteRadar | AI-Powered Restaurant & Dish Finder";
  };
  const restore = (item: HistoryItem) =>
    execute(
      item.search_context
        ? {
            ...item.search_context,
            dietary_filters: item.search_context.dietary_filters || [],
          }
        : {
            ...emptySearch,
            dish_name: item.dish_name,
            location: item.location,
          },
      item,
    );
  return {
    draft,
    setDraft,
    submitted,
    results,
    setResults,
    loading,
    searchStep,
    error,
    setError,
    selectedId,
    setSelectedId,
    revision,
    execute,
    restore,
    reset,
    legacyHistory,
  };
}
