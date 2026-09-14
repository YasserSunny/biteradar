"use client";

import React, { useRef, useEffect, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

interface AutocompleteProps {
  value?: string;
  onPlaceSelect: (place: google.maps.places.PlaceResult | null, inputValue: string) => void;
  placeholder?: string;
  className?: string;
}

export const Autocomplete = ({
  value,
  onPlaceSelect,
  placeholder = "Location",
  className = ""
}: AutocompleteProps) => {
  const [inputValue, setInputValue] = useState(value || "");
  const inputRef = useRef<HTMLInputElement>(null);
  const places = useMapsLibrary('places');
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);

  // Synchronize internal input value when parent value changes (e.g. reverse geocoding, history click)
  useEffect(() => {
    if (value !== undefined) {
      setInputValue(value);
    }
  }, [value]);

  useEffect(() => {
    if (!places || !inputRef.current) return;

    const options: google.maps.places.AutocompleteOptions = {
      fields: ['geometry', 'name', 'formatted_address'],
      types: ['geocode', 'establishment']
    };

    const ac = new places.Autocomplete(inputRef.current, options);
    setAutocomplete(ac);

    return () => {
      if ((window as any).google?.maps?.event) {
        (window as any).google.maps.event.clearInstanceListeners(ac);
      }
    };
  }, [places]);

  useEffect(() => {
    if (!autocomplete) return;

    const listener = autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      const chosenText = place?.formatted_address || place?.name || inputRef.current?.value || "";

      if (chosenText) {
        setInputValue(chosenText);
      }
      onPlaceSelect(place, chosenText);
    });

    return () => {
      if ((window as any).google?.maps?.event && listener) {
        (window as any).google.maps.event.removeListener(listener);
      }
    };
  }, [autocomplete, onPlaceSelect]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const pacContainer = document.querySelector('.pac-container') as HTMLElement | null;
      if (pacContainer && window.getComputedStyle(pacContainer).display !== 'none') {
        const selected = pacContainer.querySelector('.pac-item-selected');
        if (selected) {
          // Autocomplete suggestion is highlighted; let Google select it first rather than premature form submit
          e.preventDefault();
        }
      }
    }
  };

  return (
    <input
      ref={inputRef}
      value={inputValue}
      onChange={(e) => {
        setInputValue(e.target.value);
        onPlaceSelect(null, e.target.value); // Pass raw text if typing freely
      }}
      onKeyDown={handleKeyDown}
      type="text"
      placeholder={placeholder}
      className={className}
      required
    />
  );
};
