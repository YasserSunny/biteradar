"use client";
import { useEffect, useRef, useState } from "react";
import {
  Map,
  Marker,
  useMap,
  useApiLoadingStatus,
  APILoadingStatus,
} from "@vis.gl/react-google-maps";
import type { Restaurant } from "@/lib/types";
import { Icon } from "./Icon";
function Camera({
  results,
  selectedId,
  visible,
}: {
  results: Restaurant[];
  selectedId: string | null;
  visible: boolean;
}) {
  const map = useMap();
  const geometryKey = JSON.stringify(
    results.map((r) => ({ lat: r.lat, lng: r.lng })),
  );
  const fitted = useRef<string | null>(null);
  const selected = results.find((r) => r.id === selectedId);
  const lat = selected?.lat;
  const lng = selected?.lng;
  useEffect(() => {
    if (!map || !visible) return;
    google.maps.event.trigger(map, "resize");
    if (fitted.current === geometryKey) return;
    const points: { lat: number; lng: number }[] = JSON.parse(geometryKey);
    if (!points.length) return;
    const bounds = new google.maps.LatLngBounds();
    points.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, 70);
    fitted.current = geometryKey;
    const listener = google.maps.event.addListenerOnce(map, "idle", () => {
      if ((map.getZoom() || 0) > 16) map.setZoom(16);
    });
    return () => listener.remove();
  }, [map, geometryKey, visible]);
  useEffect(() => {
    if (map && lat != null && lng != null) map.panTo({ lat, lng });
  }, [map, lat, lng]);
  return null;
}
function ZoomControls() {
  const map = useMap();
  return (
    <div className="map-zoom-controls">
      <button
        aria-label="Zoom in"
        onClick={() => map?.setZoom(Math.min(21, (map.getZoom() ?? 13) + 1))}
      >
        +
      </button>
      <button
        aria-label="Zoom out"
        onClick={() => map?.setZoom(Math.max(2, (map.getZoom() ?? 13) - 1))}
      >
        −
      </button>
    </div>
  );
}
export default function ResultsMap({
  results,
  selectedId,
  highlightedId,
  onSelect,
  visible,
}: {
  results: Restaurant[];
  selectedId: string | null;
  highlightedId: string | null;
  onSelect: (id: string) => void;
  visible: boolean;
}) {
  const status = useApiLoadingStatus();
  const [ready, setReady] = useState(false);
  if (
    status === APILoadingStatus.AUTH_FAILURE ||
    status === APILoadingStatus.FAILED
  )
    return (
      <div className="map-unavailable">
        <Icon name="map" size={32} />
        <p>The map couldn’t load.</p>
        <span className="muted">
          Your recommendations and directions are still available.
        </span>
      </div>
    );
  return (
    <div className="map-canvas" aria-busy={!ready} style={{ height: "100%" }}>
      <Map
        onTilesLoaded={() => setReady(true)}
        onCameraChanged={() => setReady(false)}
        defaultCenter={
          results[0]
            ? { lat: results[0].lat, lng: results[0].lng }
            : { lat: 40.7128, lng: -74.006 }
        }
        defaultZoom={12}
        gestureHandling="cooperative"
        zoomControl={false}
        cameraControl={false}
        mapTypeControl={false}
        streetViewControl={false}
        fullscreenControl={false}
        style={{ width: "100%", height: "100%" }}
      >
        <ZoomControls />
        <Camera results={results} selectedId={selectedId} visible={visible} />
        {results.map((r, i) => (
          <Marker
            key={r.id}
            position={{ lat: r.lat, lng: r.lng }}
            label={{ text: String(i + 1), color: "white", fontWeight: "700" }}
            title={r.name}
            opacity={highlightedId && highlightedId !== r.id ? 0.6 : 1}
            zIndex={r.id === selectedId ? 100 : i}
            onClick={() => onSelect(r.id)}
          />
        ))}
      </Map>
    </div>
  );
}
