"use client";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
interface Props {
  id?: string;
  value?: string;
  onPlaceSelect: (
    place: google.maps.places.PlaceResult | null,
    text: string,
  ) => void;
  placeholder?: string;
  className?: string;
}
export function Autocomplete({
  id,
  value = "",
  onPlaceSelect,
  placeholder = "City or ZIP code",
  className = "",
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const onSelect = useRef(onPlaceSelect);
  const places = useMapsLibrary("places");
  useEffect(() => {
    onSelect.current = onPlaceSelect;
  }, [onPlaceSelect]);
  useEffect(() => {
    if (!places || !input.current) return;
    const autocomplete = new places.Autocomplete(input.current, {
      fields: ["geometry", "name", "formatted_address"],
      types: ["geocode"],
    });
    const listener = autocomplete.addListener("place_changed", () => {
      const place = autocomplete.getPlace();
      onSelect.current(
        place,
        place.formatted_address || place.name || input.current?.value || "",
      );
    });
    return () => {
      listener.remove();
      google.maps.event.clearInstanceListeners(autocomplete);
    };
  }, [places]);
  function keyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && document.querySelector(".pac-item-selected"))
      event.preventDefault();
  }
  return (
    <input
      id={id}
      ref={input}
      value={value}
      onChange={(e) => onPlaceSelect(null, e.target.value)}
      onKeyDown={keyDown}
      placeholder={placeholder}
      className={className}
      required
    />
  );
}
