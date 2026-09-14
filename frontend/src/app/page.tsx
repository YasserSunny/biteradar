"use client";

import { useState, useEffect } from "react";
import { APIProvider, Map, Marker, InfoWindow, useMap } from '@vis.gl/react-google-maps';
import { Autocomplete } from "../components/Autocomplete";
import { ProfileModal } from "../components/ProfileModal";
import { ErrorBoundary } from "../components/ErrorBoundary";
import { Logo } from "../components/Logo";
import { AuthCard } from "../components/AuthCard";
import { auth } from '../firebase';
import { signOut, onAuthStateChanged, User } from 'firebase/auth';
import { API_BASE_URL } from "@/lib/api";
import InsightsModal from "../components/InsightsModal";
import {
  trackSearch,
  trackCardAction,
  trackFeedback,
  trackConciergeInquiry,
  trackTrendingCraveClick
} from "../lib/analytics";

interface UserProfileData {
  name: string;
  preferred_cuisines: string[];
  favorite_dishes: string[];
}

interface SearchHistoryItem {
  id: number;
  query_id: number;
  dish_name: string;
  location: string;
  created_at: string;
}

interface DishItem {
  id: number;
  name: string;
  cuisine?: string;
  description?: string;
  primary_photo_url?: string;
  typical_price_range?: string;
  dietary_attributes?: string[];
  search_count: number;
}

interface ChatMessage {
  sender: 'user' | 'assistant';
  text: string;
  cited_restaurants?: string[];
}

interface Restaurant {
  id: string;
  place_id: string;
  name: string;
  rating: number;
  total_reviews: number;
  price_level?: string;
  dish_price?: string;
  dietary_tags?: string[];
  amenities?: string[];
  summary?: string;
  open_now?: boolean;
  website?: string;
  reason: string;
  helpful_quote?: string;
  lat: number;
  lng: number;
  helpful?: boolean | null;
  photo_url?: string;
  delivery_url?: string;
  reservation_url?: string;
  query_id?: number;
}


/**
 * Handles Google Maps viewport resize and recentering
 * when toggling between List and Map views on mobile.
 */
function MapResizeTrigger({
  activeTab,
}: {
  activeTab: string;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || activeTab !== 'map') return;

    const triggerResize = () => {
      const div = map.getDiv();
      if (div && div.clientWidth > 0 && div.clientHeight > 0) {
        if (typeof window !== "undefined" && (window as any).google?.maps?.event) {
          (window as any).google.maps.event.trigger(map, "resize");
        }
      }
    };

    const t = setTimeout(triggerResize, 150);
    return () => clearTimeout(t);
  }, [map, activeTab]);

  return null;
}

/**
 * Custom Zoom Controls providing reliable, touch-friendly Zoom In (+)
 * and Zoom Out (-) actions directly via the Google Maps instance.
 */
function MapControls() {
  const map = useMap();

  const handleZoomIn = () => {
    if (!map) return;
    const current = map.getZoom() ?? 13;
    map.setZoom(Math.min(21, current + 1));
  };

  const handleZoomOut = () => {
    if (!map) return;
    const current = map.getZoom() ?? 13;
    map.setZoom(Math.max(2, current - 1));
  };

  return (
    <div className="absolute right-3.5 bottom-6 flex flex-col bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden z-10 select-none">
      <button
        type="button"
        onClick={handleZoomIn}
        className="w-10 h-10 flex items-center justify-center font-bold text-gray-700 hover:bg-orange-50 hover:text-orange-600 active:bg-orange-100 border-b border-gray-100 transition text-xl cursor-pointer"
        title="Zoom in (Closer detail)"
        aria-label="Zoom in"
      >
        +
      </button>
      <button
        type="button"
        onClick={handleZoomOut}
        className="w-10 h-10 flex items-center justify-center font-bold text-gray-700 hover:bg-orange-50 hover:text-orange-600 active:bg-orange-100 transition text-xl cursor-pointer"
        title="Zoom out (Wider area)"
        aria-label="Zoom out"
      >
        −
      </button>
    </div>
  );
}

