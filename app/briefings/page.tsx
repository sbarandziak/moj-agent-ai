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
  const [error, setError] = useState<string | null>(null);

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
    setError(null);
    try {
      const response = await fetch("/api/briefing/generate");
      const data = await response.json();

      if (data.success) {
        await loadBriefings();
      } else {
        setError(data.error ?? "Nie udało się wygenerować briefingu.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nieznany błąd");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="rp">
      <div className="rp-header">
        <h1>Briefingi</h1>
        <p className="rp-sub">Automatyczne podsumowania dnia od Twojego agenta</p>
      </div>

      <div className="rp-actions" style={{ marginTop: 0 }}>
        <button
          type="button"
          className="rp-btn rp-btn-primary"
          onClick={generateBriefing}
          disabled={generating}
        >
          {generating ? "⏳ Generuję…" : "🔄 Wygeneruj teraz"}
        </button>
        {!loading && briefings.length > 0 && (
          <span className="rp-sub">
            Razem: <b>{briefings.length}</b>
          </span>
        )}
      </div>

      {error && <div className="et-error">⚠️ {error}</div>}

      {loading ? (
        <div className="skeleton-wrap" style={{ marginTop: 20 }}>
          <div className="skeleton-line" style={{ width: "70%" }} />
          <div className="skeleton-line" style={{ width: "90%" }} />
          <div className="skeleton-line" style={{ width: "60%" }} />
        </div>
      ) : briefings.length === 0 ? (
        <div className="rp-empty">
          <p>Brak briefingów — cron wygeneruje pierwszy jutro rano.</p>
          <p style={{ marginTop: 8 }}>
            Możesz też kliknąć „Wygeneruj teraz”, żeby zobaczyć efekt od razu.
          </p>
        </div>
      ) : (
        <div className="history-list" style={{ marginTop: 18 }}>
          {briefings.map((briefing) => {
            const formattedDate = new Date(briefing.date).toLocaleDateString("pl-PL", {
              day: "numeric",
              month: "long",
              year: "numeric",
              weekday: "long",
            });

            const preview =
              briefing.content
                .replace(/[#*_[\]]/g, "")
                .slice(0, 150)
                .trim() + "…";

            return (
              <div key={briefing.id} className="conv-card">
                <Link href={`/briefings/${briefing.id}`} className="conv-main">
                  <div className="et-card-head" style={{ marginBottom: 6 }}>
                    <span className="conv-title" style={{ marginBottom: 0 }}>
                      {formattedDate}
                    </span>
                    <span className="eyebrow saved" style={{ marginLeft: "auto" }}>
                      Gotowy
                    </span>
                  </div>
                  <div className="conv-meta">
                    {new Date(briefing.created_at).toLocaleTimeString("pl-PL", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                  <div className="conv-preview">{preview}</div>
                </Link>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
