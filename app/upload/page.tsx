"use client";

// ============================================================
// Warsztat 2 (Lekcja 06): Strona /upload — baza wiedzy (RAG)
// ------------------------------------------------------------
// Wklejasz tytuł + treść -> apka dzieli tekst na fragmenty,
// generuje embeddingi i zapisuje w tabeli `documents` w Supabase.
// Postęp czytamy ze strumienia NDJSON z /api/upload-knowledge.
// ============================================================

import { useEffect, useState } from "react";
import {
  loadDocumentGroups,
  deleteDocument,
  type DocumentGroup,
} from "@/lib/supabase";
import { relativeTime } from "@/lib/format";

// Przykładowe dokumenty (podpowiedzi) — jednym kliknięciem wypełniają formularz.
const SAMPLES: { label: string; title: string; content: string }[] = [
  {
    label: "💰 Cennik",
    title: "Cennik 2026",
    content: `CENNIK USŁUG 2026

Pakiet Basic: 99 zł/miesiąc
- 5 użytkowników
- 10 GB miejsca
- Wsparcie email

Pakiet Premium: 299 zł/miesiąc
- 25 użytkowników
- 100 GB miejsca
- Wsparcie email + telefon
- Priorytetowa obsługa

Pakiet VIP: 599 zł/miesiąc
- Nielimitowani użytkownicy
- 1 TB miejsca
- Wsparcie 24/7
- Dedykowany opiekun
- Szkolenie wdrożeniowe

Wszystkie pakiety z 14-dniowym okresem próbnym.
Faktura VAT wystawiana automatycznie.
Rezygnacja możliwa w dowolnym momencie.`,
  },
  {
    label: "❓ FAQ",
    title: "FAQ",
    content: `Q: Jak mogę anulować subskrypcję?
A: Wyślij email na pomoc@firma.pl albo kliknij "Anuluj" w ustawieniach konta. Rezygnacja działa od końca bieżącego okresu rozliczeniowego.

Q: Czy mogę zmienić pakiet w trakcie miesiąca?
A: Tak, zmiana pakietu jest natychmiastowa. Przy przejściu na wyższy pakiet dopłacasz różnicę proporcjonalnie.

Q: Jak długo trwa okres próbny?
A: 14 dni bez podawania karty. Po tym czasie wybierasz pakiet lub konto zostaje zawieszone.

Q: Czy wystawiacie faktury VAT?
A: Tak, faktura VAT jest wystawiana automatycznie po każdej płatności i wysyłana na email.`,
  },
  {
    label: "📜 Regulamin",
    title: "Regulamin firmy",
    content: `§1. Postanowienia ogólne
1.1 Niniejszy regulamin określa zasady korzystania z usług firmy.
1.2 Korzystanie z usług oznacza akceptację regulaminu.

§2. Płatności
2.1 Opłaty pobierane są z góry za okres rozliczeniowy (miesiąc).
2.2 Brak płatności skutkuje zawieszeniem konta po 7 dniach.

§3. Rezygnacja
3.1 Klient może zrezygnować w dowolnym momencie.
3.2 Zwroty za niewykorzystany okres nie przysługują, chyba że umowa stanowi inaczej.`,
  },
];

type Status =
  | { phase: "idle" }
  | { phase: "working"; current: number; total: number }
  | { phase: "done"; saved: number }
  | { phase: "error"; message: string };

