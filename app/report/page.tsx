"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useUser } from "../useUser";
import {
  saveReport,
  loadReports,
  deleteReport,
  type DbReport,
} from "@/lib/supabase";

// Klikalne tematy — kliknięcie od razu zleca agentowi raport.
const EXAMPLES = [
  "Rynek AI w Polsce — trendy, firmy, prognozy na 2026",
  "Porównanie platform e-commerce: Shopify vs WooCommerce vs PrestaShop",
  "Wpływ pracy zdalnej na produktywność — badania i statystyki",
  "Rynek nieruchomości w Krakowie — ceny, trendy, prognozy",
];

type Source = { url: string; title: string };

// Etykiety kroków agenta — pokazujemy, co właśnie robi (a nie pusty spinner).
const TOOL_LABEL: Record<string, string> = {
  google_search: "🔎 Szukam w Google…",
  readWebPage: "📄 Czytam stronę…",
  searchWikipedia: "📖 Sprawdzam Wikipedię…",
  calculator: "🧮 Liczę…",
};

export default function ReportPage() {
  const user = useUser();
  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: "/api/report" }),
  });

  const [input, setInput] = useState("");
  const [topic, setTopic] = useState(""); // temat ostatniego zlecenia (do zapisu)
  const [copied, setCopied] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<DbReport[]>([]);
  const [openSaved, setOpenSaved] = useState<DbReport | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const isLoading = status === "submitted" || status === "streaming";

  // Lista zapisanych raportów (pusta, gdy nie puszczono supabase/reports.sql).
  useEffect(() => {
    loadReports(user.id).then(setSaved);
  }, [user.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");

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

  const report = lastAssistant ? textOf(lastAssistant) : "";
  const sources = lastAssistant ? sourcesOf(lastAssistant) : [];
  const steps = lastAssistant ? stepsOf(lastAssistant) : [];

  function send(text: string) {
    const t = text.trim();
    if (!t || isLoading) return;
    // Każdy raport to osobne zadanie — nie ciągniemy historii rozmowy.
    setMessages([]);
    setTopic(t);
    setSaveMsg(null);
    setOpenSaved(null);
    sendMessage({ text: t });
    setInput("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Skopiuj raport ręcznie:", report);
    }
  }

  async function handleSave() {
    if (!report || saving) return;
    setSaving(true);
    const id = await saveReport(user.id, topic || "Raport", report);
    setSaving(false);
    if (id) {
      setSaveMsg("✅ Zapisano w bazie");
      setSaved(await loadReports(user.id));
    } else {
      setSaveMsg(
        "⚠️ Nie udało się zapisać — czy tabela `reports` istnieje? (supabase/reports.sql)"
      );
    }
    setTimeout(() => setSaveMsg(null), 4000);
  }

  async function handleDelete(id: string) {
    if (await deleteReport(id, user.id)) {
      setSaved((prev) => prev.filter((r) => r.id !== id));
      if (openSaved?.id === id) setOpenSaved(null);
    }
  }

  return (
    <div className="rp">
      <header className="rp-header">
        <h1>📊 Generator raportów</h1>
        <p className="rp-sub">Opisz temat — agent napisze raport biznesowy</p>
      </header>

      <form className="rp-form" onSubmit={handleSubmit}>
        <input
          className="rp-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Np. Rynek AI w Polsce w 2026 roku..."
          disabled={isLoading}
          autoFocus
        />
        <button
          type="submit"
          className="rp-btn rp-btn-primary"
          disabled={isLoading || !input.trim()}
        >
          {isLoading ? "⏳ Piszę…" : "📊 Generuj raport"}
        </button>
      </form>

      <div className="rp-examples">
        {EXAMPLES.map((q) => (
          <button
            key={q}
            type="button"
            className="rp-example"
            onClick={() => send(q)}
            disabled={isLoading}
          >
            {q}
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
              {steps.length === 0 ? "🔍 Zbieram dane…" : "✍️ Piszę raport…"}
            </span>
          )}
        </div>
      )}

      {report && (
        <>
          <div className="rp-actions">
            <button type="button" className="rp-btn" onClick={copyReport}>
              {copied ? "✅ Skopiowano!" : "📋 Kopiuj do schowka"}
            </button>
            <button
              type="button"
              className="rp-btn"
              onClick={handleSave}
              disabled={saving || isLoading}
            >
              {saving ? "💾 Zapisuję…" : "💾 Zapisz w bazie"}
            </button>
            {saveMsg && <span className="rp-save-msg">{saveMsg}</span>}
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
              {report}
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

      {!report && !isLoading && (
        <div className="rp-empty">
          Podaj temat albo kliknij jeden z przykładów — agent sam poszuka danych
          (Wikipedia, strony WWW), przeanalizuje je i napisze raport ze
          streszczeniem, faktami, analizą, wnioskami i źródłami.
        </div>
      )}

      {/* Zapisane raporty (tabela `reports` w Supabase). */}
      {saved.length > 0 && (
        <section className="rp-saved">
          <h2 className="rp-saved-title">💾 Zapisane raporty ({saved.length})</h2>
          <ul className="rp-saved-list">
            {saved.map((r) => (
              <li key={r.id} className="rp-saved-item">
                <button
                  type="button"
                  className="rp-saved-open"
                  onClick={() =>
                    setOpenSaved((cur) => (cur?.id === r.id ? null : r))
                  }
                >
                  <span className="rp-saved-topic">{r.topic}</span>
                  <span className="rp-saved-date">
                    {new Date(r.created_at).toLocaleString("pl-PL")}
                  </span>
                </button>
                <button
                  type="button"
                  className="rp-saved-del"
                  onClick={() => handleDelete(r.id)}
                  title="Usuń raport"
                >
                  🗑
                </button>
              </li>
            ))}
          </ul>

          {openSaved && (
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
                {openSaved.content}
              </ReactMarkdown>
            </article>
          )}
        </section>
      )}

      <div ref={endRef} />
    </div>
  );
}
