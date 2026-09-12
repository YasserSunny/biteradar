"use client";

import { useState, useEffect } from "react";

interface ProfileModalProps {
  isOpen: boolean;
  userId: string;
  defaultName?: string;
  initialCuisines?: string[];
  initialDishes?: string[];
  isFirstTime?: boolean;
  onSave: (profile: { name: string; preferred_cuisines: string[]; favorite_dishes: string[] }) => void;
  onClose?: () => void;
}

const CUISINE_OPTIONS = [
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
];

const DISH_OPTIONS = [
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
];

export function ProfileModal({
  isOpen,
  userId,
  defaultName = "",
  initialCuisines = [],
  initialDishes = [],
  isFirstTime = false,
  onSave,
  onClose,
}: ProfileModalProps) {
  const [name, setName] = useState(defaultName);
  const [selectedCuisines, setSelectedCuisines] = useState<string[]>(initialCuisines);
  const [selectedDishes, setSelectedDishes] = useState<string[]>(initialDishes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (defaultName && !name) {
      setName(defaultName);
    }
  }, [defaultName]);

  useEffect(() => {
    setSelectedCuisines(initialCuisines);
  }, [initialCuisines]);

  useEffect(() => {
    setSelectedDishes(initialDishes);
  }, [initialDishes]);

  if (!isOpen) return null;

  const toggleCuisine = (cuisine: string) => {
    setSelectedCuisines((prev) =>
      prev.includes(cuisine) ? prev.filter((c) => c !== cuisine) : [...prev, cuisine]
    );
  };

  const toggleDish = (dish: string) => {
    setSelectedDishes((prev) =>
      prev.includes(dish) ? prev.filter((d) => d !== dish) : [...prev, dish]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await fetch("http://localhost:8000/api/profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: userId,
          name: name.trim(),
          preferred_cuisines: selectedCuisines,
          favorite_dishes: selectedDishes,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to save profile");
      }

      const data = await res.json();
      onSave(data);
    } catch (err: any) {
      console.error(err);
      setError("Error saving profile. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-6 sm:p-8 relative my-8 animate-in fade-in zoom-in-95 duration-200">
        {!isFirstTime && onClose && (
          <button
            onClick={onClose}
            className="absolute top-5 right-5 text-gray-400 hover:text-gray-600 transition"
            aria-label="Close"
          >
            ✕
          </button>
        )}

        <div className="mb-6 text-center">
          <div className="inline-block p-3 rounded-full bg-orange-100 text-orange-600 mb-2">
            🍽️
          </div>
          <h2 className="text-2xl font-extrabold text-gray-900">
            {isFirstTime ? "Create Your Food Profile" : "Edit Your Preferences"}
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Tell us what you crave so BiteRadar can tailor recommendations just for you.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-200">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Name Field */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">
              Your Name
            </label>
            <input
              type="text"
              className="w-full p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 text-black text-sm"
              placeholder="e.g. Alex"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          {/* Preferred Cuisines */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">
              Preferred Cuisines <span className="text-gray-400 font-normal text-xs">(Check all that apply)</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
              {CUISINE_OPTIONS.map((cuisine) => {
                const isSelected = selectedCuisines.includes(cuisine);
                return (
                  <label
                    key={cuisine}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm cursor-pointer transition select-none ${
                      isSelected
                        ? "bg-orange-50 border-orange-400 text-orange-900 font-medium"
                        : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleCuisine(cuisine)}
                      className="w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500"
                    />
                    <span>{cuisine}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Favorite Dishes */}
          <div>
            <label className="block text-sm font-semibold text-gray-800 mb-1">
              Favorite Dishes <span className="text-gray-400 font-normal text-xs">(Check all that apply)</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2">
              {DISH_OPTIONS.map((dish) => {
                const isSelected = selectedDishes.includes(dish);
                return (
                  <label
                    key={dish}
                    className={`flex items-center gap-2 p-2.5 rounded-lg border text-sm cursor-pointer transition select-none ${
                      isSelected
                        ? "bg-orange-50 border-orange-400 text-orange-900 font-medium"
                        : "bg-white border-gray-200 text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleDish(dish)}
                      className="w-4 h-4 text-orange-600 rounded border-gray-300 focus:ring-orange-500"
                    />
                    <span>{dish}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Actions */}
          <div className="pt-4 border-t border-gray-100 flex gap-3 justify-end">
            {!isFirstTime && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 border border-gray-300 text-gray-700 rounded-lg text-sm font-semibold hover:bg-gray-50 transition"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="flex-1 sm:flex-none px-6 py-2.5 bg-orange-600 text-white rounded-lg text-sm font-semibold hover:bg-orange-700 transition shadow-sm disabled:opacity-50"
            >
              {saving ? "Saving..." : isFirstTime ? "Get Started" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
