"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect } from "react";

// Przykładowe sytuacje — kliknięcie wpisuje je do inputa.
const EXAMPLES = [
  "Klient wściekły, że mieszkanie które oglądał sprzedaliśmy komuś innemu",
  "Follow-up dzień po oglądaniu kawalerki na Woli",
  "Przypomnienie o brakującym zaświadczeniu o zarobkach do kredytu",
  "Odmowa negocjacji ceny — kupujący chce 15% mniej",
  "Podziękowanie po finalizacji zakupu i prośba o opinię",
];

export default function EmailPage() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/email" }),
  });
  const [input, setInput] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const isLoading = status === "submitted" || status === "streaming";

  function textOf(message: (typeof messages)[number]) {
    return message.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    sendMessage({ text });
    setInput("");
  }

  async function copyEmail(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1800);
    } catch {
      window.prompt("Skopiuj e-mail ręcznie:", text);
    }
  }

  return (
    <div className="app">
      <header className="header">
        ✉️ Komenda /email
        <div className="subtitle">
          Opisz sytuację — dostajesz gotowy, profesjonalny e-mail w stałym formacie
        </div>
      </header>

      <div className="messages">
        {messages.length === 0 && (
          <div className="empty">
            <p>Napisz krótko, o co chodzi — Marta ułoży cały e-mail. ✍️</p>
            <p className="empty-hint">Kliknij przykładową sytuację albo opisz własną:</p>
            <div className="examples">
              {EXAMPLES.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="example-btn"
                  onClick={() => setInput(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((message) => {
          const body = textOf(message);
          return (
            <div key={message.id} className={`row ${message.role}`}>
              <div className="bubble">
                {message.role === "assistant" && (
                  <div className="email-head">
                    <span className="badge badge-email">✉️ E-mail</span>
                    <button
                      type="button"
                      className="copy-mini"
                      onClick={() => copyEmail(message.id, body)}
                    >
                      {copiedId === message.id ? "✅ Skopiowano" : "📋 Kopiuj"}
                    </button>
                  </div>
                )}
                <div className="msg-text">{body}</div>
              </div>
            </div>
          );
        })}

        {isLoading &&
          messages[messages.length - 1]?.role === "user" && (
            <div className="row assistant">
              <div className="bubble thinking">Piszę e-mail…</div>
            </div>
          )}

        <div ref={endRef} />
      </div>

      <form className="form" onSubmit={handleSubmit}>
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Opisz sytuację lub temat e-maila..."
          autoFocus
        />
        <button className="send" type="submit" disabled={isLoading || !input.trim()}>
          Generuj
        </button>
      </form>
    </div>
  );
}
