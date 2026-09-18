"use client";
import { useEffect, useState } from "react";
import { request, errorMessage } from "@/lib/api";
import type { Dish } from "@/lib/types";
import { trackRadarInsightsOpened } from "@/lib/analytics";
import { Panel } from "./discovery/Panel";
import { Icon } from "./discovery/Icon";
interface Summary {
  total_searches: number;
  unique_dishes_cataloged: number;
  total_recommendations: number;
  satisfaction_rate_percent: number;
  total_feedback_votes: number;
  top_dishes: Dish[];
  top_gems: {
    place_id: string;
    name: string;
    rating: number;
    positive_votes: number;
  }[];
}
interface Cities {
  available_cities: string[];
  trends: { location: string; dish_name: string; search_count: number }[];
}
export default function InsightsModal({
  isOpen,
  onClose,
  onSelectTrend,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSelectTrend: (dish: string, location?: string) => void;
}) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [cities, setCities] = useState<Cities | null>(null);
  const [city, setCity] = useState("");
  const [tab, setTab] = useState<"summary" | "city">("summary");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!isOpen) return;
    const abort = new AbortController();
    Promise.all([
      request<Summary>("/api/analytics/summary", { signal: abort.signal }),
      request<Cities>(
        `/api/analytics/trending-by-city${city ? `?location=${encodeURIComponent(city)}` : ""}`,
        { signal: abort.signal },
      ),
    ])
      .then(([s, c]) => {
        setSummary(s);
        setCities(c);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(errorMessage(e));
      });
    return () => abort.abort();
  }, [isOpen, city]);
  useEffect(() => {
    if (isOpen) trackRadarInsightsOpened(tab);
  }, [isOpen, tab]);
  if (!isOpen) return null;
  return (
    <Panel title="On the community radar" kind="full" onClose={onClose}>
      <p className="muted">
        See what people are craving and the spots they’ve found helpful.
      </p>
      <div className="segmented">
        <button
          aria-pressed={tab === "summary"}
          onClick={() => setTab("summary")}
        >
          The big picture
        </button>
        <button aria-pressed={tab === "city"} onClick={() => setTab("city")}>
          By city
        </button>
      </div>
      {error ? (
        <p className="error-text" role="alert">
          {error}
        </p>
      ) : !summary || !cities ? (
        <p role="status">Loading community insights…</p>
      ) : tab === "summary" ? (
        <>
          <div className="stats-grid">
            {[
              [`${summary.satisfaction_rate_percent}%`, "Positive feedback"],
              [summary.total_searches, "Searches"],
              [summary.unique_dishes_cataloged, "Dishes discovered"],
              [summary.total_recommendations, "Recommendations"],
            ].map(([value, label]) => (
              <div key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <p className="muted small">
            Based on {summary.total_feedback_votes} feedback votes.
          </p>
          <section className="insights-section">
            <h3>Most-craved dishes</h3>
            <div className="chips">
              {summary.top_dishes.map((d) => (
                <button
                  className="chip"
                  key={d.id}
                  onClick={() => onSelectTrend(d.name)}
                >
                  {d.name}
                  <span className="count">{d.search_count}</span>
                </button>
              ))}
            </div>
            {!summary.top_dishes.length && (
              <p className="muted">
                The next trend could start with your search.
              </p>
            )}
          </section>
          <section className="insights-section">
            <h3>Community favorites</h3>
            <div className="account-links">
              {summary.top_gems.map((g) => (
                <div className="gem-row" key={g.place_id}>
                  <strong>{g.name}</strong>
                  <span className="muted">
                    ★ {g.rating} · {g.positive_votes} helpful votes
                  </span>
                </div>
              ))}
            </div>
            {!summary.top_gems.length && (
              <p className="muted">
                Favorites will appear as diners leave feedback.
              </p>
            )}
          </section>
        </>
      ) : (
        <>
          <label className="city-select">
            Explore a city
            <select value={city} onChange={(e) => setCity(e.target.value)}>
              <option value="">All cities</option>
              {cities.available_cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <div className="account-links">
            {cities.trends.map((t, i) => (
              <button
                key={`${t.location}-${t.dish_name}-${i}`}
                onClick={() => onSelectTrend(t.dish_name, t.location)}
              >
                <Icon name="pin" />
                <span>
                  {t.dish_name}
                  <small>
                    {t.location} · {t.search_count} searches
                  </small>
                </span>
                <Icon name="arrow" />
              </button>
            ))}
          </div>
          {!cities.trends.length && (
            <p className="muted">No trends for this city yet.</p>
          )}
        </>
      )}
    </Panel>
  );
}
