// ============================================================
// Lekcja 06, W3/W4: Rdzeń wyszukiwania w bazie wiedzy (RAG retrieval)
// ------------------------------------------------------------
// Wspólna logika dla:
//   - narzędzia agenta searchKnowledge (app/api/react/tools.ts),
//   - endpointu testowego /api/knowledge-search (strona /knowledge).
// Embedding pytania → RPC match_documents → fragmenty + źródła.
// ============================================================

import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { getEmbedding } from "@/lib/embeddings";

// Klient działający W IMIENIU zalogowanego użytkownika.
//
// Dlaczego to jest potrzebne: tabela `documents` ma politykę RLS
// `own_documents` (auth.uid() = user_id), a funkcja match_documents nie jest
// SECURITY DEFINER — dziedziczy więc uprawnienia wywołującego. Współdzielony
// klient z lib/supabase.ts używa klucza anon BEZ sesji, więc po stronie
// serwera auth.uid() jest NULL i RLS ucina wszystkie wiersze. Bez błędu —
// po prostu zero trafień, co wygląda jak zepsute wyszukiwanie.
//
// Przekazując token sesji użytkownika sprawiamy, że RLS działa dokładnie tak,
// jak zaprojektowano: widać własne dokumenty i tylko własne. Świadomie NIE
// używamy tu klucza service_role — ominąłby RLS i pokazał cudze dokumenty.
function clientDlaUzytkownika(accessToken?: string) {
  if (!accessToken) return supabase;
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } },
  );
}

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
//
// matchThreshold 0.68 (a nie 0.5 z W3). Powód: przy 0.5 KAŻDE pytanie zwracało
// komplet dokumentów, bo cosinusowe podobieństwo dwóch dowolnych polskich zdań
// rzadko spada poniżej 0.5. Pytanie "po ile jest czekolada" — słowo nieobecne
// w całej bazie — dostawało 0.61 i ładnie wyglądający wynik "61%".
//
// Zmierzone (fragmenty po 400 znaków, 8 pytań kontrolnych):
//   najsłabsze pytanie TRAFIONE     0.743
//   najmocniejsze pytanie BZDURNE   0.610
// Próg 0.68 leży pośrodku — odcina bzdury z zapasem ~0.07 i przepuszcza
// trafienia z zapasem ~0.06.
//
// Podnosząc ten próg pamiętaj, że zależy on od chunkSize w lib/chunking.ts:
// większe fragmenty = bardziej rozmyte wektory = niższe wyniki trafień.
export async function queryKnowledge(
  query: string,
  matchThreshold = 0.68,
  matchCount = 5,
  accessToken?: string
): Promise<KnowledgeResult> {
  const q = query?.trim() ?? "";
  if (!q) return { error: "Podaj pytanie do wyszukania w bazie wiedzy" };

  const db = clientDlaUzytkownika(accessToken);

  // 1. Zamień pytanie na wektor (ten sam model/wymiar co przy zapisie).
  const { embedding, error: embedErr } = await getEmbedding(q);
  if (embedErr || !embedding) {
    return { error: `Nie udało się przetworzyć pytania: ${embedErr}` };
  }

  // 2. Znajdź najbardziej podobne fragmenty (funkcja SQL z W1).
  const { data, error: rpcErr } = await db.rpc("match_documents", {
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
      // Rozróżniamy dwa bardzo różne powody zera trafień. Bez tego brak sesji
      // wygląda identycznie jak nietrafione pytanie — i traci się godziny.
      message: accessToken
        ? "Nie znaleziono informacji w bazie wiedzy."
        : "Brak sesji użytkownika — RLS ukrywa dokumenty. Zaloguj się albo " +
          "przekaż token sesji do queryKnowledge().",
    };
  }

  // Unikalne tytuły dokumentów-źródeł (agent cytuje je na końcu odpowiedzi).
  const sourceDocuments = [...new Set(rows.map((r) => r.title))];

  // Data dodania każdego dokumentu (najwcześniejszy fragment danego tytułu).
  // match_documents nie zwraca created_at — dobieramy je osobnym zapytaniem.
  const addedAt = new Map<string, string>();
  const { data: dateRows } = await db
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
