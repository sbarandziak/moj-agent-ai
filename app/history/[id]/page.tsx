"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import {
  loadConversation,
  loadMessages,
  type DbConversation,
  type DbMessage,
} from "@/lib/supabase";
import { formatClock, formatFull } from "@/lib/format";

export default function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [conv, setConv] = useState<DbConversation | null>(null);
  const [messages, setMessages] = useState<DbMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [c, m] = await Promise.all([loadConversation(id), loadMessages(id)]);
      setConv(c);
      setMessages(m);
      setLoading(false);
    })();
  }, [id]);

  return (
    <div className="history">
      <header className="history-header">
        <div className="conv-topbar">
          <Link href="/history" className="conv-back">
            ← Wróć do listy
          </Link>
          <Link href={`/chat?id=${id}`} className="conv-continue">
            🔄 Kontynuuj rozmowę
          </Link>
        </div>
        <h1>{conv?.title || "Rozmowa"}</h1>
        {conv && <p className="history-sub">{formatFull(conv.updated_at)}</p>}
      </header>

      {loading && <div className="history-empty">⏳ Wczytuję rozmowę…</div>}

      {!loading && !conv && (
        <div className="history-empty">
          <p>Nie znaleziono tej rozmowy.</p>
          <Link href="/history" className="history-cta">
            ← Wróć do historii
          </Link>
        </div>
      )}

      {!loading && conv && (
        <div className="conv-thread">
          {messages.length === 0 && (
            <div className="history-empty">Ta rozmowa jest pusta.</div>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`row ${m.role}`}>
              <div className="bubble">
                <span className="conv-msg-time">
                  {m.role === "user" ? "Ty" : "Marta"} · {formatClock(m.created_at)}
                </span>
                <div className="msg-text">{m.content}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
