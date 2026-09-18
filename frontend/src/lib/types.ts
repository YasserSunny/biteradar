export interface SearchInput {
  dish_name: string;
  location: string;
  lat?: number | null;
  lng?: number | null;
  dietary_filters: string[];
  price_tier: string | null;
  max_distance_km: number | null;
}
export const emptySearch: SearchInput = {
  dish_name: "",
  location: "",
  dietary_filters: [],
  price_tier: null,
  max_distance_km: null,
};
export interface Restaurant {
  id: string;
  place_id: string;
  name: string;
  rating: number;
  total_reviews: number;
  lat: number;
  lng: number;
  reason: string;
  query_id?: number | null;
  price_level?: string | null;
  dish_price?: string | null;
  summary?: string | null;
  open_now?: boolean | null;
  website?: string | null;
  helpful_quote?: string | null;
  helpful?: boolean | null;
  photo_url?: string | null;
  delivery_url?: string | null;
  reservation_url?: string | null;
  dietary_tags?: string[];
  amenities?: string[];
}
export interface Profile {
  name: string;
  preferred_cuisines: string[];
  favorite_dishes: string[];
}
export interface HistoryItem {
  id: number;
  query_id: number;
  dish_name: string;
  location: string;
  created_at: string;
  search_context?: SearchInput | null;
}
export interface Dish {
  id: number;
  name: string;
  cuisine?: string | null;
  primary_photo_url?: string | null;
  search_count: number;
}
export interface ChatMessage {
  sender: "user" | "assistant";
  text: string;
  cited_restaurants?: string[];
}
