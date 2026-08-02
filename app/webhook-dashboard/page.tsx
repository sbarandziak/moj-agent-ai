"use client";

import { useCallback, useEffect, useState } from "react";

type WebhookEvent = {
  id: string;
  created_at: string;
  type: "feedback" | "alert" | "order";
  data: Record<string, unknown>;
  analysis: string;
};

type Filter = "all" | "feedback" | "alert" | "order";

// Kolor kropki przy typie zdarzenia (akcenty z systemu wizualnego).
const TYPE_DOT: Record<WebhookEvent["type"], string> = {
  feedback: "var(--dot-ops)",
  alert: "var(--dot-sales)",
  order: "var(--dot-fin)",
};

export default function WebhookDashboard() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      // Pobierz dane bezpośrednio z Supabase (public read access)
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/webhook_events?select=*&order=created_at.desc` +
          (filter !== "all" ? `&type=eq.${filter}` : ""),
        {
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
          },
        }
      );

      if (!response.ok) throw new Error("Failed to load events");
      const data = await response.json();
      setEvents(data);
    } catch (err) {
      console.error("Error loading webhook events:", err);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  return (
    <div className="rp">
      <div className="rp-header">
        <h1>Webhook Events</h1>
        <p className="rp-sub">Zdarzenia przyjęte przez /api/webhook wraz z analizą agenta</p>
      </div>

      <div className="rp-actions" style={{ marginTop: 0 }}>
        <label className="rp-sub" htmlFor="wh-filter">
          Typ zdarzenia
        </label>
        <select
          id="wh-filter"
          className="rp-select"
          value={filter}
          onChange={(e) => setFilter(e.target.value as Filter)}
        >
          <option value="all">Wszystkie</option>
          <option value="feedback">Feedback</option>
          <option value="alert">Alert</option>
          <option value="order">Order</option>
        </select>
        <button type="button" className="rp-btn" onClick={loadEvents} disabled={loading}>
          🔄 Odśwież
        </button>
        {!loading && events.length > 0 && (
          <span className="rp-sub" style={{ marginLeft: "auto" }}>
            Zdarzeń: <b>{events.length}</b>
          </span>
        )}
      </div>

      {loading ? (
        <div className="skeleton-wrap" style={{ marginTop: 20 }}>
          <div className="skeleton-line" style={{ width: "80%" }} />
          <div className="skeleton-line" style={{ width: "60%" }} />
        </div>
      ) : events.length === 0 ? (
        <div className="rp-empty">
          Brak zdarzeń. Wyślij testowy webhook (instrukcja niżej).
        </div>
      ) : (
        <div className="et-cards" style={{ marginTop: 18 }}>
          {events.map((event) => (
            <div key={event.id} className="et-card">
              <div className="et-card-head">
                <span className="tag">
                  <i style={{ background: TYPE_DOT[event.type] }} />
                  {event.type.toUpperCase()}
                </span>
                <span className="conv-meta" style={{ margin: 0 }}>
                  {new Date(event.created_at).toLocaleString("pl-PL")}
                </span>
                <code className="eyebrow" style={{ marginLeft: "auto" }}>
                  {event.id.slice(0, 8)}
                </code>
              </div>

              <div className="et-draft-head">Dane</div>
              <pre className="wh-pre">{JSON.stringify(event.data, null, 2)}</pre>

              <div className="et-draft-head" style={{ marginTop: 12 }}>
                Analiza agenta
              </div>
              <pre className="wh-pre wrap">{event.analysis}</pre>
            </div>
          ))}
        </div>
      )}

      <div className="rp-saved">
        <div className="rp-saved-title">🧪 Szybki test</div>
        <p className="rp-sub" style={{ marginBottom: 10 }}>
          Wklej w konsoli DevTools, żeby wysłać przykładowe zdarzenie:
        </p>
        <pre className="wh-pre">{`fetch('/api/webhook', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'feedback',
    data: { customer: 'Test User', rating: 4, comment: 'Great service!' }
  })
}).then(r => r.json()).then(console.log)`}</pre>
        <p className="rp-sub" style={{ marginTop: 10 }}>
          Potem kliknij „Odśwież”, żeby zobaczyć nowe zdarzenie.
        </p>
      </div>
    </div>
  );
}
