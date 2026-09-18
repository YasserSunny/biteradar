"use client";
import { useState } from "react";
import type { Restaurant } from "@/lib/types";
import { errorMessage, post } from "@/lib/api";
import { trackCardAction, trackFeedback } from "@/lib/analytics";
import { Panel } from "./Panel";
import {
  RestaurantPhoto,
  RestaurantMeta,
  directionsUrl,
} from "./RestaurantCard";
import { Icon } from "./Icon";
export function RestaurantDetails({
  restaurant: r,
  location,
  onClose,
  onFeedback,
  onShare,
}: {
  restaurant: Restaurant;
  location: string;
  onClose: () => void;
  onFeedback: (id: string, helpful: boolean) => void;
  onShare: (name: string) => void;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function vote(helpful: boolean) {
    setPending(true);
    setError("");
    try {
      await post("/api/feedback", { recommendation_id: Number(r.id), helpful });
      onFeedback(r.id, helpful);
      trackFeedback(r.id, helpful);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <Panel title={r.name} kind="drawer" onClose={onClose}>
      <RestaurantPhoto url={r.photo_url} name={r.name} />
      <RestaurantMeta restaurant={r} />
      <div className="detail-reason">
        <span className="eyebrow">
          <Icon name="spark" size={16} /> WHY THIS SPOT
        </span>
        <p>{r.reason}</p>
      </div>
      {r.helpful_quote && (
        <blockquote>
          “{r.helpful_quote}”<cite>A diner’s perspective</cite>
        </blockquote>
      )}
      {r.summary && <p className="muted">{r.summary}</p>}
      <div className="chips">
        {[...(r.dietary_tags || []), ...(r.amenities || [])].map((tag) => (
          <span className="tag" key={tag}>
            {tag}
          </span>
        ))}
      </div>
      <div className="detail-links">
        <a
          className="button primary"
          href={directionsUrl(r, location)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => trackCardAction("directions", r.name, r.place_id)}
        >
          <Icon name="pin" />
          Get directions
        </a>
        {(
          [
            ["order", "Find delivery", r.delivery_url],
            ["reserve", "Find a table", r.reservation_url],
            ["menu", "Website & menu", r.website],
          ] as const
        ).map(
          ([action, label, url]) =>
            url && (
              <a
                className="button secondary"
                key={action}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackCardAction(action, r.name, r.place_id)}
              >
                {label}
                <Icon name="arrow" size={16} />
              </a>
            ),
        )}
        <button
          className="button secondary"
          onClick={() => {
            trackCardAction("share", r.name, r.place_id);
            onShare(r.name);
          }}
        >
          <Icon name="share" />
          Share this search
        </button>
      </div>
      {/^\d+$/.test(r.id) && (
        <div className="feedback">
          <h3>Was this recommendation helpful?</h3>
          <div className="chips">
            <button
              className={`chip ${r.helpful === true ? "active" : ""}`}
              aria-pressed={r.helpful === true}
              disabled={pending}
              onClick={() => vote(true)}
            >
              Yes, helpful
            </button>
            <button
              className={`chip ${r.helpful === false ? "active" : ""}`}
              aria-pressed={r.helpful === false}
              disabled={pending}
              onClick={() => vote(false)}
            >
              Not quite
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
    </Panel>
  );
}
