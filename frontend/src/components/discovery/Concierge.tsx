"use client";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage, Restaurant } from "@/lib/types";
import { post, errorMessage } from "@/lib/api";
import { trackConciergeInquiry } from "@/lib/analytics";
import { Panel } from "./Panel";
import { Icon } from "./Icon";
export function Concierge({
  open,
  queryId,
  results,
  onSelect,
  onClose,
}: {
  open: boolean;
  queryId: number;
  results: Restaurant[];
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function send(text: string) {
    if (!text.trim() || loading) return;
    const next: ChatMessage[] = [
      ...messages,
      { sender: "user", text: text.trim() },
    ];
    setMessages(next);
    setInput("");
    setLoading(true);
    setError("");
    controller.current = new AbortController();
    trackConciergeInquiry(queryId, text.length);
    try {
      const reply = await post<{
        response: string;
        cited_restaurants: string[];
      }>(
        "/api/chat",
        { query_id: queryId, message: text.trim(), history: next },
        controller.current.signal,
      );
      setMessages([
        ...next,
        {
          sender: "assistant",
          text: reply.response,
          cited_restaurants: reply.cited_restaurants,
        },
      ]);
    } catch (e) {
      if (!controller.current?.signal.aborted) {
        setError(errorMessage(e));
        setInput(text);
      }
    } finally {
      setLoading(false);
    }
  }
  if (!open) return null;
  return (
    <Panel title="Your foodie concierge" kind="full" onClose={onClose}>
      <div className="concierge-intro">
        <Icon name="spark" size={30} />
        <h3>A little help choosing?</h3>
        <p className="muted">
          Ask about these {results.length} spots. Answers are based on the
          available restaurant information.
        </p>
      </div>
      <div className="chips">
        {[
          "Which spot is best on a budget?",
          "Any outdoor seating?",
          "Which has vegan options?",
        ].map((p) => (
          <button
            className="chip"
            key={p}
            disabled={loading}
            onClick={() => send(p)}
          >
            {p}
          </button>
        ))}
      </div>
      <div className="chat-messages" role="log" aria-live="polite">
        {messages.map((m, i) => (
          <div key={i} className={`chat-message ${m.sender}`}>
            <span className="eyebrow">
              {m.sender === "user" ? "YOU" : "BITE RADAR"}
            </span>
            <p>{m.text}</p>
            <div className="chips">
              {m.cited_restaurants?.map((name) => {
                const r = results.find(
                  (item) => item.name.toLowerCase() === name.toLowerCase(),
                );
                return (
                  r && (
                    <button
                      className="chip"
                      key={name}
                      onClick={() => {
                        onClose();
                        onSelect(r.id);
                      }}
                    >
                      <Icon name="pin" size={14} />
                      {name}
                    </button>
                  )
                );
              })}
            </div>
          </div>
        ))}
        {loading && (
          <p role="status" className="muted">
            Finding an answer…
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
      >
        <label className="sr-only" htmlFor="chat-input">
          Ask about these spots
        </label>
        <input
          id="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="What would you like to know?"
        />
        <button
          className="button primary"
          disabled={loading || !input.trim()}
          aria-label="Send question"
        >
          <Icon name="arrow" />
        </button>
      </form>
    </Panel>
  );
}