export default function UploadPage() {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [status, setStatus] = useState<Status>({ phase: "idle" });
  const [docs, setDocs] = useState<DocumentGroup[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [confirmTitle, setConfirmTitle] = useState<string | null>(null);

  async function refreshDocs() {
    const data = await loadDocumentGroups();
    setDocs(data);
    setLoadingDocs(false);
  }

  useEffect(() => {
    refreshDocs();
  }, []);

  const working = status.phase === "working";
  const canSubmit = title.trim().length > 0 && content.trim().length > 0 && !working;

  async function handleSubmit() {
    if (!canSubmit) return;
    setStatus({ phase: "working", current: 0, total: 0 });

    try {
      const res = await fetch("/api/upload-knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });

      // Błąd zanim ruszył strumień (np. walidacja 400) -> zwykły JSON.
      if (!res.ok && !res.body) {
        const data = await res.json().catch(() => ({}));
        setStatus({ phase: "error", message: data.error ?? `HTTP ${res.status}` });
        return;
      }
      if (!res.body) {
        setStatus({ phase: "error", message: "Brak odpowiedzi ze strumienia" });
        return;
      }

      // Czytamy strumień NDJSON linia po linii.
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // ostatni (niepełny) fragment zostaje w buforze
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          handleEvent(JSON.parse(trimmed));
        }
      }
      // dokończ ewentualną resztę bufora
      if (buffer.trim()) handleEvent(JSON.parse(buffer.trim()));

      await refreshDocs();
    } catch (e) {
      setStatus({
        phase: "error",
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  function handleEvent(ev: {
    type: string;
    total?: number;
    current?: number;
    chunks_saved?: number;
    message?: string;
  }) {
    if (ev.type === "start") {
      setStatus({ phase: "working", current: 0, total: ev.total ?? 0 });
    } else if (ev.type === "progress") {
      setStatus({
        phase: "working",
        current: ev.current ?? 0,
        total: ev.total ?? 0,
      });
    } else if (ev.type === "done") {
      setStatus({ phase: "done", saved: ev.chunks_saved ?? 0 });
      setTitle("");
      setContent("");
    } else if (ev.type === "error") {
      setStatus({ phase: "error", message: ev.message ?? "Nieznany błąd" });
    }
  }

  async function handleDelete(docTitle: string) {
    const ok = await deleteDocument(docTitle);
    setConfirmTitle(null);
    if (ok) setDocs((prev) => prev.filter((d) => d.title !== docTitle));
  }

  function useSample(s: (typeof SAMPLES)[number]) {
    setTitle(s.title);
    setContent(s.content);
    setStatus({ phase: "idle" });
  }

  const pct =
    status.phase === "working" && status.total > 0
      ? Math.round((status.current / status.total) * 100)
      : 0;

  return (
    <div className="upload">
      <header className="upload-header">
        <h1>📚 Baza wiedzy</h1>
        <p className="upload-sub">Wklej tekst — agent będzie z niego korzystał</p>
      </header>

      {/* --- Formularz --- */}
      <div className="upload-form">
        <label className="upload-label" htmlFor="doc-title">
          Tytuł dokumentu
        </label>
        <input
          id="doc-title"
          className="upload-input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Np. Cennik 2026, FAQ, Regulamin firmy"
          disabled={working}
        />

        <label className="upload-label" htmlFor="doc-content">
          Treść dokumentu
        </label>
        <textarea
          id="doc-content"
          className="upload-textarea"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Wklej tutaj treść dokumentu..."
          disabled={working}
        />

        <div className="upload-samples">
          <span className="upload-samples-label">Przykłady:</span>
          {SAMPLES.map((s) => (
            <button
              key={s.label}
              type="button"
              className="upload-sample-btn"
              onClick={() => useSample(s)}
              disabled={working}
            >
              {s.label}
            </button>
          ))}
        </div>

        <button
          type="button"
          className="upload-submit"
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {working ? "⏳ Przetwarzam…" : "📤 Zapisz w bazie wiedzy"}
        </button>

        {/* --- Postęp / komunikaty --- */}
        {status.phase === "working" && (
          <div className="upload-progress">
            <div className="upload-progress-bar">
              <div className="upload-progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="upload-progress-text">
              {status.total > 0
                ? `Przetwarzam fragment ${status.current} z ${status.total}…`
                : "Dzielę tekst na fragmenty…"}
            </div>
          </div>
        )}

        {status.phase === "done" && (
          <div className="upload-msg upload-msg-ok">
            ✅ Zapisano {status.saved}{" "}
            {status.saved === 1 ? "fragment" : "fragmentów"}!
          </div>
        )}

        {status.phase === "error" && (
          <div className="upload-msg upload-msg-err">⚠️ {status.message}</div>
        )}
      </div>

      {/* --- Lista zapisanych dokumentów --- */}
      <section className="upload-docs">
        <h2 className="upload-docs-title">Zapisane dokumenty</h2>

        {loadingDocs && <div className="upload-empty">⏳ Wczytuję…</div>}

        {!loadingDocs && docs.length === 0 && (
          <div className="upload-empty">
            Brak dokumentów. Wklej pierwszy tekst powyżej.
          </div>
        )}

        <div className="upload-docs-list">
          {docs.map((d) => (
            <div key={d.title} className="doc-card">
              <div className="doc-main">
                <div className="doc-title">{d.title}</div>
                <div className="doc-meta">
                  {d.chunks} {d.chunks === 1 ? "fragment" : "fragmentów"}{" "}
                  &nbsp;·&nbsp; dodano {relativeTime(d.createdAt)}
                </div>
              </div>

              {confirmTitle === d.title ? (
                <div className="doc-confirm">
                  <span>Usunąć cały dokument?</span>
                  <div className="doc-confirm-actions">
                    <button
                      type="button"
                      className="doc-del-yes"
                      onClick={() => handleDelete(d.title)}
                    >
                      Usuń
                    </button>
                    <button
                      type="button"
                      className="doc-del-no"
                      onClick={() => setConfirmTitle(null)}
                    >
                      Anuluj
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="doc-del"
                  title="Usuń dokument"
                  onClick={() => setConfirmTitle(d.title)}
                >
                  🗑️
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
