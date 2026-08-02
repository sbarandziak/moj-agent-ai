"use client";

import { useChat } from "@ai-sdk/react";
import { useState, useRef, useEffect, useCallback } from "react";
import { useImageAttachment } from "../lib/useImageAttachment";
import { useBudget, budgetColor } from "../lib/useBudget";
import { errorText } from "../lib/errorText";
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

const MODELS: { id: ModelKey; label: string; hint: string }[] = [
  { id: "flash", label: "szybki", hint: "Flash — krótkie pytania" },
  { id: "pro", label: "zaawansowany", hint: "Pro — analiza i liczenie" },
];

// Miasto paska danych (to samo co dashboard).
const CITY = "Warszawa";

// Gotowce startowe z dziedziny agentki. Klik = wysłanie pełnego pytania.
const STARTERS: { title: string; desc: string; prompt: string; icon: React.ReactNode }[] = [
  {
    title: "Policz koszty zakupu",
    desc: "PCC, taksa notarialna, prowizje",
    prompt:
      "Policz wszystkie koszty zakupu mieszkania za 600 000 zł z rynku wtórnego — PCC, taksa notarialna, wpisy do KW, prowizja pośrednika.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
  },
  {
    title: "Porównaj kredyty",
    desc: "Rata, RRSO, wkład własny",
    prompt:
      "Jaki wkład własny potrzebuję do kredytu hipotecznego i jak zmienia się rata przy 10%, 20% i 30% wkładu?",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v18M5 8l7-5 7 5v8l-7 5-7-5Z" />
      </svg>
    ),
  },
  {
    title: "Streść dokument",
    desc: "Umowa, protokół — wnioski i ryzyka",
    prompt:
      "Zaraz wkleję umowę deweloperską. Streść ją i wypisz ryzyka oraz zapisy, które warto negocjować.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
        <path d="M14 3v5h5" />
        <path d="M9 13h6M9 17h4" />
      </svg>
    ),
  },
  {
    title: "Sprawdź księgę wieczystą",
    desc: "Na co uważać przed zakupem",
    prompt: "Na co zwrócić uwagę w księdze wieczystej przed zakupem mieszkania? Wypisz dział po dziale.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Z" />
        <path d="M8 7h7M8 11h7" />
      </svg>
    ),
  },
  {
    title: "Rynek pierwotny czy wtórny",
    desc: "Porównanie kosztów i ryzyk",
    prompt: "Rynek pierwotny czy wtórny — co bardziej się opłaca? Porównaj koszty, terminy i ryzyka.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 21V9l6-4 6 4v12" />
        <path d="M15 21V13l6 3v5M3 21h18" />
      </svg>
    ),
  },
  {
    title: "Przygotuj ofertę sprzedaży",
    desc: "Opis mieszkania gotowy do publikacji",
    prompt:
      "Napisz ogłoszenie sprzedaży mieszkania 48 m², 2 pokoje, 3. piętro z windą, po remoncie, blisko szkoły i przystanku.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6h16M4 11h16M4 16h10M4 21h7" />
      </svg>
    ),
  },
];

// --- Typy paska danych (/api/dashboard) ---
type Rate = { code: string; mid?: number; change?: number; error?: boolean };
type StripData = {
  weather: { city: string; temperature: number; emoji: string } | { error: string };
  rates: Rate[];
  holidays: { upcoming: { date: string; name: string }[]; nextInDays: number | null } | { error: string };
};

function hasError<T extends object>(v: T): v is T & { error: string } {
  return typeof v === "object" && v !== null && "error" in v;
}

function shortDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("pl-PL", {
    day: "numeric",
    month: "short",
  });
}

