"use client";

import React, { useRef, useEffect, useState } from 'react';
import { useMapsLibrary } from '@vis.gl/react-google-maps';

interface AutocompleteProps {
  onPlaceSelect: (place: google.maps.places.PlaceResult | null, inputValue: string) => void;
  placeholder?: string;
  className?: string;
}

export const Autocomplete = ({ onPlaceSelect, placeholder = "Location", className = "" }: AutocompleteProps) => {
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const places = useMapsLibrary('places');
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);

  useEffect(() => {
    if (!places || !inputRef.current) return;

    const options = {
      fields: ['geometry', 'name', 'formatted_address']
    };

    setAutocomplete(new places.Autocomplete(inputRef.current, options));
  }, [places]);

  useEffect(() => {
    if (!autocomplete) return;

    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      // Use formatted_address or name to update the input display
      if (place && place.formatted_address) {
        setInputValue(place.formatted_address);
      } else if (place && place.name) {
        setInputValue(place.name);
      }
      onPlaceSelect(place, inputRef.current?.value || "");
    });
  }, [autocomplete, onPlaceSelect]);

  return (
    <input
      ref={inputRef}
      value={inputValue}
      onChange={(e) => {
        setInputValue(e.target.value);
        onPlaceSelect(null, e.target.value); // Pass the raw text if they type without selecting
      }}
      type="text"
      placeholder={placeholder}
      className={className}
      required
    />
  );
};
