"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect } from "react";

export default function ThinkPage() {
  // Ten sam hook co na stronie głównej, ale kieruje do /api/think.
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/think" }),
  });
  const [input, setInput] = useState("");
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

  return (
    <div className="app">
      <header className="header">
        🧠 Tryb głębokiego myślenia
        <div className="subtitle">
          Agent pokazuje tok rozumowania krok po kroku
        </div>
      </header>

      <div className="messages">
        {messages.length === 0 && (
          <div className="empty">
            Zadaj trudne pytanie — np. z obliczeniami albo porównaniem opcji.
            <br />
            Zobaczysz pełny tok rozumowania przed odpowiedzią.
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

      <form className="form" onSubmit={handleSubmit}>
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Zadaj trudne pytanie..."
          autoFocus
        />
        <button className="send" type="submit" disabled={isLoading || !input.trim()}>
          Wyślij
        </button>
      </form>
    </div>
  );
}
