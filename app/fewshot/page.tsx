"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect } from "react";

// Pojęcia do szybkiego testu — kliknięcie wpisuje tekst do inputa.
const TERMS = [
  "Sztuczna inteligencja",
  "Agent AI",
  "Prompt",
  "Halucynacja AI",
  "RAG",
  "API",
];

export default function FewshotPage() {
  // Ten sam hook co pozostałe strony, kieruje do /api/fewshot.
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/fewshot" }),
  });
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
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

  // Kliknięcie pojęcia — wpisuje je do inputa (nie wysyła od razu).
  function pickTerm(term: string) {
    setInput(`Czym jest ${term.toLowerCase()}?`);
    inputRef.current?.focus();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <div className="app">
      <header className="header">
        📚 Słownik AI
        <div className="subtitle">
          Wyjaśniam trudne pojęcia prostym językiem
        </div>
      </header>

      <div className="messages">
        {messages.length === 0 && (
          <div className="empty">
            Wpisz pojęcie albo kliknij jedno z poniżej — wyjaśnię je
            <br />
            prostym językiem, z analogią i praktycznym przykładem.
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`row ${message.role}`}>
            <div className="bubble">
              <div className="msg-text">{textOf(message)}</div>
            </div>
          </div>
        ))}

        {isLoading &&
          messages[messages.length - 1]?.role === "user" && (
            <div className="row assistant">
              <div className="bubble thinking">Myślę…</div>
            </div>
          )}

        <div ref={endRef} />
      </div>

      {/* Klikalne pojęcia do szybkiego testu few-shot. */}
      <div className="modes">
        {TERMS.map((term) => (
          <button
            key={term}
            type="button"
            className="mode-btn"
            onClick={() => pickTerm(term)}
          >
            {term}
          </button>
        ))}
      </div>

      <form className="form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Wpisz pojęcie do wyjaśnienia..."
          autoFocus
        />
        <button className="send" type="submit" disabled={isLoading || !input.trim()}>
          Wyślij
        </button>
      </form>
    </div>
  );
}
