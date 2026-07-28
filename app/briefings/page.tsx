"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Briefing = {
  id: string;
  created_at: string;
  date: string;
  content: string;
};

export default function BriefingsPage() {
  const [briefings, setBriefings] = useState<Briefing[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    loadBriefings();
  }, []);

  async function loadBriefings() {
    setLoading(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/briefings?select=*&order=created_at.desc&limit=30`,
        {
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
          },
        }
      );

      if (!response.ok) throw new Error("Failed to load briefings");
      const data = await response.json();
      setBriefings(data);
    } catch (err) {
      console.error("Error loading briefings:", err);
      setBriefings([]);
    } finally {
      setLoading(false);
    }
  }

  async function generateBriefing() {
    setGenerating(true);
    try {
      const response = await fetch("/api/cron/morning");
      const data = await response.json();

      if (data.success) {
        await loadBriefings();
      } else {
        alert("Błąd generowania: " + data.error);
      }
    } catch (err) {
      alert("Błąd: " + (err instanceof Error ? err.message : "Nieznany błąd"));
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "20px" }}>
      <div style={{ marginBottom: "30px" }}>
        <h1 style={{ marginBottom: "5px" }}>📰 Briefingi</h1>
        <p style={{ color: "#666", marginBottom: "20px" }}>
          Automatyczne podsumowania dnia od Twojego agenta
        </p>

        <button
          onClick={generateBriefing}
          disabled={generating}
          style={{
            padding: "10px 20px",
            backgroundColor: "#007bff",
            color: "white",
            border: "none",
            borderRadius: "6px",
            cursor: generating ? "not-allowed" : "pointer",
            opacity: generating ? 0.6 : 1,
            fontSize: "14px",
            fontWeight: "bold",
          }}
        >
          {generating ? "⏳ Generuję..." : "🔄 Wygeneruj teraz"}
        </button>
      </div>

      {loading ? (
        <p>Ładuję briefingi...</p>
      ) : briefings.length === 0 ? (
        <div
          style={{
            padding: "30px",
            backgroundColor: "#f5f5f5",
            borderRadius: "8px",
            textAlign: "center",
            color: "#666",
          }}
        >
          <p>Brak briefingów. Cron job wygeneruje pierwszy jutro rano!</p>
          <p style={{ fontSize: "12px", marginTop: "10px" }}>
            Lub kliknij przycisk powyżej, aby wygenerować teraz.
          </p>
        </div>
      ) : (
        <div>
          <p style={{ color: "#666", marginBottom: "15px" }}>
            Razem: <strong>{briefings.length}</strong> briefing(ów)
          </p>

          {briefings.map((briefing) => {
            const dateObj = new Date(briefing.date);
            const formattedDate = dateObj.toLocaleDateString("pl-PL", {
              day: "numeric",
              month: "long",
              year: "numeric",
              weekday: "long",
            });

            const preview = briefing.content
              .replace(/[#*_\[\]]/g, "")
              .slice(0, 150)
              .trim() + "...";

            return (
              <Link
                key={briefing.id}
                href={`/briefings/${briefing.id}`}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div
                  style={{
                    border: "1px solid #ddd",
                    borderRadius: "8px",
                    padding: "20px",
                    marginBottom: "15px",
                    backgroundColor: "#fff",
                    cursor: "pointer",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow =
                      "0 4px 12px rgba(0,0,0,0.1)";
                    (e.currentTarget as HTMLDivElement).style.transform =
                      "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLDivElement).style.boxShadow =
                      "none";
                    (e.currentTarget as HTMLDivElement).style.transform =
                      "none";
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "start",
                      marginBottom: "10px",
                    }}
                  >
                    <div>
                      <h3 style={{ margin: 0, fontSize: "16px" }}>
                        {formattedDate}
                      </h3>
                      <p style={{ margin: "5px 0 0 0", color: "#666", fontSize: "12px" }}>
                        {new Date(briefing.created_at).toLocaleTimeString("pl-PL", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "4px 8px",
                        backgroundColor: "#d4edda",
                        color: "#155724",
                        borderRadius: "4px",
                        fontSize: "12px",
                        fontWeight: "bold",
                      }}
                    >
                      ✅ Gotowy
                    </span>
                  </div>

                  <p
                    style={{
                      margin: 0,
                      color: "#555",
                      fontSize: "14px",
                      lineHeight: "1.5",
                    }}
                  >
                    {preview}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