export default function ChatPage() {
  const user = useUser(); // tożsamość z Supabase Auth (W3)
  const { messages, sendMessage, status, setMessages, error, regenerate, clearError } =
    useChat();
  const [input, setInput] = useState("");
  const [model, setModel] = useState<ModelKey>("flash");
  const [contextOpen, setContextOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const att = useImageAttachment({ globalPaste: true });
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Trwała pamięć (Supabase).
  const conversationIdRef = useRef<string | null>(null); // aktualna rozmowa
  const savedIdsRef = useRef<Set<string>>(new Set()); // id już zapisanych wiadomości
  const [loadingHistory, setLoadingHistory] = useState(true);

  // Personalizacja (W3): profil użytkownika (tożsamość = auth.uid()).
  const userIdRef = useRef<string | null>(user.id); // ID z Supabase Auth
  const [userName, setUserName] = useState<string | null>(null);
  const [preferences, setPreferences] = useState<Record<string, string>>({});

  // Budżet tokenów (W3, L10): ile z dziennego limitu zostało.
  const { budget, refresh: refreshBudget } = useBudget(user.id);

  // Pasek na żywo + zegar w nagłówku ekranu startowego. Liczone po stronie
  // klienta (w useEffect), żeby nie rozjechać hydracji.
  const [strip, setStrip] = useState<StripData | null>(null);
  const [now, setNow] = useState<string | null>(null);

  // Auto-scroll do ostatniej wiadomości.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const isLoading = status === "submitted" || status === "streaming";

  useEffect(() => {
    const d = new Date();
    const day = d.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" });
    const time = d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
    setNow(`${day.charAt(0).toUpperCase()}${day.slice(1)} · ${time}`);

    fetch(`/api/dashboard?city=${encodeURIComponent(CITY)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json: StripData) => setStrip(json))
      .catch(() => {
        /* pasek jest dodatkiem — brak danych po prostu go ukrywa */
      });
  }, []);

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
    // Tura skończona → odśwież licznik budżetu. Drugie odpytanie po chwili,
    // bo zapis usage leci na serwerze tuż PO zamknięciu streamu i pierwszy
    // strzał potrafi go jeszcze nie zobaczyć.
    refreshBudget();
    const budgetRetry = setTimeout(refreshBudget, 1500);
    (async () => {
      const profile = await loadProfile(id);
      if (profile) {
        setUserName(profile.name);
        setPreferences(profile.preferences ?? {});
      }
    })();
    return () => clearTimeout(budgetRetry);
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
  const send = useCallback(
    (text: string) => {
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
      if (taRef.current) taRef.current.style.height = "auto";
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [isLoading, att.image, model, userName, preferences]
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    send(input);
  }

  // Enter wysyła, Shift+Enter robi nową linię.
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  function autoGrow(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 180) + "px";
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

  const showHero = !loadingHistory && messages.length === 0;
  const modelInfo = MODELS.find((m) => m.id === model)!;

  return (
    <div
      className="app"
      onDragOver={att.onDragOver}
      onDragLeave={att.onDragLeave}
      onDrop={att.onDrop}
    >
      {att.dragging && <div className="drop-overlay">⬇️ Upuść obraz</div>}

      <div className="thread">
        {loadingHistory && (
          <div className="from-agent thinking">⏳ Wczytuję poprzednią rozmowę…</div>
        )}

        {/* --- Ekran startowy --- */}
        {showHero && (
          <section>
            <div className="hero">
              <div className="eyebrow">{now ?? " "}</div>
              <h1>{userName ? `Nad czym pracujemy, ${userName}?` : "Nad czym pracujemy?"}</h1>
              <p>Napisz zadanie albo zacznij od jednego z gotowych.</p>
            </div>

            <div className="starters">
              {STARTERS.map((s) => (
                <button
                  key={s.title}
                  type="button"
                  className="starter"
                  onClick={() => send(s.prompt)}
                  disabled={isLoading}
                >
                  {s.icon}
                  <span>
                    <b>{s.title}</b>
                    <em>{s.desc}</em>
                  </span>
                </button>
              ))}
            </div>

            <Strip data={strip} />
          </section>
        )}

        {/* --- Wątek rozmowy --- */}
        {messages.map((message) => {
          if (message.role === "user") {
            return (
              <div key={message.id} className="from-user">
                {imagesOf(message).map((src) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={src} src={src} alt="załączony obraz" className="msg-image" />
                ))}
                {textOf(message)}
              </div>
            );
          }
          const md = modelOf(message);
          return (
            <div key={message.id}>
              <div className="agent-tag">
                <span className="mark">
                  <span />
                </span>
                <em>Marta Wiśniewska</em>
                <span className={`badge badge-${md}`}>
                  {md === "flash" ? "⚡ Flash" : "🧠 Pro"}
                </span>
              </div>
              <div className="from-agent">{textOf(message)}</div>
            </div>
          );
        })}

        {isLoading && messages[messages.length - 1]?.role === "user" && (
          <div className="from-agent thinking">Myślę…</div>
        )}

        {/* Błąd trasy/modelu (limit API, rate limit z W2, budżet tokenów z W3)
            — treść wyłuskana z JSON-a, z możliwością ponowienia. */}
        {error && !isLoading && (
          <div className="from-agent">
            <div className="res-card error-bubble">
              ⚠️ {errorText(error)}
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

      {/* --- Panel kontekstu (chowany chipem "Kontekst") --- */}
      {contextOpen && (
        <div className="context">
          <div className="context-body" style={{ paddingTop: 12 }}>
            <span className="counter">
              {userName && (
                <>
                  👤 <b>{userName}</b> &nbsp;|&nbsp;{" "}
                </>
              )}
              Wiadomości: <b>{messages.length}</b> &nbsp;|&nbsp; ~Tokeny:{" "}
              <b>{tokenEstimate}</b>
              {budget && (
                <>
                  {" "}
                  &nbsp;|&nbsp; 🔋 Budżet dziś:{" "}
                  <b style={{ color: budgetColor(budget.percent) }}>
                    {budget.used.toLocaleString("pl-PL")}/
                    {budget.limit.toLocaleString("pl-PL")}
                  </b>{" "}
                  tokenów ({budget.percent}%)
                </>
              )}
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
        </div>
      )}

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

      {/* --- Composer --- */}
      <div className="composer-wrap">
        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            ref={taRef}
            rows={2}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              autoGrow(e.target);
            }}
            onKeyDown={handleKeyDown}
            onPaste={att.onPaste}
            placeholder="Napisz zadanie albo wklej dokument…"
            autoFocus
          />
          <div className="composer-bar">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={att.onFileInput}
            />
            <button
              type="button"
              className="chipbtn"
              onClick={() => fileRef.current?.click()}
              title="Załącz obraz"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.5 12.8 20.7a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 1 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8" />
              </svg>
              Dodaj plik
            </button>
            <button
              type="button"
              className={`chipbtn ${contextOpen ? "on" : ""}`}
              onClick={() => setContextOpen((o) => !o)}
              title="Pamięć rozmowy, tokeny i budżet"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
              </svg>
              Kontekst: {messages.length} wiad.
              {budget ? ` · ${budget.percent}% budżetu` : ""}
            </button>
            <button
              type="button"
              className="chipbtn"
              onClick={() => setModel((m) => (m === "flash" ? "pro" : "flash"))}
              title={modelInfo.hint}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v4l3 2" />
              </svg>
              Tryb: {modelInfo.label}
            </button>
            <button
              className="send"
              type="submit"
              aria-label="Wyślij"
              disabled={isLoading || (!input.trim() && !att.image)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5" />
                <path d="m6 11 6-6 6 6" />
              </svg>
            </button>
          </div>
        </form>
        <p className="hint">
          Agent pamięta rozmowę i korzysta z bazy wiedzy. Enter wysyła, Shift+Enter to nowa linia.
        </p>
      </div>
    </div>
  );
}

/** Pasek danych na żywo pod starterami (kursy NBP, pogoda, najbliższe święto). */
function Strip({ data }: { data: StripData | null }) {
  if (!data) {
    return (
      <div className="strip">
        <span className="strip-skeleton" />
        <span className="strip-skeleton" />
        <span className="strip-skeleton" />
      </div>
    );
  }

  const holidays = data.holidays && !hasError(data.holidays) ? data.holidays : null;
  const next = holidays?.upcoming?.[0];

  return (
    <div className="strip">
      {data.rates?.map((r) =>
        r.error || r.mid === undefined ? null : (
          <span key={r.code}>
            {r.code} <b>{r.mid.toFixed(4)}</b>{" "}
            <span
              className={`delta ${
                (r.change ?? 0) > 0 ? "up" : (r.change ?? 0) < 0 ? "down" : "flat"
              }`}
            >
              {(r.change ?? 0) > 0 ? "↑" : (r.change ?? 0) < 0 ? "↓" : "→"}{" "}
              {Math.abs(r.change ?? 0).toFixed(4)}
            </span>
          </span>
        )
      )}
      {data.weather && !hasError(data.weather) && (
        <span>
          {data.weather.city} <b>{Math.round(data.weather.temperature)}°C</b>{" "}
          {data.weather.emoji}
        </span>
      )}
      {next && (
        <span>
          Najbliższe wolne: <b>{shortDate(next.date)}</b> ({next.name})
        </span>
      )}
    </div>
  );
}
