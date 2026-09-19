"use client";

import { useEffect, useSyncExternalStore } from "react";
import {
  applyTheme,
  storedTheme,
  themeStorageKey,
  type ThemePreference,
} from "@/lib/theme";

const themeEvent = "biteradar-theme-change";

function subscribe(listener: () => void) {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const systemChange = () => {
    if (storedTheme() === "system") applyTheme("system");
    listener();
  };
  window.addEventListener("storage", listener);
  window.addEventListener(themeEvent, listener);
  media.addEventListener("change", systemChange);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(themeEvent, listener);
    media.removeEventListener("change", systemChange);
  };
}

export function ThemeSelector() {
  const preference = useSyncExternalStore(
    subscribe,
    storedTheme,
    () => "system" as ThemePreference,
  );

  useEffect(() => applyTheme(preference), [preference]);

  const select = (next: ThemePreference) => {
    try {
      if (next === "system") localStorage.removeItem(themeStorageKey);
      else localStorage.setItem(themeStorageKey, next);
    } catch {}
    applyTheme(next);
    window.dispatchEvent(new Event(themeEvent));
  };

  return (
    <div className="theme-setting">
      <div>
        <strong>Appearance</strong>
        <small>Use your device theme or choose one.</small>
      </div>
      <div className="theme-options" role="radiogroup" aria-label="Appearance">
        {(["system", "light", "dark"] as const).map((option) => (
          <button
            type="button"
            role="radio"
            aria-checked={preference === option}
            key={option}
            onClick={() => select(option)}
          >
            {option[0].toUpperCase() + option.slice(1)}
          </button>
        ))}
      </div>
    </div>
  );
}
