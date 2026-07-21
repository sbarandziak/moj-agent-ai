"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useRef, useEffect } from "react";
import { useImageAttachment } from "../lib/useImageAttachment";
import { useUser } from "../useUser";
import {
  createConversation,
  saveMessage,
  loadLatestConversation,
  loadConversation,
  loadMessages,
  makeTitle,
  getOrCreateProfile,
  loadProfile,
  type ChatRole,
} from "@/lib/supabase";

type ModelKey = "flash" | "pro";

const MODELS: { id: ModelKey; label: string; emoji: string; hint: string }[] = [
  { id: "flash", label: "Flash", emoji: "⚡", hint: "szybki" },
  { id: "pro", label: "Pro", emoji: "🧠", hint: "zaawansowany" },
];

// Przykładowe pytania startowe z dziedziny agenta.
const EXAMPLES = [
  "Ile wynosi PCC przy zakupie mieszkania z rynku wtórnego?",
  "Jaki wkład własny potrzebuję do kredytu hipotecznego?",
  "Na co zwrócić uwagę w księdze wieczystej?",
  "Rynek pierwotny czy wtórny — co bardziej się opłaca?",
];

export default function ChatPage() {
  const user = useUser(); // tożsamość z Supabase Auth (W3)
  const { messages, sendMessage, status, setMessages, error, regenerate, clearError } =
    useChat();
  const [input, setInput] = useState("");
  const [model, setModel] = useState<ModelKey>("flash");
  const [contextOpen, setContextOpen] = useState(true);
  const [copied, setCopied] = useState(false);
  const att = useImageAttachment({ globalPaste: true });
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Trwała pamięć (Supabase).
  const conversationIdRef = useRef<string | null>(null); // aktualna rozmowa
  const savedIdsRef = useRef<Set<string>>(new Set()); // id już zapisanych wiadomości
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Personalizacja (W3): profil użytkownika (tożsamość = auth.uid()).
  const userIdRef = useRef<string | null>(user.id); // ID z Supabase Auth
  const [userName, setUserName] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Record<string, string>>({});

  // Auto-scroll do ostatniej wiadomości.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const isLoading = status === "submitted" || status === "streaming";

  // Przy starcie: wczytaj profil zalogowanego użytkownika (auth.uid()).
  useEffect(() => {
    (async () => {
      userIdRef.current = user.id;
      const profile = await getOrCreateProfile(user.id);
      if (profile) {
        setUserName(profile.name);
        setPreferences(profile.preferences ?? {});
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  // Po każdej zakończonej turze odśwież profil — agent mógł właśnie zapisać
  // imię lub preferencję narzędziem. Dzięki temu system prompt kolejnej
  // wiadomości już zna te dane (bez czekania na przeładowanie strony).
  useEffect(() => {
    if (isLoading || loadingHistory) return;
    const id = userIdRef.current;
    if (!id) return;
    (async () => {
      const profile = await loadProfile(id);
      if (profile) {
        setUserName(profile.name);
        setPreferences(profile.preferences ?? {});
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);

  // Przy starcie: wczytaj rozmowę z bazy i pokaż ją.
  // ?id=... (z /history "Kontynuuj rozmowę") ma pierwszeństwo; inaczej ostatnia.
  useEffect(() => {
    (async () => {
      const wantedId = new URLSearchParams(window.location.search).get("id");
      const conv = wantedId
        ? await loadConversation(wantedId, user.id)
        : await loadLatestConversation(user.id);
      if (conv) {
        conversationIdRef.current = conv.id;
        const rows = await loadMessages(conv.id);
        const restored = rows.map((m) => ({
          id: m.id,
          role: m.role,
          parts: [{ type: "text" as const, text: m.content }],
        }));
        restored.forEach((m) => savedIdsRef.current.add(m.id));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setMessages(restored as any);
      }
      setLoadingHistory(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Zapis w tle: gdy wiadomość jest kompletna (nie w trakcie streamu),
  // dopisz ją do bazy. Pierwsza wiadomość tworzy rekord rozmowy.
  useEffect(() => {
    if (loadingHistory || isLoading) return;
    (async () => {
      for (const m of messages) {
        if (savedIdsRef.current.has(m.id)) continue;
        if (m.role !== "user" && m.role !== "assistant") continue;
        const text = textOf(m);
        if (!text.trim()) continue;

        // Pierwsza wiadomość w nowej rozmowie -> stwórz rekord conversations
        // przypisany do zalogowanego użytkownika.
        if (!conversationIdRef.current) {
          const id = await createConversation(makeTitle(text), user.id);
          if (!id) return; // brak połączenia z bazą — spróbujemy przy kolejnej zmianie
          conversationIdRef.current = id;
        }

        savedIdsRef.current.add(m.id); // oznacz od razu, by nie zapisać podwójnie
        await saveMessage(conversationIdRef.current, m.role as ChatRole, text);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, isLoading, loadingHistory]);

  function textOf(message: (typeof messages)[number]) {
    return message.parts
      .filter((p) => p.type === "text")
      .map((p) => p.text)
      .join("");
  }

  // Obrazy załączone przez użytkownika (części "file" z mediaType image/*).
  function imagesOf(message: (typeof messages)[number]): string[] {
    return message.parts
      .filter((p) => p.type === "file" && p.mediaType?.startsWith("image/"))
      .map((p) => (p as { url: string }).url);
  }

  // Model, którym wygenerowano daną odpowiedź (z metadanych).
  function modelOf(message: (typeof messages)[number]): ModelKey {
    return (message.metadata as { model?: ModelKey })?.model ?? "flash";
  }

  // Przybliżony licznik tokenów: liczba znaków / 4.
  const totalChars = messages.reduce((sum, m) => sum + textOf(m).length, 0);
  const tokenEstimate = Math.ceil(totalChars / 4);

  // Wysyła dowolny tekst z aktywnym modelem (opcjonalnie z załączonym obrazem).
  function send(text: string) {
    const t = text.trim();
    if (isLoading) return;
    if (!t && !att.image) return;

    const files = att.image
      ? [{ type: "file" as const, mediaType: att.image.mediaType, url: att.image.dataUrl }]
      : undefined;

    sendMessage(
      files ? { text: t || "Co widzisz na tym obrazie?", files } : { text: t },
      { body: { model, userId: userIdRef.current, userName, preferences } }
    );
    setInput("");
    att.clear();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  function newConversation() {
    setMessages([]);
    setInput("");
    // Nowa sesja: zapomnij aktualną rozmowę. Nowy rekord w bazie
    // powstanie automatycznie przy pierwszej wiadomości (patrz efekt zapisu).
    conversationIdRef.current = null;
    savedIdsRef.current = new Set();
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

  return (
    <div
      className="app"
      onDragOver={att.onDragOver}
      onDragLeave={att.onDragLeave}
      onDrop={att.onDrop}
    >
      {att.dragging && <div className="drop-overlay">⬇️ Upuść obraz</div>}
      <header className="header">
        💬 Marta Wiśniewska
        <div className="subtitle">
          Ekspert od nieruchomości i kredytów hipotecznych. Zapytaj mnie o zakup,
          sprzedaż, wynajem albo finansowanie.
        </div>
      </header>

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
              {userName && (
                <>
                  👤 <b>{userName}</b> &nbsp;|&nbsp;{" "}
                </>
              )}
              Wiadomości: <b>{messages.length}</b> &nbsp;|&nbsp; ~Tokeny:{" "}
              <b>{tokenEstimate}</b>
              {Object.keys(preferences).length > 0 && (
                <>
                  {" "}
                  &nbsp;|&nbsp; ⭐ Preferencje: <b>{Object.keys(preferences).length}</b>
                </>
              )}
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

      <div className="messages">
        {loadingHistory && (
          <div className="row assistant">
            <div className="bubble thinking">⏳ Wczytuję poprzednią rozmowę…</div>
          </div>
        )}

        {!loadingHistory && messages.length === 0 && (
          <div className="empty">
            <p>Cześć! Jestem Martą, Twoim doradcą nieruchomości. 🏠</p>
            <p className="empty-hint">Kliknij przykładowe pytanie albo napisz własne:</p>
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
          const md = modelOf(message);
          const info = MODELS.find((x) => x.id === md)!;
          return (
            <div key={message.id} className={`row ${message.role}`}>
              <div className="bubble">
                {message.role === "assistant" && (
                  <span className={`badge badge-${md}`}>
                    {info.emoji} {info.label}
                  </span>
                )}
                {imagesOf(message).map((src) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt="załączony obraz" className="msg-image" />
                ))}
                {textOf(message) && (
                  <div className="msg-text">{textOf(message)}</div>
                )}
              </div>
            </div>
          );
        })}

        {isLoading &&
          messages[messages.length - 1]?.role === "user" && (
            <div className="row assistant">
              <div className="bubble thinking">Myślę…</div>
            </div>
          )}

        {/* Błąd modelu (np. wyczerpany limit API) — z możliwością ponowienia. */}
        {error && !isLoading && (
          <div className="row assistant">
            <div className="bubble error-bubble">
              ⚠️ {error.message || "Coś poszło nie tak."}
              <div className="err-actions">
                <button
                  type="button"
                  className="ctx-btn"
                  onClick={() => {
                    clearError();
                    regenerate();
                  }}
                >
                  🔄 Spróbuj ponownie
                </button>
              </div>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

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

      {/* Podgląd załączonego obrazu (Ctrl+V / upload / drag&drop). */}
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
          placeholder="Napisz wiadomość… (po kilku pytaniach wpisz: podsumuj)"
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
