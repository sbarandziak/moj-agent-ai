"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Klikalne przykłady — kliknięcie wkleja URL i od razu zleca streszczenie.
const EXAMPLES = [
  { label: "Wikipedia: Sztuczna inteligencja", url: "https://pl.wikipedia.org/wiki/Sztuczna_inteligencja" },
  { label: "Wikipedia: ChatGPT", url: "https://pl.wikipedia.org/wiki/ChatGPT" },
  { label: "Wikipedia: Next.js", url: "https://pl.wikipedia.org/wiki/Next.js" },
];

// Etykiety kroków agenta — pokazujemy, co właśnie robi (a nie pusty spinner).
const TOOL_LABEL: Record<string, string> = {
  readWebPage: "📄 Czytam stronę…",
};

export default function SummarizePage() {
  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: "/api/summarize" }),
  });

  const [url, setUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");

  function textOf(message: (typeof messages)[number]) {
    return message.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("");
  }

  // Kroki agenta w kolejności wywołania (części "tool-<nazwa>").
  function stepsOf(message: (typeof messages)[number]): string[] {
    return message.parts
      .filter((p) => p.type.startsWith("tool-"))
      .map((p) => TOOL_LABEL[p.type.slice("tool-".length)] ?? "🔧 Narzędzie…");
  }

  const summary = lastAssistant ? textOf(lastAssistant) : "";
  const steps = lastAssistant ? stepsOf(lastAssistant) : [];

  function summarize(link: string) {
    const u = link.trim();
    if (!u || isLoading) return;

    // Każde streszczenie to osobne zadanie — nie ciągniemy historii rozmowy.
    setMessages([]);
    sendMessage({ text: `Streść artykuł spod tego adresu: ${u}` });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    summarize(url);
  }

  function useExample(link: string) {
    setUrl(link);
    summarize(link);
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Skopiuj streszczenie ręcznie:", summary);
    }
  }

  return (
    <div className="rp">
      <header className="rp-header">
        <h1>📖 Streszczacz artykułów</h1>
        <p className="rp-sub">Wklej link — agent przeczyta stronę i streści ją w kilka sekund</p>
      </header>

      <form className="rp-form" onSubmit={handleSubmit}>
        <input
          className="rp-input"
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Np. https://pl.wikipedia.org/wiki/Sztuczna_inteligencja"
          disabled={isLoading}
          autoFocus
        />
        <button
          type="submit"
          className="rp-btn rp-btn-primary"
          disabled={isLoading || !url.trim()}
        >
          {isLoading ? "⏳ Streszczam…" : "📖 Streść"}
        </button>
      </form>

      <div className="rp-examples">
        {EXAMPLES.map((ex) => (
          <button
            key={ex.url}
            type="button"
            className="rp-example"
            onClick={() => useExample(ex.url)}
            disabled={isLoading}
          >
            {ex.label}
          </button>
        ))}
      </div>

      {/* Postęp pracy agenta: które narzędzie właśnie odpalił. */}
      {(isLoading || steps.length > 0) && (
        <div className="rp-steps">
          {steps.map((s, i) => (
            <span key={i} className="rp-step">
              {s}
            </span>
          ))}
          {isLoading && (
            <span className="rp-step pending">
              {steps.length === 0 ? "🔗 Otwieram stronę…" : "✍️ Piszę streszczenie…"}
            </span>
          )}
        </div>
      )}

      {summary && (
        <>
          <div className="rp-actions">
            <button type="button" className="rp-btn" onClick={copySummary}>
              {copied ? "✅ Skopiowano!" : "📋 Kopiuj streszczenie"}
            </button>
          </div>

          <article className="rp-report markdown">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                table: ({ children }) => (
                  <div className="md-table-wrap">
                    <table>{children}</table>
                  </div>
                ),
              }}
            >
              {summary}
            </ReactMarkdown>
          </article>
        </>
      )}

      {!summary && !isLoading && (
        <div className="rp-empty">
          Wklej adres artykułu (albo kliknij przykład) — agent otworzy stronę,
          przeczyta ją i napisze streszczenie: sedno w 3 zdaniach, kluczowe
          punkty i dla kogo tekst jest przydatny.
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