export default function Home() {
  const [dishName, setDishName] = useState("");
  const [location, setLocation] = useState("");
  const [results, setResults] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Profile & History State
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isInsightsOpen, setIsInsightsOpen] = useState(false);
  const [isFirstTimeProfile, setIsFirstTimeProfile] = useState(false);
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [searchStep, setSearchStep] = useState<number | null>(null);
  const [mobileTab, setMobileTab] = useState<'list' | 'map'>('list');
  const [locationDetected, setLocationDetected] = useState(false);
  const [selectedCoords, setSelectedCoords] = useState<{ lat: number; lng: number } | null>(null);

  // Default center (NYC initially, overwritten immediately by geolocation)
  const [mapCenter, setMapCenter] = useState({ lat: 40.7128, lng: -74.0060 });
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [shareToast, setShareToast] = useState<string | null>(null);

  // Phase 5 Quick Filters & Trending Catalog State
  const [trendingDishes, setTrendingDishes] = useState<DishItem[]>([]);
  const [selectedDietary, setSelectedDietary] = useState<string[]>([]);
  const [selectedPrice, setSelectedPrice] = useState<string | null>(null);
  const [selectedRadiusKm, setSelectedRadiusKm] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(true);

  // AI Foodie Chat Concierge State
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  const fetchTrendingDishes = async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/dishes/trending?limit=8`);
      if (res.ok) {
        const data = await res.json();
        setTrendingDishes(data);
      }
    } catch (err) {
      console.error("Error fetching trending dishes:", err);
    }
  };

  useEffect(() => {
    fetchTrendingDishes();
  }, []);

  const toggleDietary = (tag: string) => {
    setSelectedDietary((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const handleSelectTrend = (dish: string, loc?: string) => {
    const targetLoc = loc || location || "New York";
    setDishName(dish);
    if (loc) {
      setLocation(loc);
      setSelectedCoords(null);
    }
    executeSearch(dish, targetLoc);
  };

  const selectedPlace = results.find((r) => String(r.id) === selectedPlaceId);


  const handleSelectPlace = (id: string) => {
    setSelectedPlaceId(id);
    const place = results.find((r) => String(r.id) === id);
    if (place && place.lat && place.lng) {
      setMapCenter({ lat: place.lat, lng: place.lng });
    }
    const card = document.getElementById(`restaurant-card-${id}`);
    if (card) {
      card.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  };

  // Auto-detect user current location (GPS + IP fallback) unless deep-link query present
  useEffect(() => {
    if (locationDetected) return;

    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      const urlDish = p.get("dish");
      const urlLoc = p.get("loc");
      if (urlDish || urlLoc) {
        if (urlDish) setDishName(urlDish);
        if (urlLoc) setLocation(urlLoc);
        setLocationDetected(true);
        if (urlDish && urlLoc) {
          executeSearch(urlDish, urlLoc);
        }
        return;
      }
    }

    const detectLocation = () => {
      if (typeof window !== "undefined" && navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const userLat = pos.coords.latitude;
            const userLng = pos.coords.longitude;
            setMapCenter({ lat: userLat, lng: userLng });
            setSelectedCoords({ lat: userLat, lng: userLng });
            setLocationDetected(true);

            // Reverse geocode to get city name for search input if empty
            fetch(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${userLat}&longitude=${userLng}&localityLanguage=en`
            )
              .then((res) => res.json())
              .then((data) => {
                const city = data.city || data.locality || "";
                const state = data.principalSubdivisionCode || data.countryCode || "";
                if (city) {
                  setLocation(state ? `${city}, ${state}` : city);
                }
              })
              .catch(() => {});
          },
          (err) => {
            console.warn("Browser GPS blocked or unavailable, using IP approximation:", err);
            fetch("https://ipapi.co/json/")
              .then((res) => res.json())
              .then((ipData) => {
                if (ipData.latitude && ipData.longitude) {
                  setMapCenter({ lat: ipData.latitude, lng: ipData.longitude });
                  setSelectedCoords({ lat: ipData.latitude, lng: ipData.longitude });
                }
                const city = ipData.city || "";
                const region = ipData.region_code || ipData.region || "";
                if (city) {
                  setLocation(region ? `${city}, ${region}` : city);
                }
                setLocationDetected(true);
              })
              .catch(() => {});
          },
          { timeout: 8000 }
        );
      } else {
        fetch("https://ipapi.co/json/")
          .then((res) => res.json())
          .then((ipData) => {
            if (ipData.latitude && ipData.longitude) {
              setMapCenter({ lat: ipData.latitude, lng: ipData.longitude });
              setSelectedCoords({ lat: ipData.latitude, lng: ipData.longitude });
            }
            const city = ipData.city || "";
            const region = ipData.region_code || ipData.region || "";
            if (city) {
              setLocation(region ? `${city}, ${region}` : city);
            }
            setLocationDetected(true);
          })
          .catch(() => {});
      }
    };

    detectLocation();
  }, [locationDetected]);

  const fetchProfile = async (uid: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/profile/${uid}`);
      if (res.ok) {
        const data = await res.json();
        setProfile(data);
      } else if (res.status === 404) {
        setIsFirstTimeProfile(true);
        setIsProfileModalOpen(true);
      }
    } catch (err) {
      console.error("Error fetching profile:", err);
    }
  };

  const fetchHistory = async (uid: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/history/${uid}`);
      if (res.ok) {
        const data = await res.json();
        setSearchHistory(data);
      }
    } catch (err) {
      console.error("Error fetching history:", err);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser) {
        fetchProfile(currentUser.uid);
        fetchHistory(currentUser.uid);
      } else {
        setProfile(null);
        setSearchHistory([]);
      }
    });
    return () => unsubscribe();
  }, []);


  const handleLogout = async () => {
    try {
      await signOut(auth);
      setResults([]);
      setSelectedPlaceId(null);
      setErrorBanner(null);
      setProfile(null);
      setSearchHistory([]);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleLocationSelect = (place: google.maps.places.PlaceResult | null, inputValue: string) => {
    setLocation(inputValue);
    if (place && place.geometry && place.geometry.location) {
      const lat = typeof place.geometry.location.lat === 'function'
        ? place.geometry.location.lat()
        : (place.geometry.location as any).lat;
      const lng = typeof place.geometry.location.lng === 'function'
        ? place.geometry.location.lng()
        : (place.geometry.location as any).lng;
      setSelectedCoords({ lat, lng });
      setMapCenter({ lat, lng });
    } else {
      setSelectedCoords(null);
    }
  };

  const executeSearch = async (
    targetDish: string,
    targetLocation: string,
    dietaryOverrides?: string[],
    priceOverride?: string | null,
    radiusOverride?: number | null
  ) => {
    const finalDish = targetDish.trim();
    const finalLocation = targetLocation.trim();
    const finalDietary = dietaryOverrides !== undefined ? dietaryOverrides : selectedDietary;
    const finalPrice = priceOverride !== undefined ? priceOverride : selectedPrice;
    const finalRadius = radiusOverride !== undefined ? radiusOverride : selectedRadiusKm;

    if (!finalDish) {
      setErrorBanner("Please enter what dish you are craving.");
      return;
    }
    if (!finalLocation) {
      setErrorBanner("Please enter a city or zip code (or wait for auto-location detection).");
      return;
    }

    setErrorBanner(null);
    setDishName(finalDish);
    setLocation(finalLocation);
    setLoading(true);
    setSearchStep(1);
    setResults([]);
    setSelectedPlaceId(null);
    setChatMessages([]);

    const t1 = setTimeout(() => setSearchStep(2), 1600);
    const t2 = setTimeout(() => setSearchStep(3), 3600);

    try {
      const searchPayload: Record<string, any> = {
        dish_name: finalDish,
        location: finalLocation,
        user_id: user?.uid,
        dietary_filters: finalDietary,
        price_tier: finalPrice,
        max_distance_km: finalRadius
      };
      if (selectedCoords) {
        searchPayload.lat = selectedCoords.lat;
        searchPayload.lng = selectedCoords.lng;
      }

      trackSearch(finalDish, finalLocation, finalDietary, finalPrice || undefined, finalRadius || undefined);

      const response = await fetch(`${API_BASE_URL}/api/search`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(searchPayload),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || "Failed to get recommendations. Please check your query and try again.");
      }

      const data: Restaurant[] = await response.json();
      setResults(data);
      
      if (data.length > 0) {
        setMapCenter({ lat: data[0].lat, lng: data[0].lng });
        setChatMessages([
          {
            sender: 'assistant',
            text: `Hi! I'm your AI Foodie Concierge for **${finalDish}** in **${finalLocation}**. Ask me anything about these spots—pricing, wait times, vibe, or dietary options!`
          }
        ]);
      }

      fetchTrendingDishes();

      // Synchronize URL search params and dynamic document title
      if (typeof window !== "undefined") {
        const p = new URLSearchParams();
        p.set("dish", finalDish);
        p.set("loc", finalLocation);
        const newUrl = `${window.location.pathname}?${p.toString()}`;
        window.history.replaceState({ ...window.history.state, as: newUrl, url: newUrl }, "", newUrl);
      }
      if (typeof document !== "undefined") {
        document.title = `${finalDish} in ${finalLocation} | BiteRadar`;
      }

      if (user) {
        fetchHistory(user.uid);
      }
    } catch (error: any) {
      console.error("Error fetching data:", error);
      setErrorBanner(error.message || "Could not connect to BiteRadar search service. Please make sure the server is running.");
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
      setLoading(false);
      setSearchStep(null);
    }
  };

  const handleSendChat = async (messageText: string) => {
    const text = messageText.trim();
    if (!text || chatLoading) return;
    const qId = results[0]?.query_id;
    if (!qId) return;

    const newHistory: ChatMessage[] = [...chatMessages, { sender: 'user', text }];
    setChatMessages(newHistory);
    setChatInput("");
    setChatLoading(true);

    trackConciergeInquiry(qId, text.length);

    try {
      const payload = {
        query_id: qId,
        message: text,
        history: newHistory.map((m) => ({ sender: m.sender, text: m.text }))
      };
      const res = await fetch(`${API_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const data = await res.json();
        setChatMessages((prev) => [
          ...prev,
          {
            sender: 'assistant',
            text: data.response,
            cited_restaurants: data.cited_restaurants || []
          }
        ]);
      } else {
        setChatMessages((prev) => [
          ...prev,
          {
            sender: 'assistant',
            text: "I couldn't process that question right now, but feel free to ask another question about these spots!"
          }
        ]);
      }
    } catch (err) {
      console.error("Chat error:", err);
      setChatMessages((prev) => [
        ...prev,
        {
          sender: 'assistant',
          text: "Sorry, I had trouble reaching the foodie assistant. Please try again in a moment!"
        }
      ]);
    } finally {
      setChatLoading(false);
    }
  };


  const handleShare = async (dish?: string, loc?: string, placeName?: string) => {
    const targetDish = (dish || dishName).trim();
    const targetLoc = (loc || location).trim();
    if (!targetDish || !targetLoc) return;

    const shareUrl = typeof window !== "undefined"
      ? `${window.location.origin}/?dish=${encodeURIComponent(targetDish)}&loc=${encodeURIComponent(targetLoc)}`
      : "";

    const title = placeName
      ? `${placeName} - Best ${targetDish} in ${targetLoc} | BiteRadar`
      : `Top ${targetDish} spots in ${targetLoc} | BiteRadar`;
    const text = `Check out the top-ranked ${targetDish} recommendations in ${targetLoc} on BiteRadar!`;

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, text, url: shareUrl });
        return;
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.warn("Navigator share failed, copying to clipboard:", err);
        } else {
          return;
        }
      }
    }

    if (typeof navigator !== "undefined" && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        setShareToast("Link copied to clipboard! 📋");
        setTimeout(() => setShareToast(null), 3000);
      } catch (err) {
        console.error("Failed to copy link to clipboard:", err);
      }
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    executeSearch(dishName, location);
  };

  const handleQuickCraveClick = (dish: string) => {
    const activeLoc = location.trim();
    // 1. Check if this dish was already searched in recent history
    const matched = searchHistory.find(
      (h) =>
        h.dish_name.toLowerCase().trim() === dish.toLowerCase().trim() &&
        (!activeLoc || h.location.toLowerCase().includes(activeLoc.toLowerCase()) || activeLoc.toLowerCase().includes(h.location.toLowerCase()))
    );

    if (matched) {
      // Instant load from cached history!
      handleHistoryClick(matched);
    } else {
      // Triggers backend search (which checks DB cache table first)
      executeSearch(dish, activeLoc);
    }
  };

  const handleHistoryClick = async (item: SearchHistoryItem) => {
    setDishName(item.dish_name);
    setLocation(item.location);
    setSelectedCoords(null);
    setLoading(true);
    setSearchStep(1);
    setResults([]);
    setSelectedPlaceId(null);

    const t1 = setTimeout(() => setSearchStep(2), 400);
    const t2 = setTimeout(() => setSearchStep(3), 800);

    try {
      const response = await fetch(`${API_BASE_URL}/api/queries/${item.query_id}/recommendations`);
      if (response.ok) {
        const data = await response.json();
        setResults(data);
        if (data.length > 0) {
          setMapCenter({ lat: data[0].lat, lng: data[0].lng });
        }
      } else {
        // Fallback to searching if cached query not found
        const fallbackRes = await fetch(`${API_BASE_URL}/api/search`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dish_name: item.dish_name, location: item.location, user_id: user?.uid }),
        });
        const data = await fallbackRes.json();
        setResults(data);
        if (data.length > 0) {
          setMapCenter({ lat: data[0].lat, lng: data[0].lng });
        }
      }
    } catch (error) {
      console.error("Error loading past search:", error);
    } finally {
      clearTimeout(t1);
      clearTimeout(t2);
      setLoading(false);
      setSearchStep(null);
    }
  };

  const submitFeedback = async (id: string, helpful: boolean) => {
    try {
      trackFeedback(id, helpful);
      await fetch(`${API_BASE_URL}/api/feedback`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ recommendation_id: parseInt(id), helpful }),
      });
      
      // Update local state to reflect feedback
      setResults(results.map(r => r.id === id ? { ...r, helpful } : r));
    } catch (error) {
      console.error("Error submitting feedback:", error);
    }
  };

  const apiKey =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    "AIzaSyCpHZeYOSoE3Mn4kszP8dKdNKcs4edWzIw";

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p>Loading...</p></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50/50 via-gray-50 to-amber-50/40 flex flex-col items-center justify-center p-4">
        <AuthCard
          onError={(msg) => setErrorBanner(msg)}
        />
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <APIProvider apiKey={apiKey} libraries={['places']}>
        <div className="min-h-screen bg-gray-50 flex flex-col items-center">
          {/* Header / Search Bar */}
          <header className="w-full bg-white shadow-sm p-6 flex flex-col items-center relative">
            <div className="absolute right-6 top-6 flex items-center gap-2.5">
              <button
                onClick={() => setIsInsightsOpen(true)}
                className="text-xs font-semibold text-slate-700 bg-orange-50/80 hover:bg-orange-100 text-orange-700 py-1.5 px-3 rounded-full border border-orange-200/90 transition flex items-center gap-1.5 shadow-2xs cursor-pointer active:scale-95"
                title="View community food radar insights & trends"
              >
                <span>📊</span>
                <span className="hidden sm:inline">Radar Insights</span>
              </button>
              <button
                onClick={() => {
                  setIsFirstTimeProfile(false);
                  setIsProfileModalOpen(true);
                }}
                className="text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-orange-50 hover:text-orange-700 py-1.5 px-3 rounded-full border border-gray-200 transition flex items-center gap-1.5 cursor-pointer"
                title="Edit food preferences"
              >
                <span>👤</span>
                <span>{profile?.name || user.displayName || user.email}</span>
                <span className="text-gray-400 text-[10px]">⚙️</span>
              </button>
              <button onClick={handleLogout} className="text-xs text-red-600 hover:underline font-medium cursor-pointer">Logout</button>
            </div>
            
            <div className="mb-6 flex justify-center">
              <Logo size="md" orientation="horizontal" />
            </div>

            {/* Error Banner */}
            {errorBanner && (
              <div className="w-full max-w-3xl mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl flex items-center justify-between gap-3 text-sm shadow-sm animate-in fade-in">
                <div className="flex items-center gap-2">
                  <span className="text-red-500 font-bold text-base">⚠️</span>
                  <span className="font-medium">{errorBanner}</span>
                </div>
                <button
                  onClick={() => setErrorBanner(null)}
                  className="text-red-400 hover:text-red-700 font-bold text-xl leading-none cursor-pointer px-1"
                  title="Dismiss error"
                >
                  ×
                </button>
              </div>
            )}

            <form onSubmit={handleSearch} className="flex gap-4 w-full max-w-3xl">
            <input
              type="text"
              placeholder="What are you craving? (e.g. Spicy Tuna Roll)"
              className="flex-1 p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 text-black"
              value={dishName}
              onChange={(e) => setDishName(e.target.value)}
              required
            />
            <Autocomplete
              value={location}
              placeholder="Zip or City"
              className="w-48 p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 text-black"
              onPlaceSelect={handleLocationSelect}
            />
            <button
              type="submit"
              className="bg-orange-600 text-white font-semibold py-3 px-6 rounded-lg hover:bg-orange-700 transition disabled:opacity-85 flex items-center justify-center min-w-[140px]"
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2 text-sm">
                  <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {searchStep === 1
                    ? "Searching..."
                    : searchStep === 2
                    ? "Compiling..."
                    : "Making a list..."}
                </span>
              ) : (
                "Search"
              )}
            </button>
          </form>

          {/* Phase 5 Quick Filters Toolbar (Dietary, Price, Distance Radius) */}
          <div className="mt-4 flex flex-col gap-2 w-full max-w-3xl">
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShowFilters(!showFilters)}
                className="text-xs font-bold text-gray-700 hover:text-orange-600 flex items-center gap-1.5 transition cursor-pointer"
              >
                <span>🎯</span>
                <span>{showFilters ? "Hide Filters" : "Show Filters (Dietary, Price, Radius)"}</span>
                <span className="text-[10px] text-gray-400">{showFilters ? "▲" : "▼"}</span>
                {(selectedDietary.length > 0 || selectedPrice || selectedRadiusKm) && (
                  <span className="ml-1 bg-orange-100 text-orange-800 text-[10px] px-1.5 py-0.5 rounded-full font-extrabold">
                    {selectedDietary.length + (selectedPrice ? 1 : 0) + (selectedRadiusKm ? 1 : 0)} active
                  </span>
                )}
              </button>
              {(selectedDietary.length > 0 || selectedPrice || selectedRadiusKm) && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDietary([]);
                    setSelectedPrice(null);
                    setSelectedRadiusKm(null);
                  }}
                  className="text-[11px] text-gray-500 hover:text-gray-800 underline cursor-pointer"
                >
                  Reset filters
                </button>
              )}
            </div>

            {showFilters && (
              <div className="bg-white/90 p-3 rounded-xl border border-gray-200 shadow-2xs flex flex-col gap-3 animate-in fade-in duration-200">
                {/* Dietary Quick Filters */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">Dietary:</span>
                  {[
                    { label: "Vegan", icon: "🌱" },
                    { label: "Halal", icon: "🥩" },
                    { label: "Vegetarian", icon: "🥗" },
                    { label: "Gluten-Free", icon: "🌾" },
                    { label: "Kosher", icon: "✡️" },
                    { label: "Dairy-Free", icon: "🥛" }
                  ].map(({ label, icon }) => {
                    const isActive = selectedDietary.includes(label);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleDietary(label)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-full border transition cursor-pointer ${
                          isActive
                            ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                            : "bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200"
                        }`}
                      >
                        <span>{icon}</span>
                        <span>{label}</span>
                        {isActive && <span className="text-[10px] ml-0.5">✓</span>}
                      </button>
                    );
                  })}
                </div>

                {/* Price Tier & Distance Radius Filters */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-gray-100">
                  {/* Price Tiers */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">Price:</span>
                    {["$", "$$", "$$$", "$$$$"].map((tier) => {
                      const isActive = selectedPrice === tier;
                      return (
                        <button
                          key={tier}
                          type="button"
                          onClick={() => setSelectedPrice(isActive ? null : tier)}
                          className={`w-9 h-7 flex items-center justify-center text-xs font-bold rounded-lg border transition cursor-pointer ${
                            isActive
                              ? "bg-amber-500 text-white border-amber-500 shadow-xs"
                              : "bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200"
                          }`}
                        >
                          {tier}
                        </button>
                      );
                    })}
                  </div>

                  {/* Distance Radius */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mr-1">Radius:</span>
                    {[
                      { label: "Any", val: null },
                      { label: "Walk (~1 mi)", val: 1.6 },
                      { label: "Drive (~5 mi)", val: 8.0 },
                      { label: "Metro (~15 mi)", val: 24.0 }
                    ].map(({ label, val }) => {
                      const isActive = selectedRadiusKm === val;
                      return (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setSelectedRadiusKm(val)}
                          className={`px-2 py-1 text-xs font-semibold rounded-lg border transition cursor-pointer ${
                            isActive
                              ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                              : "bg-gray-50 text-gray-700 hover:bg-gray-100 border-gray-200"
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Trending Craves from Dishes Catalog */}
          {trendingDishes.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5 w-full max-w-3xl">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">🔥 Trending Craves:</span>
              {trendingDishes.map((dish) => (
                <button
                  key={dish.id}
                  type="button"
                  onClick={() => {
                    trackTrendingCraveClick(dish.name);
                    setDishName(dish.name);
                    executeSearch(dish.name, location || "New York");
                  }}
                  disabled={loading}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-orange-50 hover:bg-orange-100 text-orange-900 text-xs font-medium rounded-full border border-orange-200 shadow-2xs transition cursor-pointer disabled:opacity-50"
                  title={`Search trending dish: ${dish.name} (${dish.search_count} searches)`}
                >
                  <span>🍽️</span>
                  <span className="font-semibold">{dish.name}</span>
                  <span className="text-[10px] text-orange-600 font-bold">({dish.search_count})</span>
                </button>
              ))}
            </div>
          )}

          {/* Recent Search Queries (Last 5) */}
          {searchHistory.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2 w-full max-w-3xl">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">Recent Searches:</span>

              {searchHistory.map((item) => (
                <button
                  key={item.id}
                  onClick={() => handleHistoryClick(item)}
                  disabled={loading}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-white hover:bg-orange-50 text-gray-800 hover:text-orange-700 text-xs font-medium rounded-full border border-gray-200 hover:border-orange-300 shadow-sm transition cursor-pointer"
                  title={`Click to view results for ${item.dish_name} in ${item.location}`}
                >
                  <span className="text-orange-500">🕒</span>
                  <span className="font-semibold">{item.dish_name}</span>
                  <span className="text-gray-500">in {item.location}</span>
                </button>
              ))}
            </div>
          )}

          {/* 1-Click Quick Crave Favorite Dishes from Profile */}
          {profile?.favorite_dishes && profile.favorite_dishes.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5 w-full max-w-3xl">
              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Your Favorites:</span>
              {profile.favorite_dishes.map((dish) => (
                <button
                  key={dish}
                  type="button"
                  onClick={() => handleQuickCraveClick(dish)}
                  disabled={loading}
                  className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-medium rounded-full border border-amber-200 shadow-xs transition cursor-pointer disabled:opacity-50"
                  title={`1-Click search for ${dish}`}
                >
                  <span>✨</span>
                  <span>{dish}</span>
                </button>
              ))}
            </div>
          )}
        </header>

        {/* Mobile View Toggle Switch (Small screens only) */}
        <div className="flex md:hidden justify-center w-full px-4 pt-4">
          <div className="bg-gray-200 p-1 rounded-xl flex gap-1 shadow-inner w-full max-w-xs">
            <button
              onClick={() => setMobileTab('list')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                mobileTab === 'list' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>📋</span>
              <span>List {results.length > 0 ? `(${results.length})` : ''}</span>
            </button>
            <button
              onClick={() => setMobileTab('map')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1.5 ${
                mobileTab === 'map' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <span>🗺️</span>
              <span>Map</span>
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        <main className="flex-1 w-full max-w-7xl p-3 sm:p-4 md:p-6 flex flex-col md:flex-row gap-4 md:gap-6">
          {/* Map Area */}
          <div className={`w-full flex-1 rounded-2xl overflow-hidden shadow-inner border border-gray-300 relative transition-all duration-200 ${
            mobileTab === 'map' ? 'h-[calc(100dvh-270px)] min-h-[420px] block' : 'hidden md:block md:h-[650px] md:min-h-[600px]'
          }`}>
            {!apiKey && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-200 bg-opacity-90">
                <p className="text-gray-700 text-lg font-medium p-4 text-center">
                  Google Maps API Key missing.<br/>
                  <span className="text-sm">Please add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to frontend/.env.local</span>
                </p>
              </div>
            )}
            <Map 
              style={{ width: '100%', height: '100%' }}
              defaultZoom={13} 
              center={mapCenter} 
              onCenterChanged={(ev) => setMapCenter(ev.detail.center)}
              gestureHandling={'greedy'} 
              disableDefaultUI={false}
              zoomControl={false}
              mapTypeControl={false}
              streetViewControl={false}
              fullscreenControl={false}
            >
              <MapResizeTrigger activeTab={mobileTab} />
              <MapControls />
              {results.map((r, i) => (
                <Marker 
                  key={r.id} 
                  position={{ lat: r.lat, lng: r.lng }} 
                  title={r.name} 
                  label={(i + 1).toString()}
                  onClick={() => handleSelectPlace(String(r.id))}
                  onMouseOver={() => handleSelectPlace(String(r.id))}
                />
              ))}

              {selectedPlace && (
                <InfoWindow
                  position={{ lat: selectedPlace.lat, lng: selectedPlace.lng }}
                  onCloseClick={() => setSelectedPlaceId(null)}
                >
                  <div className="p-1 max-w-[240px] text-gray-900 flex flex-col gap-1.5">
                    <div>
                      <h4 className="font-bold text-sm text-gray-900 leading-snug">
                        {selectedPlace.name}
                      </h4>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-xs">
                        <span className="font-bold text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          ★ {selectedPlace.rating} ({selectedPlace.total_reviews})
                        </span>
                        {selectedPlace.dish_price ? (
                          <span className="text-amber-900 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded font-bold text-[10px] inline-flex items-center gap-0.5" title="Dish price estimate">
                            <span>🏷️</span>
                            <span>{selectedPlace.dish_price}</span>
                          </span>
                        ) : selectedPlace.price_level ? (
                          <span className="text-gray-700 bg-gray-100 px-1.5 py-0.5 rounded font-medium">
                            {selectedPlace.price_level}
                          </span>
                        ) : null}
                        {selectedPlace.open_now !== undefined && selectedPlace.open_now !== null && (
                          <span className={`px-1.5 py-0.5 rounded-full font-bold text-[10px] inline-flex items-center gap-1 ${
                            selectedPlace.open_now 
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                              : "bg-rose-50 text-rose-700 border border-rose-200"
                          }`}>
                            <span className={`w-1 h-1 rounded-full ${selectedPlace.open_now ? "bg-emerald-500" : "bg-rose-500"}`}></span>
                            {selectedPlace.open_now ? "Open" : "Closed"}
                          </span>
                        )}
                      </div>
                      {((selectedPlace.dietary_tags && selectedPlace.dietary_tags.length > 0) || (selectedPlace.amenities && selectedPlace.amenities.length > 0)) && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedPlace.dietary_tags?.slice(0, 2).map((tag) => (
                            <span key={tag} className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded-full font-semibold">
                              {tag}
                            </span>
                          ))}
                          {selectedPlace.amenities?.slice(0, 2).map((amenity) => (
                            <span key={amenity} className="text-[10px] bg-blue-50 text-blue-800 border border-blue-200 px-1.5 py-0.5 rounded-full font-semibold">
                              {amenity}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {selectedPlace.helpful_quote ? (
                      <p className="text-[11px] text-orange-950 italic bg-orange-50/80 p-1.5 rounded border border-orange-100 leading-snug line-clamp-3">
                        "{selectedPlace.helpful_quote}"
                      </p>
                    ) : selectedPlace.reason ? (
                      <p className="text-[11px] text-gray-600 line-clamp-2 leading-snug">
                        {selectedPlace.reason}
                      </p>
                    ) : null}

                    <div className="flex items-center gap-1.5 pt-1 border-t border-gray-100">
                      <button
                        type="button"
                        onClick={() => {
                          setMobileTab('list');
                          const card = document.getElementById(`restaurant-card-${selectedPlace.id}`);
                          if (card) {
                            setTimeout(() => card.scrollIntoView({ behavior: "smooth", block: "center" }), 100);
                          }
                        }}
                        className="md:hidden text-[11px] font-semibold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded border border-blue-200 cursor-pointer"
                        title="View details in List"
                      >
                        📋 List
                      </button>
                      {selectedPlace.website && (
                        <a
                          href={selectedPlace.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] font-semibold text-gray-700 hover:text-orange-600 bg-gray-50 px-2 py-0.5 rounded border border-gray-200"
                        >
                          📖 Menu
                        </a>
                      )}
                      <a
                        href={
                          selectedPlace.place_id
                            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedPlace.name)}&query_place_id=${selectedPlace.place_id}`
                            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedPlace.name + ' ' + (location || ''))}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-semibold text-orange-700 hover:text-orange-800 bg-orange-50 px-2 py-0.5 rounded border border-orange-200 ml-auto flex items-center gap-0.5"
                      >
                        <span>📍</span>
                        <span>Directions</span>
                      </a>
                    </div>
                  </div>
                </InfoWindow>
              )}
            </Map>
          </div>

          {/* Results List */}
          <div className={`w-full md:w-1/3 flex flex-col gap-4 md:overflow-y-auto md:max-h-[650px] ${
            mobileTab === 'list' ? 'block' : 'hidden md:flex'
          }`}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-xl font-bold text-gray-800">Results</h2>
              {results.length > 0 && (
                <button
                  type="button"
                  onClick={() => handleShare(dishName, location)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 px-3 py-1.5 rounded-lg transition active:scale-95 cursor-pointer shadow-2xs"
                  title="Share entire list of recommendations"
                >
                  <span>📤</span>
                  <span>Share Search</span>
                </button>
              )}
            </div>
            {results.length > 0 && (
              <p className="text-xs text-gray-500 -mt-2">
                Top <span className="font-semibold text-gray-800">{results.length}</span> spots for{" "}
                <span className="font-semibold text-orange-600">{dishName}</span> in{" "}
                <span className="font-semibold text-gray-800">{location}</span>
              </p>
            )}
            {results.length === 0 && !loading && (
              <p className="text-gray-500">Enter a dish and location to find the best spots!</p>
            )}

            {/* Step-by-Step Animated Loading Card */}
            {loading && (
              <div className="bg-white p-5 rounded-2xl shadow-sm border border-orange-100 flex flex-col gap-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between pb-3 border-b border-gray-100">
                  <span className="text-xs font-bold uppercase tracking-wider text-orange-600 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping"></span>
                    Progress
                  </span>
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                    Step {searchStep || 1} of 3
                  </span>
                </div>

                {/* Animated Progress Bar */}
                <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                  <div 
                    className="bg-orange-500 h-2 rounded-full transition-all duration-700 ease-out"
                    style={{ width: searchStep === 1 ? '33%' : searchStep === 2 ? '66%' : '95%' }}
                  />
                </div>

                {/* Step 1: Searching */}
                <div className="flex items-start gap-3.5 pt-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 shrink-0 ${
                    (searchStep || 1) > 1 
                      ? "bg-green-100 text-green-700" 
                      : "bg-orange-500 text-white animate-pulse ring-4 ring-orange-100"
                  }`}>
                    {(searchStep || 1) > 1 ? "✓" : "1"}
                  </div>
                  <div>
                    <h4 className={`text-sm font-semibold transition ${
                      (searchStep || 1) >= 1 ? "text-gray-900" : "text-gray-400"
                    }`}>
                      1. Searching
                    </h4>
                    <p className="text-xs text-gray-500">
                      Querying Google Maps & Yelp for matching spots and reviews
                    </p>
                  </div>
                </div>

                {/* Step 2: Compiling */}
                <div className="flex items-start gap-3.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 shrink-0 ${
                    (searchStep || 1) > 2
                      ? "bg-green-100 text-green-700"
                      : (searchStep || 1) === 2
                      ? "bg-orange-500 text-white animate-pulse ring-4 ring-orange-100"
                      : "bg-gray-100 text-gray-400"
                  }`}>
                    {(searchStep || 1) > 2 ? "✓" : "2"}
                  </div>
                  <div>
                    <h4 className={`text-sm font-semibold transition ${
                      (searchStep || 1) >= 2 ? "text-gray-900" : "text-gray-400"
                    }`}>
                      2. Compiling
                    </h4>
                    <p className="text-xs text-gray-500">
                      Synthesizing review sentiment, authenticity, and ratings
                    </p>
                  </div>
                </div>

                {/* Step 3: Making a list */}
                <div className="flex items-start gap-3.5">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 shrink-0 ${
                    (searchStep || 1) === 3
                      ? "bg-orange-500 text-white animate-pulse ring-4 ring-orange-100"
                      : "bg-gray-100 text-gray-400"
                  }`}>
                    3
                  </div>
                  <div>
                    <h4 className={`text-sm font-semibold transition ${
                      (searchStep || 1) === 3 ? "text-gray-900" : "text-gray-400"
                    }`}>
                      3. Making a list
                    </h4>
                    <p className="text-xs text-gray-500">
                      Ranking dishes with AI and highlighting customer quotes
                    </p>
                  </div>
                </div>
              </div>
            )}
            {results.map((r, i) => {
              const isSelected = selectedPlaceId === String(r.id);
              return (
                <div 
                  key={r.id} 
                  id={`restaurant-card-${r.id}`}
                  onClick={() => {
                    handleSelectPlace(String(r.id));
                  }}
                  onMouseEnter={() => {
                    setSelectedPlaceId(String(r.id));
                  }}
                  className={`p-4 rounded-xl shadow-sm border transition-all duration-300 flex flex-col gap-2 cursor-pointer ${
                    isSelected
                      ? "bg-orange-50/60 border-orange-500 ring-2 ring-orange-400 shadow-md scale-[1.01]"
                      : "bg-white border-gray-100 hover:border-gray-200 hover:shadow"
                  }`}
                >
                  {/* Phase 5 Food Photo Banner */}
                  {r.photo_url && (
                    <div className="relative w-full h-36 sm:h-40 rounded-lg overflow-hidden bg-gray-100 mb-1">
                      <img
                        src={r.photo_url.startsWith('/') ? `${API_BASE_URL}${r.photo_url}` : r.photo_url}
                        alt={`${r.name} dish`}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        loading="lazy"
                        onError={(e) => {
                          (e.currentTarget as HTMLElement).style.display = 'none';
                        }}
                      />
                    </div>
                  )}

                  <div className="flex justify-between items-start gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-lg text-gray-900 leading-tight">{i + 1}. {r.name}</h3>
                      {isSelected && (
                        <span className="bg-orange-500 text-white text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-full tracking-wide shrink-0 animate-in fade-in">
                          Pin Selected
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 items-center justify-end shrink-0">
                      <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded">
                        ★ {r.rating} ({r.total_reviews} reviews)
                      </span>
                      {r.dish_price ? (
                        <span className="bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold px-2 py-1 rounded flex items-center gap-1" title="Estimated or Menu Dish Price">
                          <span>🏷️</span>
                          <span>{r.dish_price}</span>
                        </span>
                      ) : r.price_level ? (
                        <span className="bg-gray-100 text-gray-800 text-xs font-bold px-2 py-1 rounded">
                          {r.price_level}
                        </span>
                      ) : null}
                      {r.open_now !== undefined && r.open_now !== null && (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                          r.open_now 
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                            : "bg-rose-50 text-rose-700 border border-rose-200"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${r.open_now ? "bg-emerald-500" : "bg-rose-500"}`}></span>
                          {r.open_now ? "Open Now" : "Closed"}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Dietary & Amenity Tags (OSM & Community Verified) */}
                  {((r.dietary_tags && r.dietary_tags.length > 0) || (r.amenities && r.amenities.length > 0)) && (
                    <div className="flex flex-wrap gap-1.5 pt-0.5">
                      {r.dietary_tags?.map((tag) => (
                        <span 
                          key={tag} 
                          className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                        >
                          <span>{tag.toLowerCase().includes('vegan') || tag.toLowerCase().includes('veg') ? '🌱' : tag.toLowerCase().includes('halal') ? '🥩' : tag.toLowerCase().includes('kosher') ? '✡️' : '🌾'}</span>
                          <span>{tag}</span>
                        </span>
                      ))}
                      {r.amenities?.map((amenity) => (
                        <span 
                          key={amenity} 
                          className="bg-blue-50 text-blue-800 border border-blue-200 text-[11px] font-semibold px-2 py-0.5 rounded-full inline-flex items-center gap-1"
                        >
                          <span>{amenity.toLowerCase().includes('outdoor') ? '☀️' : amenity.toLowerCase().includes('wheelchair') ? '♿' : amenity.toLowerCase().includes('delivery') ? '🛵' : '🥡'}</span>
                          <span>{amenity}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {r.summary && (
                    <p className="text-gray-500 text-xs mb-1">{r.summary}</p>
                  )}
                  <p className="text-gray-600 text-sm"><strong>AI Reason:</strong> {r.reason}</p>
                  {r.helpful_quote && (
                    <p className="text-orange-700 text-sm italic bg-orange-50 p-2 rounded border border-orange-100">
                      "{r.helpful_quote}"
                    </p>
                  )}
                  
                  {/* Feedback Buttons, Booking, Menu & Directions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 mt-2 pt-2 border-t border-gray-100">
                    <div className="flex gap-2">
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          submitFeedback(r.id, true);
                        }}
                        className={`text-sm font-medium transition ${r.helpful === true ? 'text-blue-600' : 'text-gray-400 hover:text-blue-600'}`}
                      >
                        👍 Helpful
                      </button>
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          submitFeedback(r.id, false);
                        }}
                        className={`text-sm font-medium transition ${r.helpful === false ? 'text-red-600' : 'text-gray-400 hover:text-red-600'}`}
                      >
                        👎 Not Helpful
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 ml-auto">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectPlace(String(r.id));
                          setMobileTab('map');
                        }}
                        className="md:hidden inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-md border border-blue-200 transition cursor-pointer"
                        title="View on Map"
                      >
                        <span>🗺️</span>
                        <span>Map</span>
                      </button>
                      {r.delivery_url && (
                        <a
                          href={r.delivery_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            e.stopPropagation();
                            trackCardAction("order", r.name, r.place_id);
                          }}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-md border border-emerald-200 transition cursor-pointer"
                          title="Order Delivery (Uber Eats / DoorDash)"
                        >
                          <span>🛵</span>
                          <span>Order</span>
                        </a>
                      )}
                      {r.reservation_url && (
                        <a
                          href={r.reservation_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            e.stopPropagation();
                            trackCardAction("reserve", r.name, r.place_id);
                          }}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-md border border-blue-200 transition cursor-pointer"
                          title="Reserve Table (OpenTable)"
                        >
                          <span>📅</span>
                          <span>Reserve</span>
                        </a>
                      )}
                      {r.website && (
                        <a
                          href={r.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => {
                            e.stopPropagation();
                            trackCardAction("menu", r.name, r.place_id);
                          }}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-gray-700 hover:text-orange-700 bg-gray-50 hover:bg-orange-50 px-2.5 py-1 rounded-md border border-gray-200 transition cursor-pointer"
                          title="View Restaurant Website & Menu"
                        >
                          <span>📖</span>
                          <span>Menu</span>
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          trackCardAction("share", r.name, r.place_id);
                          handleShare(dishName, location, r.name);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-purple-700 hover:text-purple-800 bg-purple-50 hover:bg-purple-100 px-2.5 py-1 rounded-md border border-purple-200 transition cursor-pointer active:scale-95"
                        title="Share this spot"
                      >
                        <span>🔗</span>
                        <span>Share</span>
                      </button>
                      <a
                        href={
                          r.place_id
                            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name)}&query_place_id=${r.place_id}`
                            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name + ' ' + (location || ''))}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => {
                          e.stopPropagation();
                          trackCardAction("directions", r.name, r.place_id);
                        }}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 px-2.5 py-1 rounded-md border border-orange-200 transition cursor-pointer"
                        title="Open on Google Maps & Get Directions"
                      >
                        <span>📍</span>
                        <span>Directions</span>
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Interactive AI Foodie Concierge */}
            {results.length > 0 && results[0]?.query_id && (
              <div className="mt-3 bg-gradient-to-br from-orange-50/90 via-white to-amber-50/60 p-4 rounded-2xl border border-orange-200 shadow-sm flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">✨</span>
                    <h3 className="font-bold text-sm text-gray-900">Foodie Concierge AI</h3>
                    <span className="text-[10px] bg-orange-100 text-orange-800 font-semibold px-2 py-0.5 rounded-full">Assistant</span>
                  </div>
                  <span className="text-[11px] text-gray-500">Grounded in these {results.length} spots</span>
                </div>

                {/* Quick Inquiry Prompts */}
                <div className="flex flex-wrap gap-1.5">
                  {[
                    "Which spot is best on a budget?",
                    "Do any have outdoor patio seating?",
                    "Which has the most authentic reviews?",
                    "Any standout vegan options?"
                  ].map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      disabled={chatLoading}
                      onClick={() => handleSendChat(prompt)}
                      className="text-[11px] bg-white hover:bg-orange-50 text-gray-700 hover:text-orange-700 px-2.5 py-1 rounded-full border border-gray-200 hover:border-orange-300 transition shadow-2xs cursor-pointer disabled:opacity-50"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>

                {/* Chat Message Stream */}
                <div className="max-h-60 overflow-y-auto flex flex-col gap-2.5 pr-1 text-xs">
                  {chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl leading-relaxed ${
                        msg.sender === 'user'
                          ? 'bg-orange-600 text-white ml-auto max-w-[85%]'
                          : 'bg-white text-gray-800 border border-orange-100 mr-auto max-w-[95%] shadow-2xs'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{msg.text}</div>
                      {msg.cited_restaurants && msg.cited_restaurants.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2 pt-1.5 border-t border-gray-100">
                          <span className="text-[10px] text-gray-400 font-medium">Spots:</span>
                          {msg.cited_restaurants.map((name) => {
                            const matchedPlace = results.find((r) => r.name.toLowerCase() === name.toLowerCase());
                            return (
                              <button
                                key={name}
                                type="button"
                                onClick={() => {
                                  if (matchedPlace) handleSelectPlace(String(matchedPlace.id));
                                }}
                                className="text-[10px] bg-orange-50 hover:bg-orange-100 text-orange-800 font-bold px-1.5 py-0.5 rounded border border-orange-200 cursor-pointer"
                              >
                                📍 {name}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="bg-white p-3 rounded-xl border border-orange-100 text-gray-500 italic text-xs mr-auto flex items-center gap-2">
                      <svg className="animate-spin h-3.5 w-3.5 text-orange-500" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Foodie AI is thinking...
                    </div>
                  )}
                </div>

                {/* Chat Input */}
                <form onSubmit={(e) => { e.preventDefault(); handleSendChat(chatInput); }} className="flex gap-2 pt-1">
                  <input
                    type="text"
                    placeholder="Ask a question about these spots..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    disabled={chatLoading}
                    className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 bg-white text-black"
                  />
                  <button
                    type="submit"
                    disabled={chatLoading || !chatInput.trim()}
                    className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-2 rounded-lg transition shrink-0 cursor-pointer"
                  >
                    Ask
                  </button>
                </form>
              </div>
            )}

          </div>
        </main>

        {/* Share Feedback Toast */}
        {shareToast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900/95 backdrop-blur-md text-white px-4 py-2.5 rounded-full text-xs font-semibold shadow-2xl flex items-center gap-2 border border-gray-700 animate-in fade-in slide-in-from-bottom-3 duration-200">
            <span>✨</span>
            <span>{shareToast}</span>
          </div>
        )}

        {/* Profile Onboarding & Preferences Modal */}
        {user && (
          <ProfileModal
            isOpen={isProfileModalOpen}
            userId={user.uid}
            defaultName={profile?.name || user.displayName || ""}
            initialCuisines={profile?.preferred_cuisines || []}
            initialDishes={profile?.favorite_dishes || []}
            isFirstTime={isFirstTimeProfile}
            onSave={(newProfile) => {
              setProfile(newProfile);
              setIsProfileModalOpen(false);
              setIsFirstTimeProfile(false);
            }}
            onClose={() => setIsProfileModalOpen(false)}
          />
        )}

        {/* Community Radar Insights & Trends Modal */}
        <InsightsModal
          isOpen={isInsightsOpen}
          onClose={() => setIsInsightsOpen(false)}
          onSelectTrend={handleSelectTrend}
        />
        </div>
      </APIProvider>
    </ErrorBoundary>
  );
}
