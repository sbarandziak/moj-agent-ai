"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";

type Briefing = {
  id: string;
  created_at: string;
  date: string;
  content: string;
};

export default function BriefingDetailPage({ params }: { params: { id: string } }) {
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadBriefing();
  }, [params.id]);

  async function loadBriefing() {
    setLoading(true);
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/briefings?id=eq.${params.id}&select=*`,
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
  }

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
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "20px" }}>
        <p>Ładuję briefing...</p>
      </div>
    );
  }

  if (!briefing) {
    return (
      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "20px" }}>
        <p style={{ color: "red" }}>Briefing nie znaleziony.</p>
        <Link href="/briefings" style={{ color: "#007bff" }}>
          ← Wróć do listy
        </Link>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: "900px", margin: "0 auto", padding: "20px" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "20px",
          paddingBottom: "15px",
          borderBottom: "1px solid #ddd",
        }}
      >
        <div>
          <h1 style={{ marginBottom: "5px" }}>
            {new Date(briefing.date).toLocaleDateString("pl-PL", {
              day: "numeric",
              month: "long",
              year: "numeric",
              weekday: "long",
            })}
          </h1>
          <p style={{ color: "#666", fontSize: "12px", margin: 0 }}>
            Wygenerowany:{" "}
            {new Date(briefing.created_at).toLocaleString("pl-PL")}
          </p>
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button
            onClick={copyToClipboard}
            style={{
              padding: "8px 16px",
              backgroundColor: "#28a745",
              color: "white",
              border: "none",
              borderRadius: "6px",
              cursor: "pointer",
              fontSize: "14px",
            }}
          >
            {copied ? "✅ Skopiowano!" : "📋 Kopiuj"}
          </button>
          <Link
            href="/briefings"
            style={{
              padding: "8px 16px",
              backgroundColor: "#6c757d",
              color: "white",
              border: "none",
              borderRadius: "6px",
              textDecoration: "none",
              display: "flex",
              alignItems: "center",
              cursor: "pointer",
            }}
          >
            ← Wróć
          </Link>
        </div>
      </div>

      <div
        style={{
          backgroundColor: "#f9f9f9",
          padding: "20px",
          borderRadius: "8px",
          lineHeight: "1.8",
          color: "#333",
        }}
      >
        <ReactMarkdown
          components={{
            h1: ({ children }) => (
              <h1 style={{ fontSize: "24px", marginTop: "20px", marginBottom: "10px" }}>
                {children}
              </h1>
            ),
            h2: ({ children }) => (
              <h2 style={{ fontSize: "18px", marginTop: "15px", marginBottom: "10px" }}>
                {children}
              </h2>
            ),
            p: ({ children }) => (
              <p style={{ marginBottom: "12px" }}>{children}</p>
            ),
            ul: ({ children }) => (
              <ul style={{ marginBottom: "12px", marginLeft: "20px" }}>
                {children}
              </ul>
            ),
            li: ({ children }) => (
              <li style={{ marginBottom: "6px" }}>{children}</li>
            ),
            code: ({ children }) => (
              <code
                style={{
                  backgroundColor: "#e9ecef",
                  padding: "2px 6px",
                  borderRadius: "3px",
                  fontFamily: "monospace",
                  fontSize: "12px",
                }}
              >
                {children}
              </code>
            ),
          }}
        >
          {briefing.content}
        </ReactMarkdown>
      </div>
    </div>
  );
}
