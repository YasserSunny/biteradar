"use client";
import { useState } from "react";
import { Autocomplete } from "../Autocomplete";
import type { SearchInput } from "@/lib/types";
import { Icon } from "./Icon";
import { Panel } from "./Panel";

export function SearchBar({
  value,
  onChange,
  onSearch,
  loading,
  searchStep = 1,
  hasMaps,
  compact = false,
}: {
  value: SearchInput;
  onChange: (value: SearchInput) => void;
  onSearch: (value: SearchInput) => void;
  loading: boolean;
  searchStep?: number;
  hasMaps: boolean;
  compact?: boolean;
}) {
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [filters, setFilters] = useState(false);
  const [editing, setEditing] = useState(false);
  const count =
    value.dietary_filters.length +
    Number(!!value.price_tier) +
    Number(!!value.max_distance_km);
  const updateLocation = (location: string, lat?: number, lng?: number) =>
    onChange({ ...value, location, lat, lng });
  const locate = () => {
    setLocationError("");
    if (!navigator.geolocation) {
      setLocationError("Location is unavailable. Enter your city instead.");
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        // Coordinates are explicit, so the backend does not need to geocode this label.
        updateLocation(
          "Current location",
          pos.coords.latitude,
          pos.coords.longitude,
        );
        setLocating(false);
      },
      () => {
        setLocating(false);
        setLocationError(
          "Could not access your location. Enter a city or ZIP code.",
        );
      },
      { timeout: 8000 },
    );
  };
  const form = (
    <form
      className="search-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(value);
        setEditing(false);
      }}
    >
      <label className="search-field dish-field">
        <Icon name="search" />
        <span>
          <span className="field-label">WHAT ARE YOU CRAVING?</span>
          <input
            required
            value={value.dish_name}
            onChange={(e) => onChange({ ...value, dish_name: e.target.value })}
            placeholder="Ramen, tacos, biryani…"
          />
        </span>
      </label>
      <div className="search-field location-field">
        <Icon name="pin" />
        <div>
          <label className="field-label" htmlFor="search-location">
            WHERE?
          </label>
          {hasMaps ? (
            <Autocomplete
              id="search-location"
              value={value.location}
              placeholder="City or ZIP code"
              onPlaceSelect={(place, text) =>
                updateLocation(
                  text,
                  place?.geometry?.location?.lat(),
                  place?.geometry?.location?.lng(),
                )
              }
            />
          ) : (
            <input
              id="search-location"
              value={value.location}
              placeholder="City or ZIP code"
              onChange={(e) => updateLocation(e.target.value)}
            />
          )}
        </div>
        <button
          type="button"
          className="icon-button"
          aria-label="Use my location"
          title="Use my location"
          onClick={locate}
          disabled={locating}
        >
          <Icon name="locate" />
        </button>
      </div>
      <button
        className="button primary search-submit"
        disabled={loading || locating}
      >
        <span>
          {loading
            ? ["Searching…", "Compiling…", "Making a list…"][searchStep - 1]
            : "Find my dish"}
        </span>
        <Icon name="arrow" />
      </button>
    </form>
  );
  return (
    <div
      className={`search-block ${compact ? "search-compact" : ""} ${editing ? "is-editing" : ""}`}
    >
      {compact && (
        <button
          className="mobile-search-summary"
          onClick={() => setEditing(true)}
        >
          <Icon name="search" />
          <span>
            <strong>{value.dish_name}</strong>
            <small>{value.location}</small>
          </span>
          <span className="text-link">Edit</span>
        </button>
      )}
      <div className="desktop-search">{form}</div>
      <div className="search-options">
        <span className="muted search-hint">
          A great dish is worth finding.
        </span>
        <button
          type="button"
          className="button subtle"
          onClick={() => setFilters(true)}
        >
          <Icon name="filters" /> Preferences
          {count > 0 && <span className="count">{count}</span>}
        </button>
      </div>
      {locationError && (
        <p className="error-text" role="alert">
          {locationError}
        </p>
      )}

      {filters && (
        <PreferencePanel
          value={value}
          onClose={() => setFilters(false)}
          onApply={(next) => {
            onChange(next);
            setFilters(false);
            if (next.dish_name.trim() && next.location.trim()) onSearch(next);
          }}
        />
      )}
    </div>
  );
}
function PreferencePanel({
  value,
  onClose,
  onApply,
}: {
  value: SearchInput;
  onClose: () => void;
  onApply: (value: SearchInput) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <Panel title="Make it your kind of meal" onClose={onClose}>
      <p className="muted">
        Tell us what matters. Dietary and price preferences guide your
        recommendations.
      </p>
      <fieldset>
        <legend>Dietary preferences</legend>
        <div className="chips">
          {[
            "Vegan",
            "Halal",
            "Vegetarian",
            "Gluten-Free",
            "Kosher",
            "Dairy-Free",
          ].map((label) => {
            const active = draft.dietary_filters.some(
              (t) => t.toLowerCase() === label.toLowerCase(),
            );
            return (
              <button
                key={label}
                className={`chip ${active ? "active" : ""}`}
                aria-pressed={active}
                onClick={() =>
                  setDraft({
                    ...draft,
                    dietary_filters: active
                      ? draft.dietary_filters.filter(
                          (t) => t.toLowerCase() !== label.toLowerCase(),
                        )
                      : [...draft.dietary_filters, label],
                  })
                }
              >
                {label}
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset>
        <legend>Price per person</legend>
        <div className="chips">
          {[null, "$", "$$", "$$$", "$$$$"].map((tier) => (
            <button
              key={tier || "any"}
              className={`chip ${draft.price_tier === tier ? "active" : ""}`}
              aria-pressed={draft.price_tier === tier}
              onClick={() => setDraft({ ...draft, price_tier: tier })}
            >
              {tier || "Any price"}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>How far would you go?</legend>
        <div className="chips">
          {[
            [null, "Any distance"],
            [1.6, "About 1 mile"],
            [8, "About 5 miles"],
            [24, "About 15 miles"],
          ].map(([km, label]) => (
            <button
              key={label}
              className={`chip ${draft.max_distance_km === km ? "active" : ""}`}
              aria-pressed={draft.max_distance_km === km}
              onClick={() =>
                setDraft({ ...draft, max_distance_km: km as number | null })
              }
            >
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="panel-actions">
        <button
          className="button subtle"
          onClick={() =>
            setDraft({
              ...draft,
              dietary_filters: [],
              price_tier: null,
              max_distance_km: null,
            })
          }
        >
          Reset
        </button>
        <button className="button primary" onClick={() => onApply(draft)}>
          Apply preferences
          <Icon name="check" />
        </button>
      </div>
    </Panel>
  );
}
