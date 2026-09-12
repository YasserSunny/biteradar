"use client";

import { useState } from "react";
import { APIProvider, Map, Marker } from '@vis.gl/react-google-maps';

export default function Home() {
  const [dishName, setDishName] = useState("");
  const [location, setLocation] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Default center (NYC)
  const [mapCenter, setMapCenter] = useState({ lat: 40.7128, lng: -74.0060 });

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
      
      if (data.length > 0) {
        setMapCenter({ lat: data[0].lat, lng: data[0].lng });
      }
    } catch (error) {
      console.error("Error fetching data:", error);
      alert("Something went wrong! Check the console.");
    } finally {
      setLoading(false);
    }
  };

  const submitFeedback = async (id: string, helpful: boolean) => {
    try {
      await fetch("http://localhost:8000/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ recommendation_id: parseInt(id), helpful }),
      });
      
      // Update local state to reflect feedback
      setResults(results.map(r => r.id === id ? { ...r, helpful } : r));
    } catch (error) {
      console.error("Error submitting feedback:", error);
    }
  };

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";

  return (
    <APIProvider apiKey={apiKey}>
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
          {/* Map Area */}
          <div className="flex-1 rounded-xl overflow-hidden shadow-inner min-h-[600px] border border-gray-300 relative">
            {!apiKey && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-gray-200 bg-opacity-90">
                <p className="text-gray-700 text-lg font-medium p-4 text-center">
                  Google Maps API Key missing.<br/>
                  <span className="text-sm">Please add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to frontend/.env.local</span>
                </p>
              </div>
            )}
            <Map 
              defaultZoom={13} 
              center={mapCenter} 
              onCenterChanged={(ev) => setMapCenter(ev.detail.center)}
              gestureHandling={'greedy'} 
              disableDefaultUI={true}
            >
              {results.map((r, i) => (
                <Marker 
                  key={r.id} 
                  position={{ lat: r.lat, lng: r.lng }} 
                  title={r.name} 
                  label={(i + 1).toString()}
                />
              ))}
            </Map>
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
                
                {/* Real Feedback Buttons */}
                <div className="flex gap-2 mt-2 pt-2 border-t border-gray-100">
                  <button 
                    onClick={() => submitFeedback(r.id, true)}
                    className={`text-sm font-medium transition ${r.helpful === true ? 'text-blue-600' : 'text-gray-400 hover:text-blue-600'}`}
                  >
                    👍 Helpful
                  </button>
                  <button 
                    onClick={() => submitFeedback(r.id, false)}
                    className={`text-sm font-medium transition ${r.helpful === false ? 'text-red-600' : 'text-gray-400 hover:text-red-600'}`}
                  >
                    👎 Not Helpful
                  </button>
                </div>
              </div>
            ))}
          </div>
        </main>
      </div>
    </APIProvider>
  );
}
