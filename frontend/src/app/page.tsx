"use client";
import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/firebase";
import { AuthCard } from "@/components/AuthCard";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import DiscoveryApp from "@/components/discovery/DiscoveryApp";
import { Logo } from "@/components/Logo";
import { Icon } from "@/components/discovery/Icon";
export default function Home() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(
    () =>
      onAuthStateChanged(auth, (current) => {
        setUser(current);
        setLoading(false);
      }),
    [],
  );
  if (loading)
    return (
      <div className="auth-loading" role="status">
        <Logo />
        <p>Setting the table…</p>
      </div>
    );
  return (
    <ErrorBoundary>
      {user ? (
        <DiscoveryApp key={user.uid} user={user} />
      ) : (
        <main className="welcome-page">
          <section className="welcome-story">
            <Logo size="md" />
            <div>
              <span className="eyebrow">GOOD TASTE. GREAT FINDS.</span>
              <h1>
                Your next <br />
                “you have to
                <br />
                <em>try this.”</em>
              </h1>
              <p>Find the places that make your favorite dish unforgettable.</p>
              <div className="welcome-promise">
                <Icon name="spark" />
                <span>
                  Real diner reviews.
                  <br />
                  <strong>Recommendations for your craving.</strong>
                </span>
              </div>
            </div>
            <span className="welcome-footnote">FOLLOW YOUR CRAVING</span>
          </section>
          <section className="welcome-form">
            <AuthCard />
          </section>
        </main>
      )}
    </ErrorBoundary>
  );
}
