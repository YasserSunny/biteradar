"use client";

import React, { useEffect, useState } from "react";
import { API_BASE_URL } from "../lib/api";
import { trackRadarInsightsOpened, trackTrendingCraveClick } from "../lib/analytics";

interface DishItem {
  id: number;
  name: string;
  cuisine?: string | null;
  description?: string | null;
  primary_photo_url?: string | null;
  typical_price_range?: string | null;
  dietary_attributes?: string[];
  search_count: number;
}

interface TopRestaurantGem {
  place_id: string;
  name: string;
  positive_votes: number;
  rating: number;
  photo_url?: string | null;
}

interface AnalyticsSummary {
  total_searches: number;
  unique_dishes_cataloged: number;
  total_recommendations: number;
  satisfaction_rate_percent: number;
  total_feedback_votes: number;
  positive_feedback_votes: number;
  negative_feedback_votes: number;
  top_dishes: DishItem[];
  top_gems: TopRestaurantGem[];
}

interface CityTrendItem {
  location: string;
  dish_name: string;
  search_count: number;
}

interface CityTrendsResponse {
  available_cities: string[];
  trends: CityTrendItem[];
}

interface InsightsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTrend?: (dish: string, location?: string) => void;
}

export default function InsightsModal({ isOpen, onClose, onSelectTrend }: InsightsModalProps) {
  const [activeTab, setActiveTab] = useState<"summary" | "city">("summary");
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [cityData, setCityData] = useState<CityTrendsResponse | null>(null);
  const [selectedCity, setSelectedCity] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    trackRadarInsightsOpened(activeTab);
    fetchData(selectedCity);
  }, [isOpen, selectedCity]);

  const fetchData = async (cityFilter: string) => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, cityRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/analytics/summary`),
        fetch(`${API_BASE_URL}/api/analytics/trending-by-city${cityFilter ? `?location=${encodeURIComponent(cityFilter)}` : ""}`)
      ]);

      if (!sumRes.ok || !cityRes.ok) {
        throw new Error("Could not load community insights.");
      }

      const sumData = await sumRes.json();
      const cData = await cityRes.json();

      setSummary(sumData);
      setCityData(cData);
    } catch (err: any) {
      setError(err.message || "Failed to load radar data.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-2xl max-h-[90vh] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2.5">
            <span className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/20 text-orange-400 text-lg">
              📊
            </span>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight">Radar Insights & Trends</h2>
              <p className="text-xs text-slate-400">Community satisfaction metrics & live food telemetry</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-6 pt-3 gap-2">
          <button
            onClick={() => {
              setActiveTab("summary");
              trackRadarInsightsOpened("summary");
            }}
            className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "summary"
                ? "border-orange-500 text-orange-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>🎯 Platform Vitals</span>
          </button>
          <button
            onClick={() => {
              setActiveTab("city");
              trackRadarInsightsOpened("city");
            }}
            className={`pb-3 px-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 ${
              activeTab === "city"
                ? "border-orange-500 text-orange-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            <span>📍 City Food Radar</span>
          </button>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <div className="inline-block w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-sm text-slate-400">Aggregating community food radar telemetry...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-sm text-center">
              {error}
            </div>
          ) : activeTab === "summary" && summary ? (
            <>
              {/* Top Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 text-center">
                  <div className="text-2xl font-black text-emerald-400">
                    {summary.satisfaction_rate_percent}%
                  </div>
                  <div className="text-xs text-slate-400 mt-1 font-medium">Diner Satisfaction</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    {summary.total_feedback_votes} verified votes
                  </div>
                </div>

                <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 text-center">
                  <div className="text-2xl font-black text-orange-400">
                    {summary.total_searches}
                  </div>
                  <div className="text-xs text-slate-400 mt-1 font-medium">Radar Searches</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Real-time inquiries</div>
                </div>

                <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 text-center">
                  <div className="text-2xl font-black text-amber-400">
                    {summary.unique_dishes_cataloged}
                  </div>
                  <div className="text-xs text-slate-400 mt-1 font-medium">Dishes Cataloged</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Unique craves</div>
                </div>

                <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 text-center">
                  <div className="text-2xl font-black text-indigo-400">
                    {summary.total_recommendations}
                  </div>
                  <div className="text-xs text-slate-400 mt-1 font-medium">Spots Evaluated</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">AI curated</div>
                </div>
              </div>

              {/* Top Community Craves */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-2.5 flex items-center gap-1.5">
                  <span>🔥 Most Wanted Dishes</span>
                  <span className="text-xs text-slate-500 font-normal">(Click to search)</span>
                </h3>
                {summary.top_dishes.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No dishes cataloged yet.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {summary.top_dishes.map((dish) => (
                      <button
                        key={dish.id}
                        onClick={() => {
                          trackTrendingCraveClick(dish.name);
                          onSelectTrend?.(dish.name);
                          onClose();
                        }}
                        className="px-3 py-1.5 rounded-full bg-slate-800/90 border border-slate-700/80 hover:border-orange-500/60 text-xs text-slate-200 hover:text-white transition-all flex items-center gap-1.5 group cursor-pointer"
                      >
                        <span className="font-medium group-hover:text-orange-400">{dish.name}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-700 text-slate-300 font-mono">
                          {dish.search_count}x
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Diner-Voted Hidden Gems */}
              <div>
                <h3 className="text-sm font-semibold text-white mb-2.5 flex items-center gap-1.5">
                  <span>💎 Community-Voted Hidden Gems</span>
                </h3>
                {summary.top_gems.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No recommendation ratings recorded yet.</p>
                ) : (
                  <div className="space-y-2">
                    {summary.top_gems.map((gem, idx) => (
                      <div
                        key={`${gem.place_id}_${idx}`}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 hover:bg-slate-800/80 transition-colors"
                      >
                        <div className="flex items-center gap-3">
                          <span className="w-6 h-6 rounded-full bg-orange-500/20 text-orange-400 font-black text-xs flex items-center justify-center font-mono">
                            #{idx + 1}
                          </span>
                          <div>
                            <div className="text-sm font-semibold text-white">{gem.name}</div>
                            <div className="text-xs text-slate-400 flex items-center gap-2">
                              <span>⭐ {gem.rating}</span>
                              {gem.positive_votes > 0 && (
                                <span className="text-emerald-400 font-medium">
                                  👍 {gem.positive_votes} community approval{gem.positive_votes > 1 ? "s" : ""}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : activeTab === "city" && cityData ? (
            <>
              {/* City Filter Controls */}
              <div className="flex items-center justify-between gap-4">
                <label className="text-xs text-slate-400 font-medium">Filter by City:</label>
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-white text-xs rounded-lg px-3 py-1.5 focus:outline-none focus:border-orange-500"
                >
                  <option value="">All Cities (Global Radar)</option>
                  {cityData.available_cities.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>
              </div>

              {/* City Trends List */}
              <div className="space-y-2.5">
                <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
                  <span>🌆 {selectedCity ? `Top Cravings in ${selectedCity}` : "Top Cravings Across All Cities"}</span>
                </h3>
                {cityData.trends.length === 0 ? (
                  <p className="text-xs text-slate-500 italic py-6 text-center">
                    No location trends recorded for this selection yet.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {cityData.trends.map((item, idx) => (
                      <div
                        key={`${item.location}_${item.dish_name}_${idx}`}
                        onClick={() => {
                          trackTrendingCraveClick(item.dish_name);
                          onSelectTrend?.(item.dish_name, item.location);
                          onClose();
                        }}
                        className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/60 hover:border-orange-500/50 hover:bg-slate-800/90 cursor-pointer transition-all flex items-center justify-between group"
                      >
                        <div>
                          <div className="text-sm font-semibold text-white group-hover:text-orange-400 transition-colors">
                            {item.dish_name}
                          </div>
                          <div className="text-xs text-slate-400 flex items-center gap-1">
                            <span>📍 {item.location}</span>
                          </div>
                        </div>
                        <span className="text-xs font-mono font-medium px-2 py-1 rounded-md bg-slate-700 text-slate-300">
                          {item.search_count} search{item.search_count > 1 ? "es" : ""}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-500">
          <span>Telemetry aggregated anonymously • Zero tracking cookies</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
