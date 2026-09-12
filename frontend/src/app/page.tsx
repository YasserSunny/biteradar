"use client";

import { useState } from "react";

export default function Home() {
  const [dishName, setDishName] = useState("");
  const [location, setLocation] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await fetch("http://localhost:8000/api/search", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ dish_name: dishName, location }),
      });
      const data = await response.json();
      setResults(data);
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center">
      {/* Header / Search Bar */}
      <header className="w-full bg-white shadow-sm p-6 flex flex-col items-center">
        <h1 className="text-3xl font-bold text-orange-600 mb-6">biteradar</h1>
        <form onSubmit={handleSearch} className="flex gap-4 w-full max-w-3xl">
          <input
            type="text"
            placeholder="What are you craving? (e.g. Spicy Tuna Roll)"
            className="flex-1 p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 text-black"
            value={dishName}
            onChange={(e) => setDishName(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Zip or City"
            className="w-48 p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 text-black"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            required
          />
          <button
            type="submit"
            className="bg-orange-600 text-white font-semibold py-3 px-6 rounded-lg hover:bg-orange-700 transition"
            disabled={loading}
          >
            {loading ? "Searching..." : "Search"}
          </button>
        </form>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl p-6 flex gap-6">
        {/* Map Placeholder */}
        <div className="flex-1 bg-gray-200 rounded-xl flex items-center justify-center border border-gray-300 shadow-inner min-h-[600px]">
          <p className="text-gray-500 text-lg font-medium">Google Maps Placeholder</p>
        </div>

        {/* Results List */}
        <div className="w-1/3 flex flex-col gap-4 overflow-y-auto max-h-[600px]">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Results</h2>
          {results.length === 0 && !loading && (
            <p className="text-gray-500">Enter a dish and location to find the best spots!</p>
          )}
          {results.map((r, i) => (
            <div key={r.id} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-2">
              <div className="flex justify-between items-center">
                <h3 className="font-bold text-lg text-gray-900">{i + 1}. {r.name}</h3>
                <span className="bg-green-100 text-green-800 text-xs font-bold px-2 py-1 rounded">
                  ★ {r.rating}
                </span>
              </div>
              <p className="text-gray-600 text-sm italic">"{r.reason}"</p>
              
              {/* Mock Feedback Buttons */}
              <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
                <button className="text-gray-400 hover:text-blue-600 text-sm font-medium">👍 Helpful</button>
                <button className="text-gray-400 hover:text-red-600 text-sm font-medium">👎 Not Helpful</button>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
