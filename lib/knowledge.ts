// ============================================================
// Lekcja 06, W3/W4: Rdzeń wyszukiwania w bazie wiedzy (RAG retrieval)
// ------------------------------------------------------------
// Wspólna logika dla:
//   - narzędzia agenta searchKnowledge (app/api/react/tools.ts),
//   - endpointu testowego /api/knowledge-search (strona /knowledge).
// Embedding pytania → RPC match_documents → fragmenty + źródła.
// ============================================================

import { supabase } from "@/lib/supabase";
import { getEmbedding } from "@/lib/embeddings";

export type KnowledgeHit = {
  title: string;
  content: string;
  similarity: number;
  metadata: Record<string, unknown>;
  added_at: string | null;
};

export type KnowledgeResult =
  | {
      results: KnowledgeHit[];
      total_found: number;
      source_documents: string[];
      message?: string;
      error?: undefined;
    }
  | { error: string };

// Wyszukuje najbardziej pasujące fragmenty dla pytania.
// matchThreshold 0.5 / matchCount 5 — zgodnie z W3.
export async function queryKnowledge(
  query: string,
  matchThreshold = 0.5,
  matchCount = 5
): Promise<KnowledgeResult> {
  const q = query?.trim() ?? "";
  if (!q) return { error: "Podaj pytanie do wyszukania w bazie wiedzy" };

  // 1. Zamień pytanie na wektor (ten sam model/wymiar co przy zapisie).
  const { embedding, error: embedErr } = await getEmbedding(q);
  if (embedErr || !embedding) {
    return { error: `Nie udało się przetworzyć pytania: ${embedErr}` };
  }

  // 2. Znajdź najbardziej podobne fragmenty (funkcja SQL z W1).
  const { data, error: rpcErr } = await supabase.rpc("match_documents", {
    query_embedding: embedding,
    match_threshold: matchThreshold,
    match_count: matchCount,
  });
  if (rpcErr) {
    return { error: `Błąd wyszukiwania w bazie wiedzy: ${rpcErr.message}` };
  }

  const rows = (data ?? []) as {
    title: string;
    content: string;
    similarity: number;
    metadata: Record<string, unknown> | null;
  }[];

  if (rows.length === 0) {
    return {
      results: [],
      total_found: 0,
      source_documents: [],
      message: "Nie znaleziono informacji w bazie wiedzy.",
    };
  }

  // Unikalne tytuły dokumentów-źródeł (agent cytuje je na końcu odpowiedzi).
  const sourceDocuments = [...new Set(rows.map((r) => r.title))];

  // Data dodania każdego dokumentu (najwcześniejszy fragment danego tytułu).
  // match_documents nie zwraca created_at — dobieramy je osobnym zapytaniem.
  const addedAt = new Map<string, string>();
  const { data: dateRows } = await supabase
    .from("documents")
    .select("title, created_at")
    .in("title", sourceDocuments)
    .order("created_at", { ascending: true });
  for (const d of (dateRows ?? []) as { title: string; created_at: string }[]) {
    if (!addedAt.has(d.title)) addedAt.set(d.title, d.created_at.slice(0, 10));
  }

  return {
    results: rows.map((r) => ({
      title: r.title,
      content: r.content,
      similarity: Math.round(r.similarity * 100) / 100,
      metadata: r.metadata ?? {},
      added_at: addedAt.get(r.title) ?? null,
    })),
    total_found: rows.length,
    source_documents: sourceDocuments,
  };
}
