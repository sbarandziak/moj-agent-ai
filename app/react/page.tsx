"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MAX_STEPS } from "./constants";

// Złożone, wielokrokowe cele — kliknięcie od razu wysyła zadanie.
const EXAMPLES = [
  "Planuję weekend w Krakowie. Sprawdź pogodę, znajdź ciekawe miejsca w Wikipedii, i powiedz czy są jakieś święta w ten weekend.",
  "Mam 5000 EUR do wydania. Przelicz na PLN i sprawdź ile to w dolarach.",
  "Porównaj pogodę w Warszawie, Berlinie i Paryżu. Które z tych miast ma dziś najlepszą pogodę?",
  "Ile dni do najbliższego święta w Polsce? Jaka jest teraz pogoda w Warszawie?",
];

// Wybór modelu (Flash = szybki, Pro = zaawansowany) — trafia do /api/react.
type ModelKey = "flash" | "pro";

const MODELS: { id: ModelKey; label: string; emoji: string; hint: string }[] = [
  { id: "flash", label: "Flash", emoji: "⚡", hint: "szybki" },
  { id: "pro", label: "Pro", emoji: "🧠", hint: "zaawansowany" },
];

// Narzędzia dostępne dla agenta — odzwierciedlają reactTools w /api/react/tools.ts.
const TOOLS: { emoji: string; name: string }[] = [
  { emoji: "🧮", name: "Kalkulator" },
  { emoji: "🕐", name: "Data i czas" },
  { emoji: "🌤️", name: "Pogoda" },
  { emoji: "💱", name: "Kursy NBP" },
  { emoji: "🎉", name: "Święta" },
  { emoji: "📖", name: "Wikipedia" },
  { emoji: "📝", name: "Zapis notatek" },
  { emoji: "📂", name: "Odczyt notatek" },
  { emoji: "🌐", name: "Czytanie stron" },
  { emoji: "📚", name: "Baza wiedzy" },
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

// Typ sekcji ReAct rozpoznany po nagłówku markdown w odpowiedzi agenta.
type SectionKind = "think" | "observe" | "result" | "plain";

type Section = { kind: SectionKind; text: string };

// Dzieli odpowiedź agenta na kolorowe sekcje ReAct po nagłówkach markdown:
//   ### 🧠 Myślę... / ### 👁️ Obserwuję... / ### ✅ Wynik końcowy
// Tekst przed pierwszym nagłówkiem trafia do sekcji "plain".
function splitSections(body: string): Section[] {
  const lines = body.split("\n");
  const sections: Section[] = [];
  let current: Section = { kind: "plain", text: "" };

  const kindOf = (line: string): SectionKind | null => {
    if (!/^#{1,4}\s/.test(line)) return null;
    if (line.includes("🧠")) return "think";
    if (line.includes("👁")) return "observe";
    if (line.includes("✅")) return "result";
    return null;
  };

  for (const line of lines) {
    const kind = kindOf(line);
    if (kind) {
      if (current.text.trim()) sections.push(current);
      current = { kind, text: line + "\n" };
    } else {
      current.text += line + "\n";
    }
  }
  if (current.text.trim()) sections.push(current);
  return sections;
}

// W4 (cytowanie): wyłuskuje linie "📎 Źródło: X" / "📎 Źródła: X, Y" z odpowiedzi.
// Zwraca tekst BEZ tych linii (clean) oraz listę unikalnych tytułów dokumentów,
// żeby wyświetlić je jako osobne, klikalne „plakietki źródeł" pod odpowiedzią.
function extractSources(body: string): { clean: string; sources: string[] } {
  const sources: string[] = [];
  const kept: string[] = [];
  for (const line of body.split("\n")) {
    const m = line.match(/^\s*📎\s*Źród(?:ło|ła)\s*:\s*(.+?)\s*$/i);
    if (m) {
      m[1]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .forEach((s) => sources.push(s));
    } else {
      kept.push(line);
    }
  }
  return { clean: kept.join("\n"), sources: [...new Set(sources)] };
}

export default function ReactPage() {
  const { messages, sendMessage, status, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: "/api/react" }),
  });
  const [input, setInput] = useState("");
  const [model, setModel] = useState<ModelKey>("flash");
  const [contextOpen, setContextOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // --- Timer: mierzy czas od wysłania do zakończenia zadania ---------------
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  // Wstępnie wypełnij pole promptem z ?q=... (np. „Porównaj waluty" z dashboardu).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setInput(q);
  }, []);

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

  // Przybliżony licznik tokenów: liczba znaków / 4.
  const totalChars = messages.reduce((sum, m) => sum + textOf(m).length, 0);
  const tokenEstimate = Math.ceil(totalChars / 4);

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

  // Ostatnia wiadomość asystenta — na jej podstawie liczymy diagnostykę.
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
    isLoading || (startRef.current !== null)
      ? "⏳ W trakcie..."
      : steps >= MAX_STEPS
        ? "⚠️ Limit kroków"
        : messages.length === 0
          ? "Gotowy"
          : "✅ Zadanie ukończone";

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
        🔄 Agent ReAct — Autonomiczne rozumowanie
        <div className="subtitle">Opisz cel → agent sam planuje i realizuje</div>
      </header>

      <div className="messages">
        {messages.length === 0 && (
          <div className="empty">
            <p>Podaj agentowi CEL (nie pytanie) — sam zdecyduje jakich narzędzi użyć. 🔄</p>

            <div className="tools">
              <div className="tools-title">🧰 Moje narzędzia</div>
              <div className="tools-grid">
                {TOOLS.map((t) => (
                  <div key={t.name} className="tool-card">
                    <span className="tool-card-name">
                      {t.emoji} {t.name}
                    </span>
                    <span className="tool-active">aktywny</span>
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
          const rawBody = textOf(message);
          // W4: oddziel cytowania źródeł od treści odpowiedzi asystenta.
          const { clean: body, sources } =
            message.role === "assistant"
              ? extractSources(rawBody)
              : { clean: rawBody, sources: [] as string[] };
          const msgCalls = message.role === "assistant" ? toolCallsOf(message) : [];
          return (
            <div key={message.id} className={`row ${message.role}`}>
              <div className="bubble">
                {message.role === "assistant" ? (
                  <>
                    {/* Wskaźnik postępu tej wiadomości: "Krok X z Y". */}
                    {msgCalls.length > 0 && (
                      <div className="step-indicator">
                        🔄 Krok {msgCalls.length} z {MAX_STEPS}
                      </div>
                    )}

                    {/* Oś narzędzi (⚡): każde wywołanie + ew. czerwony alert błędu. */}
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

                    {/* Kolorowe sekcje ReAct: 🧠 Myślę / 👁️ Obserwuję / ✅ Wynik. */}
                    {splitSections(body).map((s, i) => (
                      <div key={i} className={`react-section ${s.kind}`}>
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
                            {s.text}
                          </ReactMarkdown>
                        </div>
                      </div>
                    ))}

                    {/* W4: źródła odpowiedzi — osobne, klikalne plakietki. */}
                    {sources.length > 0 && (
                      <div className="sources">
                        <span className="sources-label">
                          📎 {sources.length === 1 ? "Źródło" : "Źródła"}:
                        </span>
                        {sources.map((src) => (
                          <Link
                            key={src}
                            href={`/knowledge?doc=${encodeURIComponent(src)}`}
                            className="source-badge"
                            title={`Zobacz dokument „${src}" w bazie wiedzy`}
                          >
                            📄 {src}
                          </Link>
                        ))}
                      </div>
                    )}
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
            <div className="bubble thinking">🧠 Planuję kolejne kroki…</div>
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
          placeholder="Opisz co chcesz osiągnąć..."
          autoFocus
        />
        <button className="send" type="submit" disabled={isLoading || !input.trim()}>
          Wyślij
        </button>
      </form>

      <p className="form-hint">
        Wybierz scenariusz albo opisz cel, który agent ma zrealizować krok po
        kroku.
      </p>
    </div>
  );
}

// Skrócony podgląd argumentów narzędzia, np. {"city":"Warszawa"} → city: "Warszawa".
function argPreview(args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const entries = Object.entries(args as Record<string, unknown>);
  const s = entries.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ");
  return s.length > 60 ? s.slice(0, 60) + "…" : s;
}
