"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useRef, useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useImageAttachment } from "../lib/useImageAttachment";

// Klikalne pytania po wrzuceniu obrazu.
const QUESTIONS = [
  "Co widzisz na tym obrazie?",
  "Wyciągnij cały tekst z tego screena",
  "Opisz to w 3 zdaniach",
  "Jakie kolory dominują? Podaj kody HEX",
];
// Ostatnie pytanie ma osobną obsługę (generowanie nowego obrazu).
const GENERATE_LABEL = "Wygeneruj podobny obraz w innym stylu";

export default function VisionPage() {
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/vision" }),
  });
  const att = useImageAttachment({ globalPaste: true });
  const [input, setInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Stan funkcji "Wygeneruj podobny".
  const [genLoading, setGenLoading] = useState(false);
  const [genImage, setGenImage] = useState<string | null>(null);
  const [genOriginal, setGenOriginal] = useState<string | null>(null);
  const [genError, setGenError] = useState("");

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status, genImage, genLoading]);

  const isLoading = status === "submitted" || status === "streaming";

  function textOf(message: (typeof messages)[number]) {
    return message.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("");
  }

  // Obrazy dołączone przez użytkownika (części "file" z mediaType image/*).
  function imagesOf(message: (typeof messages)[number]): string[] {
    return message.parts
      .filter((p) => p.type === "file" && p.mediaType?.startsWith("image/"))
      .map((p) => (p as { url: string }).url);
  }

  // Wyślij pytanie o obraz. Obraz dołączamy jako część "file" (data URL).
  function send(text: string) {
    const t = text.trim();
    if (isLoading) return;
    if (!att.image && !t) return;

    const files = att.image
      ? [
          {
            type: "file" as const,
            mediaType: att.image.mediaType,
            url: att.image.dataUrl,
          },
        ]
      : undefined;

    sendMessage(
      files
        ? { text: t || "Co widzisz na tym obrazie?", files }
        : { text: t }
    );
    setInput("");
    // Obraz zostaje w podglądzie, by można było zadać kolejne pytania o ten sam.
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  // "Wygeneruj podobny obraz w innym stylu": opis → prompt → /api/generate-image.
  async function generateSimilar() {
    if (!att.image || genLoading) return;
    const original = att.image.dataUrl;
    setGenLoading(true);
    setGenError("");
    setGenImage(null);
    setGenOriginal(original);

    try {
      // Krok 1: model ogląda obraz i tworzy prompt w nowym stylu.
      const descRes = await fetch("/api/describe-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: original,
          instruction: input.trim() || "w innym, ciekawym stylu",
        }),
      });
      const descData = await descRes.json();
      if (!descRes.ok) throw new Error(descData?.error ?? "Nie udało się opisać obrazu.");

      // Krok 2: generujemy nowy obraz z tego promptu.
      const genRes = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: descData.prompt }),
      });
      const genData = await genRes.json();
      if (!genRes.ok) throw new Error(genData?.error ?? "Nie udało się wygenerować obrazu.");

      setGenImage(genData.image);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : "Nieznany błąd.");
    } finally {
      setGenLoading(false);
    }
  }

  const hasContent = messages.length > 0 || genLoading || genImage || genError;

  return (
    <div
      className="app"
      onDragOver={att.onDragOver}
      onDragLeave={att.onDragLeave}
      onDrop={att.onDrop}
    >
      <header className="header">
        👁️ Agent Vision
        <div className="subtitle">
          Wklej screenshot, wrzuć plik lub przeciągnij obraz
        </div>
      </header>

      {/* Overlay podczas przeciągania pliku. */}
      {att.dragging && <div className="drop-overlay">⬇️ Upuść obraz</div>}

      <div className="messages">
        {/* Duża strefa paste/drop przed pierwszym obrazem. */}
        {!att.image && !hasContent && (
          <div
            className="dropzone"
            onClick={() => fileRef.current?.click()}
            role="button"
            tabIndex={0}
          >
            <div className="dropzone-line">📸 Ctrl+V — wklej screenshot</div>
            <div className="dropzone-line">📁 Kliknij — wybierz plik</div>
            <div className="dropzone-line">🖱️ Przeciągnij — upuść obraz</div>
          </div>
        )}

        {/* Historia rozmowy. */}
        {messages.map((message) => {
          const imgs = imagesOf(message);
          const body = textOf(message);
          return (
            <div key={message.id} className={`row ${message.role}`}>
              <div className="bubble">
                {imgs.map((src) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt="załączony obraz" className="msg-image" />
                ))}
                {message.role === "assistant" ? (
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
                ) : (
                  body && <div className="msg-text">{body}</div>
                )}
              </div>
            </div>
          );
        })}

        {isLoading &&
          messages[messages.length - 1]?.role === "user" && (
            <div className="row assistant">
              <div className="bubble thinking">Analizuję obraz…</div>
            </div>
          )}

        {/* Wynik "Wygeneruj podobny" — oryginał obok nowej wersji. */}
        {(genLoading || genImage || genError) && (
          <div className="gen-compare">
            {genOriginal && (
              <figure className="gen-col">
                <figcaption>Oryginał</figcaption>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={genOriginal} alt="oryginał" className="img-generated" />
              </figure>
            )}
            <figure className="gen-col">
              <figcaption>Nowa wersja</figcaption>
              {genLoading && (
                <div className="img-skeleton" style={{ width: 260, height: 260 }} />
              )}
              {genImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={genImage} alt="nowa wersja" className="img-generated" />
              )}
              {genError && <div className="img-error">⚠️ {genError}</div>}
            </figure>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {/* Podgląd załączonego obrazu + pytania. */}
      {att.image && (
        <div className="attach-panel">
          <div className="attach-preview">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={att.image.dataUrl} alt="podgląd" className="attach-thumb" />
            <span className="attach-hint">📎 {att.image.name} — zadaj pytanie o ten obraz</span>
            <button type="button" className="attach-x" onClick={att.clear} title="Usuń">
              ✕
            </button>
          </div>
          <div className="modes format-commands">
            {QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                className="mode-btn"
                onClick={() => send(q)}
                disabled={isLoading}
              >
                {q}
              </button>
            ))}
            <button
              type="button"
              className="mode-btn"
              onClick={generateSimilar}
              disabled={genLoading}
            >
              🎨 {GENERATE_LABEL}
            </button>
          </div>
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
          title="Wybierz obraz"
        >
          📎
        </button>
        <input
          className="input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onPaste={att.onPaste}
          placeholder={
            att.image ? "Zadaj pytanie o obraz…" : "Wklej (Ctrl+V) lub wgraj obraz…"
          }
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
