"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { SAMPLE_EMAILS } from "./sample";

// --- Parsowanie odpowiedzi agenta -----------------------------------------
// Model odpowiada w ustalonym formacie (patrz /api/email-triage):
//   ### Mail 1: temat
//   | Kategoria | ... |
//   | Priorytet | 🔴 Wysoki |
//   | Uzasadnienie | ... |
//   **Proponowana odpowiedź:**
//   > draft
// Rozbijamy to na karty, żeby pokolorować ramki i dodać "Kopiuj draft".

type Priority = "high" | "mid" | "low" | "none";

type Card = {
  title: string;
  meta: { label: string; value: string }[];
  draft: string;
  priority: Priority;
  isSummary: boolean;
  rest: string; // reszta treści (gdy model odbiegnie od formatu)
};

const PRIORITY_LABEL: Record<Priority, string> = {
  high: "🔴 Wysoki",
  mid: "🟡 Średni",
  low: "🟢 Niski",
  none: "—",
};

function priorityOf(value: string): Priority {
  if (value.includes("🔴") || /wysoki/i.test(value)) return "high";
  if (value.includes("🟡") || /średni|sredni/i.test(value)) return "mid";
  if (value.includes("🟢") || /niski/i.test(value)) return "low";
  return "none";
}

// Wiersz "| Kategoria | zapytanie ofertowe |" -> { label, value }.
function parseMetaRow(line: string) {
  const cells = line
    .split("|")
    .map((c) => c.trim())
    .filter(Boolean);
  if (cells.length < 2) return null;
  return { label: cells[0], value: cells.slice(1).join(" ") };
}

function parseCards(text: string): Card[] {
  if (!text.trim()) return [];

  // Tnij po nagłówkach "### ..." — każdy mail to jedna sekcja, podsumowanie też.
  const sections = text
    .split(/^###\s+/m)
    .map((s) => s.trim())
    .filter(Boolean);

  return sections.map((section) => {
    const [head, ...bodyLines] = section.split("\n");
    const meta: Card["meta"] = [];
    const draftLines: string[] = [];
    const restLines: string[] = [];
    let inDraft = false;

    for (const raw of bodyLines) {
      const line = raw.trim();
      if (!line || line === "---") continue;

      if (/^\*\*Proponowana odpowiedź/i.test(line)) {
        inDraft = true;
        continue;
      }
      if (line.startsWith(">")) {
        draftLines.push(line.replace(/^>\s?/, ""));
        continue;
      }
      if (line.startsWith("|")) {
        // Pomiń separator tabeli markdown (|---|---|), gdyby model go dodał.
        if (/^\|[\s:-]+\|$/.test(line)) continue;
        const row = parseMetaRow(line);
        if (row) meta.push(row);
        continue;
      }
      if (inDraft) draftLines.push(line);
      else restLines.push(line);
    }

    const isSummary = /podsumowanie/i.test(head);
    const prioRow = meta.find((m) => /priorytet/i.test(m.label));

    return {
      title: head.trim(),
      meta,
      draft: draftLines.join("\n").trim(),
      priority: isSummary ? "none" : priorityOf(prioRow?.value ?? ""),
      isSummary,
      rest: restLines.join("\n").trim(),
    };
  });
}

export default function EmailTriagePage() {
  const [input, setInput] = useState("");
  const [result, setResult] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cards = parseCards(result);
  const mailCards = cards.filter((c) => !c.isSummary);
  const counts = {
    high: mailCards.filter((c) => c.priority === "high").length,
    mid: mailCards.filter((c) => c.priority === "mid").length,
    low: mailCards.filter((c) => c.priority === "low").length,
  };

  // Maile oddzielone pustą linią -> tablica stringów dla /api/email-triage.
  function splitEmails(text: string) {
    return text
      .split(/\n\s*\n/)
      .map((e) => e.trim())
      .filter(Boolean);
  }

  async function analyze() {
    const emails = splitEmails(input);
    if (loading || emails.length === 0) return;

    setLoading(true);
    setError(null);
    setResult("");

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/email-triage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(await res.text().catch(() => "Błąd serwera"));
      }

      // Streaming: dopisujemy kolejne kawałki, karty przebudowują się na żywo.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setResult((prev) => prev + chunk);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setError((e as Error).message || "Nie udało się przeanalizować maili.");
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  async function copyDraft(text: string, index: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(index);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      window.prompt("Skopiuj draft ręcznie:", text);
    }
  }

  const emailCount = splitEmails(input).length;

  return (
    <div className="et">
      <header className="et-header">
        <h1>📧 E-mail Triage</h1>
        <p className="et-sub">
          Wklej maile — agent posortuje i napisze odpowiedzi
        </p>
      </header>

      <div className="et-form">
        <textarea
          className="et-textarea"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Wklej maile tutaj — oddziel je pustą linią..."
          disabled={loading}
        />

        <div className="et-actions">
          <button
            type="button"
            className="et-btn et-btn-primary"
            onClick={analyze}
            disabled={loading || emailCount === 0}
          >
            {loading ? "⏳ Analizuję…" : "📧 Analizuj maile"}
          </button>
          <button
            type="button"
            className="et-btn"
            onClick={() => setInput(SAMPLE_EMAILS)}
            disabled={loading}
          >
            📋 Wklej przykład
          </button>
          <span className="et-count">
            {emailCount > 0 ? `Wykryto maili: ${emailCount}` : "Brak maili"}
          </span>
        </div>
      </div>

      {error && <div className="et-error">⚠️ {error}</div>}

      {/* Podsumowanie liczbowe — liczone z kart, aktualizuje się w trakcie streamu. */}
      {mailCards.length > 0 && (
        <div className="et-summary">
          <span className="et-pill high">🔴 Pilne: {counts.high}</span>
          <span className="et-pill mid">🟡 Średnie: {counts.mid}</span>
          <span className="et-pill low">🟢 Niskie: {counts.low}</span>
        </div>
      )}

      <div className="et-cards">
        {cards.map((card, i) => (
          <article
            key={i}
            className={`et-card ${card.isSummary ? "summary" : card.priority}`}
          >
            <div className="et-card-head">
              <h2 className="et-card-title">{card.title}</h2>
              {!card.isSummary && (
                <span className={`et-badge ${card.priority}`}>
                  {PRIORITY_LABEL[card.priority]}
                </span>
              )}
            </div>

            {card.meta.length > 0 && (
              <dl className="et-meta">
                {card.meta.map((m, j) => (
                  <div key={j} className="et-meta-row">
                    <dt>{m.label}</dt>
                    <dd>{m.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            {card.rest && (
              <div className="et-body markdown">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {card.rest}
                </ReactMarkdown>
              </div>
            )}

            {card.draft && (
              <div className="et-draft">
                <div className="et-draft-head">
                  <span>✍️ Proponowana odpowiedź</span>
                  <button
                    type="button"
                    className="et-copy"
                    onClick={() => copyDraft(card.draft, i)}
                  >
                    {copied === i ? "✅ Skopiowano" : "📋 Kopiuj draft"}
                  </button>
                </div>
                <blockquote className="et-quote">{card.draft}</blockquote>
              </div>
            )}
          </article>
        ))}

        {loading && cards.length === 0 && (
          <div className="et-empty">📧 Czytam maile i sortuję…</div>
        )}

        {!loading && cards.length === 0 && !error && (
          <div className="et-empty">
            Wklej maile (oddzielone pustą linią) albo kliknij{" "}
            <b>📋 Wklej przykład</b>, a agent skategoryzuje je, nada priorytet
            i napisze szkice odpowiedzi.
          </div>
        )}
      </div>
    </div>
  );
}
