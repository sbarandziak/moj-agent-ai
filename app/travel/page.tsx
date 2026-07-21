"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MAX_STEPS } from "./constants";

// Realne scenariusze podróży — kliknięcie od razu wysyła zadanie do agenta.
const EXAMPLES = [
  "Planuję weekend w Berlinie. Budżet: 2000 PLN",
  "Lecę do Paryża na tydzień w sierpniu",
  "Wycieczka do Pragi z rodziną na 3 dni",
  "Podróż służbowa do Londynu w przyszłym tygodniu",
  "Porównaj Barcelonę i Lizbonę na wakacje",
];

// Wybór modelu (Flash = szybki, Pro = zaawansowany) — trafia do /api/travel.
type ModelKey = "flash" | "pro";

const MODELS: { id: ModelKey; label: string; emoji: string; hint: string }[] = [
  { id: "flash", label: "Flash", emoji: "⚡", hint: "szybki" },
  { id: "pro", label: "Pro", emoji: "🧠", hint: "zaawansowany" },
];

// Źródła danych agenta podróży — odzwierciedlają narzędzia w /api/travel.
const TOOLS: { emoji: string; name: string; source: string }[] = [
  { emoji: "🌤️", name: "Pogoda", source: "Open-Meteo" },
  { emoji: "💱", name: "Waluty", source: "NBP" },
  { emoji: "🎉", name: "Święta", source: "Nager.Date" },
  { emoji: "🏛️", name: "Miasta", source: "Wikipedia" },
  { emoji: "💰", name: "Budżet", source: "kalkulator" },
  { emoji: "🎡", name: "Atrakcje", source: "Google" },
];

