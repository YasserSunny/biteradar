"use client";
import { useState } from "react";
import type { Restaurant } from "@/lib/types";
import { photoUrl } from "@/lib/api";
import { trackCardAction } from "@/lib/analytics";
import { Icon } from "./Icon";

export function RestaurantPhoto({
  url,
  name,
}: {
  url?: string | null;
  name: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className="restaurant-photo">
      {url &&
      !failed /* eslint-disable-next-line @next/next/no-img-element -- External provider proxy; preserve lazy loading without an image optimizer allowlist. */ ? (
        <img
          src={photoUrl(url)}
          alt={`${name} restaurant`}
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="photo-placeholder">
          <Icon name="bowl" size={48} />
          <span>Good food awaits</span>
        </div>
      )}
    </div>
  );
}
export function directionsUrl(r: Restaurant, location: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(r.name + " " + location)}${r.place_id ? `&query_place_id=${encodeURIComponent(r.place_id)}` : ""}`;
}
export function RestaurantMeta({ restaurant: r }: { restaurant: Restaurant }) {
  return (
    <div className="restaurant-meta">
      <span className="rating">★ {r.rating.toFixed(1)}</span>
      <span>({r.total_reviews.toLocaleString()})</span>
      {(r.dish_price || r.price_level) && (
        <>
          <span>·</span>
          <span>{r.dish_price ? `Est. ${r.dish_price}` : r.price_level}</span>
        </>
      )}
      {r.open_now != null && (
        <span className={`open-status ${r.open_now ? "is-open" : ""}`}>
          {r.open_now ? "Open now" : "Closed"}
        </span>
      )}
    </div>
  );
}
export function RestaurantCard({
  restaurant: r,
  rank,
  selected,
  location,
  onSelect,
  onHighlight,
}: {
  restaurant: Restaurant;
  rank: number;
  selected: boolean;
  location: string;
  onSelect: () => void;
  onHighlight: (id: string | null) => void;
}) {
  return (
    <article
      id={`restaurant-${r.id}`}
      className={`restaurant-card ${selected ? "selected" : ""}`}
      onMouseEnter={() => onHighlight(r.id)}
      onMouseLeave={() => onHighlight(null)}
    >
      <div className="card-image">
        <RestaurantPhoto key={r.photo_url} url={r.photo_url} name={r.name} />
        <span className="rank-badge">
          {String(rank).padStart(2, "0")}
          <span>{rank === 1 ? "TOP PICK" : "ON YOUR RADAR"}</span>
        </span>
      </div>
      <div className="card-content">
        <h3>
          <button className="restaurant-title" onClick={onSelect}>
            {r.name}
          </button>
        </h3>
        <RestaurantMeta restaurant={r} />
        <div className="why">
          <span className="eyebrow">
            <Icon name="spark" size={15} /> WHY THIS SPOT
          </span>
          <p>{r.reason}</p>
        </div>
        <div className="card-actions">
          <button className="text-link" onClick={onSelect}>
            View details
            <Icon name="arrow" size={17} />
          </button>
          <a
            className="button subtle"
            href={directionsUrl(r, location)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => trackCardAction("directions", r.name, r.place_id)}
          >
            <Icon name="pin" size={17} />
            Directions
          </a>
        </div>
      </div>
    </article>
  );
}
