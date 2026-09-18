"use client";
import { useState } from "react";
import { post, errorMessage } from "@/lib/api";
import type { Profile } from "@/lib/types";
import { Panel } from "./discovery/Panel";
import { Icon } from "./discovery/Icon";
interface Props {
  isOpen: boolean;
  userId: string;
  defaultName?: string;
  initialCuisines?: string[];
  initialDishes?: string[];
  isFirstTime?: boolean;
  onSave: (profile: Profile) => void;
  onClose: () => void;
}
export function ProfileModal({
  isOpen,
  userId,
  defaultName = "",
  initialCuisines = [],
  initialDishes = [],
  isFirstTime = false,
  onSave,
  onClose,
}: Props) {
  const [name, setName] = useState(defaultName);
  const [cuisines, setCuisines] = useState(initialCuisines);
  const [dishes, setDishes] = useState(initialDishes);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  if (!isOpen) return null;
  const toggle = (values: string[], value: string) =>
    values.includes(value)
      ? values.filter((v) => v !== value)
      : [...values, value];
  return (
    <Panel
      title={
        isFirstTime ? "Let’s get to know your taste" : "Your food preferences"
      }
      onClose={onClose}
    >
      <p className="muted">
        A few favorites make it easier to find your next great meal.
      </p>
      <form
        className="profile-form"
        onSubmit={async (e) => {
          e.preventDefault();
          setSaving(true);
          setError("");
          try {
            const profile = await post<Profile>("/api/profile", {
              user_id: userId,
              name: name.trim(),
              preferred_cuisines: cuisines,
              favorite_dishes: dishes,
            });
            onSave(profile);
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setSaving(false);
          }
        }}
      >
        <label>
          Your name
          <input
            value={name}
            required
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </label>
        <fieldset>
          <legend>Cuisines you love</legend>
          <div className="chips">
            {[
              "Chinese",
              "Thai",
              "Indian",
              "Middle Eastern",
              "Mexican",
              "Italian",
              "Japanese",
              "American",
              "Korean",
              "Vietnamese",
              "Mediterranean",
            ].map((c) => (
              <button
                type="button"
                className={`chip ${cuisines.includes(c) ? "active" : ""}`}
                aria-pressed={cuisines.includes(c)}
                key={c}
                onClick={() => setCuisines(toggle(cuisines, c))}
              >
                {c}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Your go-to dishes</legend>
          <div className="chips">
            {[
              "Burgers",
              "Biryani",
              "Pho",
              "Fried Chicken",
              "Pizza",
              "Tacos",
              "Ramen",
              "Sushi",
              "Pasta",
              "Shawarma",
              "Dim Sum",
              "BBQ",
            ].map((d) => (
              <button
                type="button"
                className={`chip ${dishes.includes(d) ? "active" : ""}`}
                aria-pressed={dishes.includes(d)}
                key={d}
                onClick={() => setDishes(toggle(dishes, d))}
              >
                {d}
              </button>
            ))}
          </div>
        </fieldset>
        {error && (
          <p className="error-text" role="alert">
            {error}
          </p>
        )}
        <div className="panel-actions">
          <button type="button" className="button subtle" onClick={onClose}>
            {isFirstTime ? "Maybe later" : "Cancel"}
          </button>
          <button className="button primary" disabled={saving || !name.trim()}>
            {saving ? "Saving…" : "Save preferences"}
            <Icon name="check" />
          </button>
        </div>
      </form>
    </Panel>
  );
}
