"use client";

// ============================================================
// Lekcja 06, W4 §5: Strona /knowledge — podgląd bazy wiedzy
// ------------------------------------------------------------
// - lista dokumentów z liczbą fragmentów + status ogólny,
// - kliknięcie dokumentu → podgląd jego fragmentów,
// - wyszukiwarka testowa: wpisz pytanie → zobacz najlepiej pasujące
//   fragmenty z similarity (retrieval BEZ agenta) — weryfikacja RAG.
// Obsługuje ?doc=Tytuł (klikalne źródło „📎" z /react).
// ============================================================

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  loadDocumentGroups,
  loadDocumentChunks,
  type DocumentGroup,
  type DbChunk,
} from "@/lib/supabase";
import { relativeTime } from "@/lib/format";

type Hit = {
  title: string;
  content: string;
  similarity: number;
  added_at: string | null;
};

function KnowledgeInner() {
  const params = useSearchParams();
  const [docs, setDocs] = useState<DocumentGroup[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);

  // Podgląd fragmentów wybranego dokumentu.
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [chunks, setChunks] = useState<DbChunk[]>([]);
  const [loadingChunks, setLoadingChunks] = useState(false);

  // Wyszukiwarka testowa.
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  useEffect(() => {
    loadDocumentGroups().then((d) => {
      setDocs(d);
      setLoadingDocs(false);
    });
  }, []);

  // Otwórz dokument wskazany w ?doc= (np. po kliknięciu źródła w /react).
  useEffect(() => {
    const doc = params.get("doc");
    if (doc) openDocument(doc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function openDocument(title: string) {
    if (openDoc === title) {
      setOpenDoc(null);
      return;
    }
    setOpenDoc(title);
    setLoadingChunks(true);
    const data = await loadDocumentChunks(title);
    setChunks(data);
    setLoadingChunks(false);
  }

  async function runSearch(e?: React.FormEvent) {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchErr(null);
    setHits(null);
    try {
      const res = await fetch("/api/knowledge-search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSearchErr(data.error ?? `HTTP ${res.status}`);
      } else {
        setHits(data.results ?? []);
      }
    } catch (err) {
      setSearchErr(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  }

  const totalChunks = docs.reduce((sum, d) => sum + d.chunks, 0);

  return (
    <div className="knowledge">
      <header className="knowledge-header">
        <h1>🔎 Baza wiedzy</h1>
        <p className="knowledge-sub">
          Podgląd dokumentów i test wyszukiwania (RAG) — zanim zapytasz agenta.
        </p>
      </header>

      {/* --- Wyszukiwarka testowa --- */}
      <form className="kn-search" onSubmit={runSearch}>
        <input
          className="kn-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Szukaj w bazie wiedzy... (np. „ile kosztuje VIP”)"
        />
        <button className="kn-search-btn" type="submit" disabled={searching || !query.trim()}>
          {searching ? "⏳" : "Szukaj"}
        </button>
      </form>

      {searchErr && <div className="kn-msg-err">⚠️ {searchErr}</div>}

      {hits && (
        <div className="kn-results">
          <div className="kn-results-head">
            {hits.length > 0
              ? `Znaleziono ${hits.length} ${hits.length === 1 ? "fragment" : "fragmentów"}:`
              : "Brak trafień w bazie wiedzy dla tego zapytania."}
          </div>
          {hits.map((h, i) => (
            <div key={i} className="kn-hit">
              <div className="kn-hit-top">
                <span className="kn-hit-title">📄 {h.title}</span>
                <span className="kn-hit-score">{Math.round(h.similarity * 100)}%</span>
              </div>
              <div className="kn-hit-content">{h.content}</div>
            </div>
          ))}
        </div>
      )}

      {/* --- Lista dokumentów --- */}
      <section className="kn-docs">
        <div className="kn-docs-head">
          <h2>Twoja baza wiedzy</h2>
          {!loadingDocs && (
            <span className="kn-status">
              {totalChunks} {totalChunks === 1 ? "fragment" : "fragmentów"} z{" "}
              {docs.length} {docs.length === 1 ? "dokumentu" : "dokumentów"}
            </span>
          )}
        </div>

        {loadingDocs && <div className="kn-empty">⏳ Wczytuję…</div>}

        {!loadingDocs && docs.length === 0 && (
          <div className="kn-empty">
            Baza jest pusta.{" "}
            <Link href="/upload" className="kn-link">
              Dodaj pierwszy dokument →
            </Link>
          </div>
        )}

        <div className="kn-doc-list">
          {docs.map((d) => (
            <div key={d.title} className="kn-doc">
              <button
                type="button"
                className={`kn-doc-head ${openDoc === d.title ? "open" : ""}`}
                onClick={() => openDocument(d.title)}
              >
                <span className="kn-doc-title">📄 {d.title}</span>
                <span className="kn-doc-meta">
                  {d.chunks} {d.chunks === 1 ? "fragment" : "fragmentów"} ·{" "}
                  {relativeTime(d.createdAt)}
                  <span className="kn-chev">{openDoc === d.title ? " ▲" : " ▼"}</span>
                </span>
              </button>

              {openDoc === d.title && (
                <div className="kn-chunks">
                  {loadingChunks && <div className="kn-empty">⏳ Wczytuję fragmenty…</div>}
                  {!loadingChunks &&
                    chunks.map((c, i) => (
                      <div key={c.id} className="kn-chunk">
                        <span className="kn-chunk-idx">#{i + 1}</span>
                        <span className="kn-chunk-text">{c.content}</span>
                      </div>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default function KnowledgePage() {
  // useSearchParams wymaga granicy Suspense w Next.
  return (
    <Suspense fallback={<div className="knowledge">⏳ Wczytuję…</div>}>
      <KnowledgeInner />
    </Suspense>
  );
}
