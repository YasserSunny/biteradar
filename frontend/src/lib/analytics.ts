import { getAnalytics, isSupported, logEvent, Analytics } from "firebase/analytics";
import { app } from "../firebase";

let analyticsInstance: Analytics | null = null;
let initPromise: Promise<Analytics | null> | null = null;

export async function getClientAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined") return null;
  if (analyticsInstance) return analyticsInstance;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      const supported = await isSupported();
      if (supported && process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID) {
        analyticsInstance = getAnalytics(app);
        return analyticsInstance;
      }
    } catch (e) {
      console.warn("Firebase Analytics could not be initialized:", e);
    }
    return null;
  })();

  return initPromise;
}

export async function trackEvent(eventName: string, params?: Record<string, string | number | boolean>) {
  try {
    const analytics = await getClientAnalytics();
    if (analytics) {
      logEvent(analytics, eventName, params);
    }
  } catch (err) {
    // Non-blocking telemetry
    console.debug(`[Analytics] Event ${eventName}:`, err);
  }
}

// Strongly-typed event helpers for BiteRadar
export function trackSearch(
  dish: string,
  location: string,
  dietaryFilters?: string[],
  priceTier?: string,
  radiusKm?: number
) {
  trackEvent("search_executed", {
    dish_keyword: dish.toLowerCase().trim(),
    location_city: location.toLowerCase().trim(),
    dietary_count: dietaryFilters?.length || 0,
    dietary_tags: dietaryFilters?.join(",") || "none",
    price_tier: priceTier || "any",
    radius_km: radiusKm || 0,
  });
}

export function trackCardAction(
  actionType: "order" | "reserve" | "menu" | "directions" | "share",
  restaurantName: string,
  placeId?: string
) {
  trackEvent("card_action_clicked", {
    action_type: actionType,
    restaurant_name: restaurantName,
    place_id: placeId || "",
  });
}

export function trackFeedback(recommendationId: string, helpful: boolean) {
  trackEvent("recommendation_feedback", {
    recommendation_id: recommendationId,
    sentiment: helpful ? "positive" : "negative",
  });
}

export function trackConciergeInquiry(queryId: number, questionLength: number) {
  trackEvent("concierge_chat_inquiry", {
    query_id: queryId,
    question_length: questionLength,
  });
}

export function trackTrendingCraveClick(dishName: string) {
  trackEvent("trending_crave_clicked", {
    dish_name: dishName,
  });
}

export function trackRadarInsightsOpened(tab: string = "overview") {
  trackEvent("radar_insights_opened", {
    tab: tab,
  });
}
