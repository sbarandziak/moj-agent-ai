"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

type Briefing = {
  id: string;
  created_at: string;
  date: string;
  content: string;
};

export default function BriefingDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const loadBriefing = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/briefings?id=eq.${id}&select=*`,
        {
          headers: {
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
          },
        }
      );

      if (!response.ok) throw new Error("Failed to load briefing");
      const data = await response.json();
      if (data.length > 0) {
        setBriefing(data[0]);
      }
    } catch (err) {
      console.error("Error loading briefing:", err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadBriefing();
  }, [loadBriefing]);

  async function copyToClipboard() {
    if (!briefing) return;
    try {
      await navigator.clipboard.writeText(briefing.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  }

  if (loading) {
    return (
      <div className="rp">
        <div className="skeleton-wrap">
          <div className="skeleton-line" style={{ width: "50%" }} />
          <div className="skeleton-line" style={{ width: "85%" }} />
          <div className="skeleton-line" style={{ width: "70%" }} />
        </div>
      </div>
    );
  }

  if (!briefing) {
    return (
      <div className="rp">
        <div className="et-error">⚠️ Nie znalazłem tego briefingu.</div>
        <div className="rp-actions">
          <Link href="/briefings" className="conv-back">
            ← Wróć do listy
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rp">
      <div className="conv-topbar">
        <div>
          <h1 className="rp-header" style={{ margin: 0, fontSize: "1.4rem", fontWeight: 500 }}>
            {new Date(briefing.date).toLocaleDateString("pl-PL", {
              day: "numeric",
              month: "long",
              year: "numeric",
              weekday: "long",
            })}
          </h1>
          <p className="rp-sub">
            Wygenerowany: {new Date(briefing.created_at).toLocaleString("pl-PL")}
          </p>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="button" className="rp-btn" onClick={copyToClipboard}>
            {copied ? "✅ Skopiowano!" : "📋 Kopiuj"}
          </button>
          <Link href="/briefings" className="conv-back">
            ← Wróć
          </Link>
        </div>
      </div>

      <div className="rp-report markdown">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{briefing.content}</ReactMarkdown>
      </div>
    </div>
  );
}