// Luźny typ części wiadomości — interesują nas tekst i wywołania narzędzi.
type Part = {
  type: string;
  text?: string;
  state?: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

type ToolCall = {
  name: string;
  args: unknown;
  error: string | null;
  done: boolean;
};

// Karta = jedna sekcja planu podróży (nagłówek ## / ### + treść pod nim).
type Card = { text: string };

// Dzieli gotowy plan podróży na karty po nagłówkach markdown (## lub ###).
// Tekst przed pierwszym nagłówkiem trafia do osobnej karty wstępnej.
function splitCards(body: string): Card[] {
  const lines = body.split("\n");
  const cards: Card[] = [];
  let current = "";

  for (const line of lines) {
    if (/^#{2,3}\s/.test(line)) {
      if (current.trim()) cards.push({ text: current });
      current = line + "\n";
    } else {
      current += line + "\n";
    }
  }
  if (current.trim()) cards.push({ text: current });
  return cards;
}

export default function TravelPage() {
  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: "/api/travel" }),
  });
  const [input, setInput] = useState("");
  const [model, setModel] = useState<ModelKey>("flash");
  const [contextOpen, setContextOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // --- Timer: mierzy czas od wysłania do zakończenia planowania (W3 §3) -----
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  useEffect(() => {
    if (isLoading) {
      if (startRef.current === null) startRef.current = Date.now();
      const id = setInterval(() => {
        if (startRef.current !== null) {
          setElapsed((Date.now() - startRef.current) / 1000);
        }
      }, 100);
      return () => clearInterval(id);
    }
    // Koniec zadania — zamroź ostateczny czas.
    if (startRef.current !== null) {
      setElapsed((Date.now() - startRef.current) / 1000);
      startRef.current = null;
    }
  }, [isLoading]);

  function textOf(message: (typeof messages)[number]) {
    return (message.parts as Part[])
      .filter((p) => p.type === "text")
      .map((p) => p.text ?? "")
      .join("");
  }

  // Wyciąga wywołania narzędzi z wiadomości (części typu "tool-<nazwa>").
  function toolCallsOf(message: (typeof messages)[number]): ToolCall[] {
    const out: ToolCall[] = [];
    for (const p of message.parts as Part[]) {
      if (!p.type.startsWith("tool-")) continue;
      const name = p.type.slice("tool-".length);
      const output = p.output as { error?: string } | undefined;
      const error =
        p.state === "output-error"
          ? p.errorText ?? "Błąd wykonania narzędzia"
          : output && typeof output === "object" && output.error
            ? output.error
            : null;
      out.push({
        name,
        args: p.input,
        error,
        done: p.state === "output-available" || p.state === "output-error",
      });
    }
    return out;
  }

  // Przybliżony licznik tokenów: liczba znaków / 4.
  const totalChars = messages.reduce((sum, m) => sum + textOf(m).length, 0);
  const tokenEstimate = Math.ceil(totalChars / 4);

  // --- Diagnostyka (W3 §3): ostatnia odpowiedź agenta jako podstawa metryk ---
  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
  const calls = lastAssistant ? toolCallsOf(lastAssistant) : [];
  const steps = calls.length;
  const errorCount = calls.filter((c) => c.error).length;

  // Zlicz wywołania każdego narzędzia: getWeather(2), calculator(1)...
  const toolCounts = calls.reduce<Record<string, number>>((acc, c) => {
    acc[c.name] = (acc[c.name] ?? 0) + 1;
    return acc;
  }, {});

  const ratio = Math.min(steps / MAX_STEPS, 1);
  const barColor = steps >= MAX_STEPS ? "red" : ratio > 0.75 ? "yellow" : "green";

  const status_ =
    isLoading || startRef.current !== null
      ? "⏳ W trakcie..."
      : steps >= MAX_STEPS
        ? "⚠️ Limit kroków"
        : messages.length === 0
          ? "Gotowy"
          : "✅ Zadanie ukończone";

  function newConversation() {
    setMessages([]);
    setInput("");
    startRef.current = null;
    setElapsed(0);
  }

  async function exportConversation() {
    const text = messages
      .map((m) => `${m.role === "user" ? "User" : "Agent"}: ${textOf(m)}`)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      window.prompt("Skopiuj rozmowę ręcznie:", text);
    }
  }

  function send(text: string) {
    const t = text.trim();
    if (isLoading || !t) return;
    startRef.current = null;
    setElapsed(0);
    sendMessage({ text: t }, { body: { model } });
    setInput("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <div className="app">
      <header className="header">
        ✈️ Asystent podróży AI
        <div className="subtitle">
          Powiedz dokąd jedziesz — agent zaplanuje wszystko
        </div>
      </header>

      <div className="messages">
        {messages.length === 0 && (
          <div className="empty">
            <p>
              Opisz swoją podróż — agent sam sprawdzi pogodę, kurs waluty, święta
              i atrakcje, a potem złoży gotowy plan. ✈️
            </p>

            <div className="tools">
              <div className="tools-title">🧰 Moje narzędzia</div>
              <div className="tools-grid">
                {TOOLS.map((t) => (
                  <div key={t.name} className="tool-card">
                    <span className="tool-card-name">
                      {t.emoji} {t.name}
                    </span>
                    <span className="tool-source">{t.source}</span>
                  </div>
                ))}
              </div>
            </div>

            <p className="empty-hint">Kliknij scenariusz albo opisz własny:</p>
            <div className="examples">
              {EXAMPLES.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="example-btn"
                  onClick={() => send(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => {
          const body = textOf(message);
          const msgCalls = message.role === "assistant" ? toolCallsOf(message) : [];
          return (
            <div key={message.id} className={`row ${message.role}`}>
              <div className="bubble">
                {message.role === "assistant" ? (
                  <>
                    {/* Pasek postępu zbierania danych: "Krok X z Y". */}
                    {msgCalls.length > 0 && (
                      <div className="step-indicator">
                        ✈️ Zebrano dane: {msgCalls.length} z {MAX_STEPS}
                      </div>
                    )}

                    {/* Oś narzędzi: każde źródło danych + ew. alert błędu. */}
                    {msgCalls.map((c, i) => (
                      <div
                        key={i}
                        className={`tool-chip ${c.error ? "error" : c.done ? "ok" : "pending"}`}
                      >
                        <span className="tool-name">
                          {c.error ? "🔴" : c.done ? "🔧" : "⏳"} {c.name}
                          <code>({argPreview(c.args)})</code>
                        </span>
                        {c.error && <span className="tool-err">{c.error}</span>}
                      </div>
                    ))}

                    {/* Plan podróży w kartach — każda sekcja osobno. */}
                    {splitCards(body).map((card, i) => (
                      <div key={i} className="travel-card">
                        <div className="msg-text markdown">
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
                            {card.text}
                          </ReactMarkdown>
                        </div>
                      </div>
                    ))}
                  </>
                ) : (
                  <div className="msg-text">{body}</div>
                )}
              </div>
            </div>
          );
        })}

        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="row assistant">
            <div className="bubble thinking">✈️ Planuję Twoją podróż…</div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* --- Panel diagnostyki (W3 §3) --- */}
      {messages.length > 0 && (
        <div className="diag">
          <div className="diag-title">🛡️ Diagnostyka</div>

          <div className="diag-steps">
            <span className="diag-label">Kroki</span>
            <div className="diag-bar">
              <div
                className={`diag-bar-fill ${barColor}`}
                style={{ width: `${ratio * 100}%` }}
              />
            </div>
            <span className="diag-count">
              {steps}/{MAX_STEPS}
            </span>
          </div>

          <div className="diag-row">
            <span className="diag-label">Narzędzia</span>
            <span className="diag-value">
              {steps === 0
                ? "—"
                : Object.entries(toolCounts)
                    .map(([name, n]) => `${name}(${n})`)
                    .join(", ")}
            </span>
          </div>

          <div className="diag-row">
            <span className="diag-label">Błędy</span>
            <span className={`diag-value ${errorCount > 0 ? "bad" : "good"}`}>
              {errorCount}
            </span>
          </div>

          <div className="diag-row">
            <span className="diag-label">Czas</span>
            <span className="diag-value">{elapsed.toFixed(1)}s</span>
          </div>

          <div className={`diag-status ${barColor}`}>{status_}</div>
        </div>
      )}

      {/* Panel pamięci / kontekstu rozmowy */}
      <div className="context">
        <button
          type="button"
          className="context-toggle"
          onClick={() => setContextOpen((o) => !o)}
        >
          🧠 Kontekst rozmowy <span className="chev">{contextOpen ? "▲" : "▼"}</span>
        </button>
        {contextOpen && (
          <div className="context-body">
            <span className="counter">
              Wiadomości: <b>{messages.length}</b> &nbsp;|&nbsp; ~Tokeny:{" "}
              <b>{tokenEstimate}</b>
            </span>
            <div className="context-actions">
              <button
                type="button"
                className="ctx-btn"
                onClick={newConversation}
                disabled={messages.length === 0}
              >
                🗑 Nowa rozmowa
              </button>
              <button
                type="button"
                className="ctx-btn"
                onClick={exportConversation}
                disabled={messages.length === 0}
              >
                {copied ? "✅ Skopiowano!" : "📋 Eksportuj rozmowę"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Wybór modelu AI (Flash / Pro) */}
      <div className="model-row">
        <span className="model-row-label">Model AI</span>
        <div className="modes">
          {MODELS.map((mo) => (
            <button
              key={mo.id}
              type="button"
              className={`mode-btn model-${mo.id} ${model === mo.id ? "active" : ""}`}
              onClick={() => setModel(mo.id)}
              title={mo.hint}
            >
              {mo.emoji} {mo.label} <span className="model-hint">({mo.hint})</span>
            </button>
          ))}
        </div>
      </div>

      <form className="form" onSubmit={handleSubmit}>
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Np. Lecę do Barcelony na weekend..."
          autoFocus
        />
        <button className="send" type="submit" disabled={isLoading || !input.trim()}>
          Zaplanuj
        </button>
      </form>

      <p className="form-hint">
        Wybierz scenariusz albo opisz podróż, a agent zbierze pogodę, waluty,
        święta i atrakcje.
      </p>
    </div>
  );
}

// Skrócony podgląd argumentów narzędzia, np. {"city":"Berlin"} → city: "Berlin".
function argPreview(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const entries = Object.entries(args as Record<string, unknown>);
  const s = entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ");
  return s.length > 60 ? s.slice(0, 60) + "…" : s;
}
