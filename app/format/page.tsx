"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

// Gotowe komendy do szybkiego testu — kliknięcie wpisuje je do inputa.
const COMMANDS = [
  "/tabela języki programowania 2026",
  "/porownanie ChatGPT vs Claude",
  "/lista 5 kroków do pierwszego agenta AI",
  "/faq sztuczna inteligencja dla początkujących",
  "/email podziękowanie za udaną rekrutację",
];

export default function FormatPage() {
  // Ten sam hook co pozostałe strony, kieruje do /api/format.
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/format" }),
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

  // Kliknięcie komendy — wpisuje ją do inputa (użytkownik może edytować).
  function pickCommand(cmd: string) {
    setInput(cmd);
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
        📐 Formatowanie
        <div className="subtitle">
          Agent odpowiada w tabeli, liście, porównaniu — na żądanie
        </div>
      </header>

      <div className="messages">
        {messages.length === 0 && (
          <div className="empty">
            Wybierz komendę poniżej albo wpisz własną (np. <code>/tabela …</code>).
            <br />
            Odpowiedzi renderują się jako prawdziwe tabele, listy i pogrubienia.
          </div>
        )}

        {messages.map((message) => (
          <div key={message.id} className={`row ${message.role}`}>
            <div className="bubble">
              {message.role === "assistant" ? (
                <div className="msg-text markdown">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      // Tabela w kontenerze ze scrollem — nie łamie layoutu.
                      table: ({ children }) => (
                        <div className="md-table-wrap">
                          <table>{children}</table>
                        </div>
                      ),
                    }}
                  >
                    {textOf(message)}
                  </ReactMarkdown>
                </div>
              ) : (
                <div className="msg-text">{textOf(message)}</div>
              )}
            </div>
          </div>
        ))}

        {isLoading &&
          messages[messages.length - 1]?.role === "user" && (
            <div className="row assistant">
              <div className="bubble thinking">Formatuję…</div>
            </div>
          )}

        <div ref={endRef} />
      </div>

      {/* Klikalne komendy formatu. */}
      <div className="modes format-commands">
        {COMMANDS.map((cmd) => (
          <button
            key={cmd}
            type="button"
            className="mode-btn"
            onClick={() => pickCommand(cmd)}
          >
            {cmd}
          </button>
        ))}
      </div>

      <form className="form" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Wpisz komendę, np. /porownanie React vs Vue"
          autoFocus
        />
        <button className="send" type="submit" disabled={isLoading || !input.trim()}>
          Wyślij
        </button>
      </form>
    </div>
  );
}
