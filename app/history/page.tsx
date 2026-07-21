"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useUser } from "../useUser";
import {
  loadConversationsWithMeta,
  deleteConversation,
  type ConversationMeta,
} from "@/lib/supabase";
import { relativeTime } from "@/lib/format";

export default function HistoryPage() {
  const user = useUser();
  const [items, setItems] = useState<ConversationMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function refresh() {
    const data = await loadConversationsWithMeta(user.id);
    setItems(data);
    setLoading(false);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  // Filtr (bonus §4): szukaj w tytule LUB w podglądzie ostatniej wiadomości.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (c) =>
        (c.title ?? "").toLowerCase().includes(q) ||
        (c.lastMessage ?? "").toLowerCase().includes(q)
    );
  }, [items, query]);

  async function handleDelete(id: string) {
    const ok = await deleteConversation(id, user.id);
    setConfirmId(null);
    if (ok) {
      setItems((prev) => prev.filter((c) => c.id !== id));
      showToast("🗑️ Rozmowa usunięta");
    } else {
      showToast("⚠️ Nie udało się usunąć rozmowy");
    }
  }

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }

  return (
    <div className="history">
      <header className="history-header">
        <h1>📜 Historia rozmów</h1>
        <p className="history-sub">Wszystkie Twoje rozmowy z agentem</p>
      </header>

      {!loading && items.length > 0 && (
        <input
          className="history-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔎 Szukaj w rozmowach..."
        />
      )}

      {loading && <div className="history-empty">⏳ Wczytuję rozmowy…</div>}

      {!loading && items.length === 0 && (
        <div className="history-empty">
          <p>Nie masz jeszcze żadnych rozmów. Zacznij nową!</p>
          <Link href="/chat" className="history-cta">
            💬 Rozpocznij rozmowę
          </Link>
        </div>
      )}

      {!loading && items.length > 0 && filtered.length === 0 && (
        <div className="history-empty">
          <p>Brak rozmów pasujących do „{query}”.</p>
        </div>
      )}

      <div className="history-list">
        {filtered.map((c) => (
          <div key={c.id} className="conv-card">
            <Link href={`/history/${c.id}`} className="conv-main">
              <div className="conv-title">{c.title || "Rozmowa bez tytułu"}</div>
              <div className="conv-meta">
                {relativeTime(c.updated_at)} &nbsp;·&nbsp; {c.messageCount}{" "}
                {c.messageCount === 1 ? "wiadomość" : "wiadomości"}
              </div>
              {c.lastMessage && (
                <div className="conv-preview">
                  {c.lastMessage.length > 100
                    ? c.lastMessage.slice(0, 100) + "…"
                    : c.lastMessage}
                </div>
              )}
            </Link>

            {confirmId === c.id ? (
              <div className="conv-confirm">
                <span>Na pewno usunąć? Tej operacji nie można cofnąć.</span>
                <div className="conv-confirm-actions">
                  <button
                    type="button"
                    className="conv-del-yes"
                    onClick={() => handleDelete(c.id)}
                  >
                    Usuń
                  </button>
                  <button
                    type="button"
                    className="conv-del-no"
                    onClick={() => setConfirmId(null)}
                  >
                    Anuluj
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="conv-del"
                title="Usuń rozmowę"
                onClick={() => setConfirmId(c.id)}
              >
                🗑️
              </button>
            )}
          </div>
        ))}
      </div>

      {toast && <div className="history-toast">{toast}</div>}
    </div>
  );
}
