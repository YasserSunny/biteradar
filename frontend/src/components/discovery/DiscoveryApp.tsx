"use client";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { APIProvider } from "@vis.gl/react-google-maps";
import { signOut, type User } from "firebase/auth";
import { auth } from "@/firebase";
import { request, ApiError, errorMessage } from "@/lib/api";
import type { Dish, HistoryItem, Profile } from "@/lib/types";
import { trackTrendingCraveClick } from "@/lib/analytics";
import { useDiscovery } from "@/hooks/useDiscovery";
import { Logo } from "../Logo";
import { ThemeSelector } from "../ThemeSelector";
import { ProfileModal } from "../ProfileModal";
import InsightsModal from "../InsightsModal";
import { Icon } from "./Icon";
import { SearchBar } from "./SearchBar";
import { RestaurantCard, RestaurantPhoto } from "./RestaurantCard";
import { RestaurantDetails } from "./RestaurantDetails";
import { Concierge } from "./Concierge";
import { SearchProgress } from "./SearchProgress";
import { Panel } from "./Panel";
const ResultsMap = dynamic(() => import("./ResultsMap"), {
  ssr: false,
  loading: () => (
    <div className="map-unavailable" role="status">
      Loading map…
    </div>
  ),
});
const subscribeDesktop = (listener: () => void) => {
  const media = window.matchMedia("(min-width: 1024px)");
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
};
const desktopSnapshot = () => window.matchMedia("(min-width: 1024px)").matches;
const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "";
export default function DiscoveryApp({ user }: { user: User }) {
  return mapsKey ? (
    <APIProvider apiKey={mapsKey} libraries={["places"]}>
      <Workspace user={user} />
    </APIProvider>
  ) : (
    <Workspace user={user} />
  );
}
function Workspace({ user }: { user: User }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [trending, setTrending] = useState<Dish[]>([]);
  const [panel, setPanel] = useState<
    "profile" | "insights" | "account" | "history" | "chat" | null
  >(null);
  const [onboarding, setOnboarding] = useState(false);
  const [view, setView] = useState<"list" | "map">("list");
  const desktop = useSyncExternalStore(
    subscribeDesktop,
    desktopSnapshot,
    () => false,
  );
  const [mapOpened, setMapOpened] = useState(false);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [details, setDetails] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const refresh = useCallback(() => {
    void request<HistoryItem[]>(`/api/history/${user.uid}`)
      .then(setHistory)
      .catch(() => {});
    void request<Dish[]>("/api/dishes/trending?limit=8")
      .then(setTrending)
      .catch(() => {});
  }, [user.uid]);
  const search = useDiscovery(user.uid, () => {
    refresh();
    setDetails(null);
    setPanel(null);
    setView("list");
  });
  useEffect(() => {
    let current = true;
    void request<Profile>(`/api/profile/${user.uid}`)
      .then((data) => {
        if (current) setProfile(data);
      })
      .catch((e) => {
        if (current && e instanceof ApiError && e.status === 404) {
          setOnboarding(true);
          setPanel("profile");
        }
      });
    refresh();
    return () => {
      current = false;
    };
  }, [user.uid, refresh]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const chooseDish = (dish: string, location?: string) => {
    trackTrendingCraveClick(dish);
    const input = {
      ...search.draft,
      dish_name: dish,
      ...(location ? { location, lat: undefined, lng: undefined } : {}),
    };
    search.setDraft(input);
    setPanel(null);
    void search.execute(input);
  };
  const select = (id: string) => {
    search.setSelectedId(id);
    setDetails(id);
  };
  const share = async (name?: string) => {
    if (!search.submitted) return;
    const s = search.submitted;
    // GPS searches must resolve elsewhere too; a coordinate pair is geocodable without exposing UI-only labels.
    const location =
      s.location === "Current location" && s.lat != null && s.lng != null
        ? `${s.lat}, ${s.lng}`
        : s.location;
    const url = `${window.location.origin}/?${new URLSearchParams({ dish: s.dish_name, loc: location })}`;
    try {
      if (navigator.share)
        await navigator.share({
          title: name || `${s.dish_name} on BiteRadar`,
          url,
        });
      else {
        await navigator.clipboard.writeText(url);
        setToast("Search link copied");
      }
    } catch (e) {
      if (!(e instanceof Error && e.name === "AbortError"))
        setToast("Could not share this search. Please try again.");
    }
  };
  const selected = search.results.find((r) => r.id === details);
  const hasSearch = !!search.submitted || search.loading;
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      <header className="site-header">
        <Link
          href="/"
          aria-label="BiteRadar home"
          onClick={(event) => {
            event.preventDefault();
            search.reset();
            setPanel(null);
            setDetails(null);
            window.scrollTo({ top: 0 });
          }}
          className="brand"
        >
          <Logo size="sm" />
        </Link>
        <span className="header-tagline">FOLLOW YOUR CRAVING</span>
        <nav aria-label="Main navigation">
          <button
            className="button subtle insights-nav"
            onClick={() => setPanel("insights")}
          >
            <Icon name="chart" />
            Community
          </button>
          <button
            className="avatar-button"
            onClick={() => setPanel("account")}
            aria-label="Open account menu"
          >
            {(profile?.name || user.displayName || user.email || "You")
              .slice(0, 1)
              .toUpperCase()}
          </button>
        </nav>
      </header>
      <main
        id="main-content"
        className={hasSearch ? "results-page" : "home-page"}
      >
        {!hasSearch && (
          <section className="hero">
            <span className="eyebrow">
              <span className="small-dot" /> YOUR NEXT GREAT BITE STARTS HERE
            </span>
            <h1>
              Big cravings.
              <br />
              <span>Great discoveries.</span>
            </h1>
            <p>
              Find the spots that do your favorite dish best.
              <br className="desktop-only" /> Real diner insights, a little AI,
              and a lot of good taste.
            </p>
            <div className="hero-decoration" aria-hidden="true">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="orbit orbit-three" />
              <div className="hero-bowl">
                <Icon name="bowl" size={86} />
              </div>
              <span className="orbit-label label-one">Worth the trip</span>
              <span className="orbit-label label-two">
                <Icon name="spark" size={16} />
                Found your favorite
              </span>
            </div>
          </section>
        )}
        <section className="search-section" aria-label="Search for a dish">
          <SearchBar
            value={search.draft}
            onChange={search.setDraft}
            onSearch={search.execute}
            loading={search.loading}
            searchStep={search.searchStep}
            hasMaps={!!mapsKey}
            compact={hasSearch}
          />
        </section>
        {search.error && (
          <div className="error-banner" role="alert">
            <span>{search.error}</span>
            <button
              className="icon-button"
              aria-label="Dismiss error"
              onClick={() => search.setError("")}
            >
              <Icon name="close" />
            </button>
          </div>
        )}
        {!hasSearch ? (
          <>
            <section className="discovery-section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">A LITTLE INSPIRATION</span>
                  <h2>What’s on everyone’s radar</h2>
                </div>
                <button
                  className="text-link"
                  onClick={() => setPanel("insights")}
                >
                  Explore trends
                  <Icon name="arrow" size={18} />
                </button>
              </div>
              {trending.length ? (
                <div className="trending-grid">
                  {trending.slice(0, 4).map((dish, i) => (
                    <button
                      className="trend-card"
                      key={dish.id}
                      onClick={() => chooseDish(dish.name)}
                    >
                      <RestaurantPhoto
                        url={dish.primary_photo_url}
                        name={dish.name}
                      />
                      <span className="trend-number">0{i + 1}</span>
                      <span className="trend-caption">
                        <strong>{dish.name}</strong>
                        <span>
                          {dish.cuisine ||
                            `${dish.search_count} cravings and counting`}
                          <Icon name="arrow" size={18} />
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="inspiration-empty">
                  <Icon name="bowl" size={32} />
                  <p>
                    Your next favorite starts with a craving. Search for a dish
                    above.
                  </p>
                </div>
              )}
            </section>
            {(history.length > 0 || !!profile?.favorite_dishes.length) && (
              <section className="discovery-section shortcuts">
                <div>
                  <h2>Pick up where you left off</h2>
                  <div className="chips">
                    {history.map((item) => (
                      <button
                        className="chip"
                        key={item.id}
                        onClick={() => search.restore(item)}
                      >
                        <Icon name="clock" size={16} />
                        <span>
                          {item.dish_name}
                          <small>{item.location}</small>
                        </span>
                        <Icon name="arrow" size={15} />
                      </button>
                    ))}
                  </div>
                </div>
                {!!profile?.favorite_dishes.length && (
                  <div>
                    <h2>Your go-to cravings</h2>
                    <div className="chips">
                      {profile.favorite_dishes.map((dish) => (
                        <button
                          className="chip"
                          key={dish}
                          onClick={() => chooseDish(dish)}
                        >
                          {dish}
                          <Icon name="arrow" size={15} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}
            <footer className="home-footer">
              <span>
                <Icon name="spark" size={18} /> Good food. Better informed.
              </span>
              <span>Recommendations shaped by real diner reviews.</span>
            </footer>
          </>
        ) : (
          <>
            <div className="results-heading">
              <div>
                <span className="eyebrow">YOUR FOOD RADAR</span>
                <h1>
                  {search.submitted ? (
                    <>
                      Great spots for <span>{search.submitted.dish_name}</span>
                    </>
                  ) : (
                    "Finding your next great bite"
                  )}
                </h1>
                <p className="muted" role="status">
                  {search.loading
                    ? "Reading the reviews and finding your matches…"
                    : `${search.results.length} spots in ${search.submitted?.location} · Ranked for your craving`}
                </p>
                {search.legacyHistory && (
                  <p className="muted">
                    Saved search · Original preferences weren’t recorded.
                  </p>
                )}
                {!!search.submitted && !search.legacyHistory && (
                  <div className="applied-preferences">
                    {search.submitted.dietary_filters.map((tag) => (
                      <span className="tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                    {search.submitted.price_tier && (
                      <span className="tag">{search.submitted.price_tier}</span>
                    )}
                    {search.submitted.max_distance_km && (
                      <span className="tag">
                        Within ~
                        {Math.round(search.submitted.max_distance_km / 1.6)} mi
                      </span>
                    )}
                  </div>
                )}
              </div>
              <button
                className="button secondary share-search"
                disabled={!search.submitted}
                onClick={() => share()}
              >
                <Icon name="share" />
                Share search
              </button>
            </div>
            <div
              className={`results-layout view-${view}`}
              aria-busy={search.loading}
            >
              <div className="results-list">
                {search.loading && <SearchProgress step={search.searchStep} />}
                {search.loading && !search.results.length ? (
                  [0, 1, 2].map((i) => (
                    <div className="skeleton-card" key={i}>
                      <div />
                      <span />
                      <span />
                    </div>
                  ))
                ) : search.results.length ? (
                  search.results.map((r, i) => (
                    <RestaurantCard
                      key={r.id}
                      restaurant={r}
                      rank={i + 1}
                      location={search.submitted?.location || ""}
                      selected={search.selectedId === r.id}
                      onSelect={() => select(r.id)}
                      onHighlight={setHighlight}
                    />
                  ))
                ) : (
                  <div className="empty-state">
                    <Icon name="search" size={40} />
                    <h2>No spots found this time</h2>
                    <p>Try a nearby city, a wider radius, or another dish.</p>
                    <button
                      className="button secondary"
                      onClick={() =>
                        search.execute({
                          ...search.draft,
                          dietary_filters: [],
                          price_tier: null,
                          max_distance_km: null,
                        })
                      }
                    >
                      Try without preferences
                    </button>
                  </div>
                )}
              </div>
              <aside className="map-column" aria-label="Restaurant map">
                <div className="map-frame">
                  {mapsKey ? (
                    (desktop || mapOpened) && (
                      <ResultsMap
                        results={search.results}
                        selectedId={search.selectedId}
                        highlightedId={highlight}
                        visible={desktop || view === "map"}
                        onSelect={select}
                      />
                    )
                  ) : (
                    <div className="map-unavailable">
                      <Icon name="map" size={36} />
                      <h3>Map unavailable</h3>
                      <p className="muted">
                        Explore the recommendations or open directions for any
                        spot.
                      </p>
                    </div>
                  )}
                </div>
                <div className="map-caption">
                  <span className="small-dot" />A good meal is closer than you
                  think.
                </div>
              </aside>
            </div>
            {!!search.results[0]?.query_id && (
              <button
                className="concierge-launcher"
                onClick={() => setPanel("chat")}
              >
                <Icon name="spark" />
                <span>Help me choose</span>
                <Icon name="arrow" size={16} />
              </button>
            )}
            <button
              className="map-toggle"
              onClick={() => {
                setMapOpened(true);
                setView(view === "list" ? "map" : "list");
                if (view === "map" && search.selectedId)
                  requestAnimationFrame(() =>
                    document
                      .getElementById(`restaurant-${search.selectedId}`)
                      ?.scrollIntoView({ block: "nearest" }),
                  );
              }}
            >
              <Icon name={view === "list" ? "map" : "list"} />
              {view === "list" ? "Show map" : "Show list"}
            </button>
          </>
        )}
      </main>
      {panel === "account" && (
        <Panel title="Your BiteRadar" onClose={() => setPanel(null)}>
          <div className="account-intro">
            <span className="eyebrow">WELCOME BACK</span>
            <h3>{profile?.name || user.displayName || "Food lover"}</h3>
            <p className="muted">{user.email}</p>
          </div>
          <ThemeSelector />
          <div className="account-links">
            <button
              onClick={() => {
                setOnboarding(false);
                setPanel("profile");
              }}
            >
              <Icon name="user" />
              Food preferences
              <Icon name="arrow" />
            </button>
            <button onClick={() => setPanel("history")}>
              <Icon name="clock" />
              Recent searches
              <Icon name="arrow" />
            </button>
            <button onClick={() => setPanel("insights")}>
              <Icon name="chart" />
              Community insights
              <Icon name="arrow" />
            </button>
            <button
              onClick={async () => {
                try {
                  await signOut(auth);
                } catch (e) {
                  setToast(errorMessage(e));
                }
              }}
            >
              Sign out
              <Icon name="arrow" />
            </button>
          </div>
        </Panel>
      )}
      {panel === "history" && (
        <Panel title="Recent searches" onClose={() => setPanel(null)}>
          <div className="account-links">
            {history.length ? (
              history.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setPanel(null);
                    search.restore(item);
                  }}
                >
                  <Icon name="clock" />
                  <span>
                    {item.dish_name}
                    <small>{item.location}</small>
                  </span>
                  <Icon name="arrow" />
                </button>
              ))
            ) : (
              <p className="muted">Your searches will appear here.</p>
            )}
          </div>
        </Panel>
      )}
      {panel === "profile" && (
        <ProfileModal
          isOpen
          userId={user.uid}
          defaultName={profile?.name || user.displayName || ""}
          initialCuisines={profile?.preferred_cuisines || []}
          initialDishes={profile?.favorite_dishes || []}
          isFirstTime={onboarding}
          onClose={() => setPanel(null)}
          onSave={(data) => {
            setProfile(data);
            setPanel(null);
            setOnboarding(false);
            setToast("Your food preferences are saved");
          }}
        />
      )}
      {panel === "insights" && (
        <InsightsModal
          isOpen
          onClose={() => setPanel(null)}
          onSelectTrend={chooseDish}
        />
      )}
      {!!search.results[0]?.query_id && (
        <Concierge
          open={panel === "chat"}
          key={`chat-${search.revision}`}
          queryId={search.results[0].query_id}
          results={search.results}
          onSelect={select}
          onClose={() => setPanel(null)}
        />
      )}
      {selected && (
        <RestaurantDetails
          key={`details-${selected.id}`}
          restaurant={selected}
          location={search.submitted?.location || ""}
          onClose={() => setDetails(null)}
          onShare={share}
          onFeedback={(id, helpful) =>
            search.setResults((items) =>
              items.map((r) => (r.id === id ? { ...r, helpful } : r)),
            )
          }
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Icon name="check" size={17} />
          {toast}
        </div>
      )}
    </div>
  );
}
