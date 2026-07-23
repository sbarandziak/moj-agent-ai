"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Klikalne przykłady — kliknięcie wypełnia 3 pola i od razu zleca porównanie.
const EXAMPLES = [
  ["Shopify", "WooCommerce", "PrestaShop"],
  ["Notion", "Obsidian", "Evernote"],
  ["Vercel", "Netlify", "Railway"],
  ["ChatGPT", "Claude", "Gemini"],
];

type Source = { url: string; title: string };

// Etykiety kroków agenta — pokazujemy, co właśnie robi (a nie pusty spinner).
const TOOL_LABEL: Record<string, string> = {
  google_search: "🔎 Szukam w Google…",
  readWebPage: "📄 Czytam stronę…",
  searchWikipedia: "📖 Sprawdzam Wikipedię…",
};

export default function CompetitorPage() {
  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: "/api/competitor" }),
  });

  const [firm1, setFirm1] = useState("");
  const [firm2, setFirm2] = useState("");
  const [firm3, setFirm3] = useState("");
  const [context, setContext] = useState("");
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

  // Źródła z groundingu Google (części "source-url"), bez duplikatów.
  function sourcesOf(message: (typeof messages)[number]): Source[] {
    const seen = new Set<string>();
    const out: Source[] = [];
    for (const p of message.parts) {
      if (p.type === "source-url" && !seen.has(p.url)) {
        seen.add(p.url);
        out.push({ url: p.url, title: p.title || new URL(p.url).hostname });
      }
    }
    return out;
  }

  // Kroki agenta w kolejności wywołania (części "tool-<nazwa>").
  function stepsOf(message: (typeof messages)[number]): string[] {
    return message.parts
      .filter((p) => p.type.startsWith("tool-"))
      .map((p) => TOOL_LABEL[p.type.slice("tool-".length)] ?? "🔧 Narzędzie…");
  }

  const analysis = lastAssistant ? textOf(lastAssistant) : "";
  const sources = lastAssistant ? sourcesOf(lastAssistant) : [];
  const steps = lastAssistant ? stepsOf(lastAssistant) : [];

  function compare(firms: string[], ctx: string) {
    const clean = firms.map((f) => f.trim()).filter(Boolean);
    if (clean.length < 2 || isLoading) return;

    // Składamy jedno zadanie z nazw firm i (opcjonalnego) kontekstu.
    let text = `Porównaj te firmy: ${clean.join(", ")}.`;
    if (ctx.trim()) text += `\n\nKontekst użytkownika: ${ctx.trim()}`;

    // Każda analiza to osobne zadanie — nie ciągniemy historii rozmowy.
    setMessages([]);
    sendMessage({ text });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    compare([firm1, firm2, firm3], context);
  }

  function useExample(firms: string[]) {
    setFirm1(firms[0] ?? "");
    setFirm2(firms[1] ?? "");
    setFirm3(firms[2] ?? "");
    compare(firms, context);
  }

  async function copyAnalysis() {
    try {
      await navigator.clipboard.writeText(analysis);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Skopiuj analizę ręcznie:", analysis);
    }
  }

  const canCompare =
    [firm1, firm2, firm3].filter((f) => f.trim()).length >= 2;

  return (
    <div className="rp">
      <header className="rp-header">
        <h1>🏢 Analiza konkurencji</h1>
        <p className="rp-sub">Podaj firmy — agent porówna je za Ciebie</p>
      </header>

      <form className="rp-form cmp-form" onSubmit={handleSubmit}>
        <div className="cmp-firms">
          <input
            className="rp-input"
            value={firm1}
            onChange={(e) => setFirm1(e.target.value)}
            placeholder="Np. Shopify"
            disabled={isLoading}
            autoFocus
          />
          <input
            className="rp-input"
            value={firm2}
            onChange={(e) => setFirm2(e.target.value)}
            placeholder="Np. WooCommerce"
            disabled={isLoading}
          />
          <input
            className="rp-input"
            value={firm3}
            onChange={(e) => setFirm3(e.target.value)}
            placeholder="Np. PrestaShop"
            disabled={isLoading}
          />
        </div>

        <textarea
          className="rp-input cmp-context"
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Kontekst (opcjonalnie) — np. Szukam platformy e-commerce dla małego sklepu"
          rows={2}
          disabled={isLoading}
        />

        <button
          type="submit"
          className="rp-btn rp-btn-primary"
          disabled={isLoading || !canCompare}
        >
          {isLoading ? "⏳ Porównuję…" : "🔍 Porównaj"}
        </button>
      </form>

      <div className="rp-examples">
        {EXAMPLES.map((firms) => (
          <button
            key={firms.join("|")}
            type="button"
            className="rp-example"
            onClick={() => useExample(firms)}
            disabled={isLoading}
          >
            {firms.join(" vs ")}
          </button>
        ))}
      </div>

      {/* Postęp pracy agenta: kolejne narzędzia, z których korzystał. */}
      {(isLoading || steps.length > 0) && (
        <div className="rp-steps">
          {steps.map((s, i) => (
            <span key={i} className="rp-step">
              {s}
            </span>
          ))}
          {isLoading && (
            <span className="rp-step pending">
              {steps.length === 0 ? "🔍 Zbieram dane…" : "✍️ Piszę analizę…"}
            </span>
          )}
        </div>
      )}

      {analysis && (
        <>
          <div className="rp-actions">
            <button type="button" className="rp-btn" onClick={copyAnalysis}>
              {copied ? "✅ Skopiowano!" : "📋 Kopiuj analizę"}
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
              {analysis}
            </ReactMarkdown>

            {sources.length > 0 && (
              <div className="sources">
                <div className="sources-title">🔗 Źródła (Google)</div>
                <ol className="sources-list">
                  {sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noopener noreferrer">
                        {s.title}
                      </a>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </article>
        </>
      )}

      {!analysis && !isLoading && (
        <div className="rp-empty">
          Podaj 2–3 firmy (i opcjonalnie kontekst) albo kliknij przykład — agent
          sam poszuka informacji o każdej z nich, zestawi je w tabeli
          porównawczej i napisze rekomendację ze źródłami.
        </div>
      )}

      <div ref={endRef} />
    </div>
  );
}
