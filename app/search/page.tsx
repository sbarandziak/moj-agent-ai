"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useImageAttachment } from "../lib/useImageAttachment";

// Pytania startowe — kliknięcie od razu wysyła zapytanie.
const EXAMPLES = [
  "Jakie są najnowsze wiadomości o sztucznej inteligencji?",
  "Ile kosztuje iPhone 16 Pro w Polsce?",
  "Kto wygrał ostatni mecz reprezentacji Polski?",
  "Jakie filmy są teraz w kinach?",
];

type Source = { url: string; title: string };

export default function SearchPage() {
  // Ten sam hook co pozostałe strony, kieruje do /api/search (z groundingiem).
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/search" }),
  });
  const [input, setInput] = useState("");
  const att = useImageAttachment({ globalPaste: true });
  const fileRef = useRef<HTMLInputElement>(null);
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

  // Zbierz źródła (grounding Google) z części "source-url"; usuń duplikaty URL.
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

  // Czy agent właśnie korzysta z narzędzia (szuka w Google / czyta stronę)?
  function toolStatusOf(message: (typeof messages)[number]): string | null {
    for (const p of message.parts) {
      const t = p.type;
      if (t === "tool-readWebPage" || t === "dynamic-tool") return "📄 Czytam stronę…";
      if (t === "tool-google_search" || t === "source-url") return "🔎 Szukam w Google…";
    }
    return null;
  }

  // Obrazy załączone przez użytkownika (części "file" z mediaType image/*).
  function imagesOf(message: (typeof messages)[number]): string[] {
    return message.parts
      .filter((p) => p.type === "file" && p.mediaType?.startsWith("image/"))
      .map((p) => (p as { url: string }).url);
  }

  function send(text: string) {
    const t = text.trim();
    if (isLoading) return;
    if (!t && !att.image) return;

    const files = att.image
      ? [{ type: "file" as const, mediaType: att.image.mediaType, url: att.image.dataUrl }]
      : undefined;

    sendMessage(files ? { text: t || "Co widzisz na tym obrazie?", files } : { text: t });
    setInput("");
    att.clear();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  return (
    <div
      className="app"
      onDragOver={att.onDragOver}
      onDragLeave={att.onDragLeave}
      onDrop={att.onDrop}
    >
      {att.dragging && <div className="drop-overlay">⬇️ Upuść obraz</div>}
      <header className="header">
        🌐 Agent z wyszukiwarką
        <div className="subtitle">
          Przeszukuję prawdziwy internet i czytam strony
        </div>
      </header>

      <div className="messages">
        {messages.length === 0 && (
          <div className="empty">
            <p>Zapytaj o cokolwiek aktualnego — sprawdzę to w prawdziwym Google. 🌐</p>
            <p className="empty-hint">Kliknij przykład albo wpisz własne pytanie:</p>
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
          const sources = message.role === "assistant" ? sourcesOf(message) : [];
          const body = textOf(message);
          return (
            <div key={message.id} className={`row ${message.role}`}>
              <div className="bubble">
                {imagesOf(message).map((src) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt="załączony obraz" className="msg-image" />
                ))}
                {message.role === "assistant" ? (
                  <>
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
                        {body}
                      </ReactMarkdown>
                    </div>

                    {sources.length > 0 && (
                      <div className="sources">
                        <div className="sources-title">🔗 Źródła</div>
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
                  </>
                ) : (
                  <div className="msg-text">{body}</div>
                )}
              </div>
            </div>
          );
        })}

        {isLoading &&
          messages[messages.length - 1]?.role === "user" && (
            <div className="row assistant">
              <div className="bubble thinking">Szukam w internecie…</div>
            </div>
          )}

        {/* Podpowiedź, gdy agent już streamuje i właśnie używa narzędzia. */}
        {isLoading &&
          messages[messages.length - 1]?.role === "assistant" &&
          toolStatusOf(messages[messages.length - 1]) && (
            <div className="row assistant">
              <div className="bubble thinking">
                {toolStatusOf(messages[messages.length - 1])}
              </div>
            </div>
          )}

        <div ref={endRef} />
      </div>

      {att.image && (
        <div className="attach-preview">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={att.image.dataUrl} alt="podgląd" className="attach-thumb" />
          <span className="attach-hint">📎 Screenshot — zadaj pytanie o ten obraz</span>
          <button type="button" className="attach-x" onClick={att.clear} title="Usuń">
            ✕
          </button>
        </div>
      )}
      {att.error && <div className="attach-error">⚠️ {att.error}</div>}

      <form className="form" onSubmit={handleSubmit}>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={att.onFileInput}
        />
        <button
          type="button"
          className="upload-btn"
          onClick={() => fileRef.current?.click()}
          title="Załącz obraz"
        >
          📎
        </button>
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPaste={att.onPaste}
          placeholder="Zapytaj o cokolwiek aktualnego..."
          autoFocus
        />
        <button
          className="send"
          type="submit"
          disabled={isLoading || (!input.trim() && !att.image)}
        >
          Wyślij
        </button>
      </form>
    </div>
  );
}
