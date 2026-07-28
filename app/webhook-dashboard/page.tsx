"use client";

import { useEffect, useState } from "react";

type WebhookEvent = {
  id: string;
  created_at: string;
  type: "feedback" | "alert" | "order";
  data: Record<string, unknown>;
  analysis: string;
};

export default function WebhookDashboard() {
  const [events, setEvents] = useState<WebhookEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "feedback" | "alert" | "order">(
    "all"
  );

  useEffect(() => {
    loadEvents();
  }, [filter]);

  async function loadEvents() {
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
  }

  return (
    <div style={{ padding: "20px", fontFamily: "Arial, sans-serif" }}>
      <h1>📊 Webhook Events Dashboard</h1>

      <div style={{ marginBottom: "20px" }}>
        <label style={{ marginRight: "10px" }}>Filter by type: </label>
        <select
          value={filter}
          onChange={(e) =>
            setFilter(e.target.value as "all" | "feedback" | "alert" | "order")
          }
        >
          <option value="all">All Events</option>
          <option value="feedback">Feedback</option>
          <option value="alert">Alert</option>
          <option value="order">Order</option>
        </select>
        <button onClick={loadEvents} style={{ marginLeft: "10px" }}>
          Refresh
        </button>
      </div>

      {loading ? (
        <p>Loading...</p>
      ) : events.length === 0 ? (
        <p style={{ color: "#666" }}>No events found. Send a webhook test!</p>
      ) : (
        <div>
          <p style={{ color: "#666" }}>
            Found <strong>{events.length}</strong> event(s)
          </p>
          {events.map((event) => (
            <div
              key={event.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: "8px",
                padding: "15px",
                marginBottom: "15px",
                backgroundColor:
                  event.type === "feedback"
                    ? "#f0f8ff"
                    : event.type === "alert"
                      ? "#ffe0e0"
                      : "#f0f0f0",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div>
                  <span
                    style={{
                      display: "inline-block",
                      padding: "4px 8px",
                      borderRadius: "4px",
                      fontSize: "12px",
                      fontWeight: "bold",
                      backgroundColor:
                        event.type === "feedback"
                          ? "#007bff"
                          : event.type === "alert"
                            ? "#dc3545"
                            : "#6c757d",
                      color: "white",
                      marginRight: "10px",
                    }}
                  >
                    {event.type.toUpperCase()}
                  </span>
                  <span style={{ fontSize: "12px", color: "#666" }}>
                    {new Date(event.created_at).toLocaleString()}
                  </span>
                </div>
                <code style={{ fontSize: "11px", color: "#666" }}>
                  {event.id.slice(0, 8)}...
                </code>
              </div>

              <div style={{ marginTop: "10px" }}>
                <strong>Data:</strong>
                <pre
                  style={{
                    backgroundColor: "#f5f5f5",
                    padding: "10px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    overflow: "auto",
                    marginTop: "5px",
                  }}
                >
                  {JSON.stringify(event.data, null, 2)}
                </pre>
              </div>

              <div style={{ marginTop: "10px" }}>
                <strong>Analysis (Agent):</strong>
                <pre
                  style={{
                    backgroundColor: "#f9f9f9",
                    padding: "10px",
                    borderRadius: "4px",
                    fontSize: "12px",
                    overflow: "auto",
                    marginTop: "5px",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {event.analysis}
                </pre>
              </div>
            </div>
          ))}
        </div>
      )}

      <hr style={{ margin: "30px 0" }} />

      <h2>🧪 Quick Test</h2>
      <p>Run this in DevTools Console to send a test webhook:</p>

      <div style={{ backgroundColor: "#f5f5f5", padding: "10px", borderRadius: "4px" }}>
        <code style={{ fontSize: "12px", fontFamily: "monospace" }}>
          fetch('/api/webhook', {"{"}
          <br />
          &nbsp;&nbsp;method: 'POST',
          <br />
          &nbsp;&nbsp;headers: {"{"}
          'Content-Type': 'application/json' {"}"},
          <br />
          &nbsp;&nbsp;body: JSON.stringify({"{"}
          <br />
          &nbsp;&nbsp;&nbsp;&nbsp;type: 'feedback',
          <br />
          &nbsp;&nbsp;&nbsp;&nbsp;data: {"{"}
          <br />
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;customer: 'Test User',
          <br />
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;rating: 4,
          <br />
          &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;comment: 'Great service!'
          <br />
          &nbsp;&nbsp;&nbsp;&nbsp;{"}"}
          <br />
          &nbsp;&nbsp;{"}"})<br />
          {"}"}).then(r =&gt; r.json()).then(console.log)
        </code>
      </div>

      <p style={{ marginTop: "10px", fontSize: "12px", color: "#666" }}>
        Then refresh this page to see the new event.
      </p>
    </div>
  );
}
