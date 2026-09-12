"use client";

import { useState, useEffect } from "react";
import { APIProvider, Map, Marker } from '@vis.gl/react-google-maps';
import { Autocomplete } from "../components/Autocomplete";
import { auth, googleProvider } from '../firebase';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';

export default function Home() {
  const [dishName, setDishName] = useState("");
  const [location, setLocation] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Default center (NYC)
  const [mapCenter, setMapCenter] = useState({ lat: 40.7128, lng: -74.0060 });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
      alert("Failed to login. Please try again.");
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
      setResults([]);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const handleLocationSelect = (place: google.maps.places.PlaceResult | null, inputValue: string) => {
    setLocation(inputValue);
  };

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

  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><p>Loading...</p></div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center">
        <div className="bg-white p-8 rounded-xl shadow-md flex flex-col items-center max-w-md w-full">
          <h1 className="text-4xl font-bold text-orange-600 mb-2">biteradar</h1>
          <p className="text-gray-500 mb-8 text-center">Find the best dish in town, ranked by AI.</p>
          <button 
            onClick={handleLogin}
            className="w-full bg-white border border-gray-300 text-gray-700 font-semibold py-3 px-6 rounded-lg hover:bg-gray-50 transition flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
            </svg>
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={apiKey} libraries={['places']}>
      <div className="min-h-screen bg-gray-50 flex flex-col items-center">
        {/* Header / Search Bar */}
        <header className="w-full bg-white shadow-sm p-6 flex flex-col items-center relative">
          <div className="absolute right-6 top-6 flex items-center gap-4">
            <span className="text-sm text-gray-600">{user.email}</span>
            <button onClick={handleLogout} className="text-sm text-red-600 hover:underline">Logout</button>
          </div>
          
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
            <Autocomplete
              placeholder="Zip or City"
              className="w-48 p-3 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-orange-500 text-black"
              onPlaceSelect={handleLocationSelect}
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
