// ============================================================
// Warsztat 2 (Lekcja 06): Generowanie embeddingów (Gemini)
// ------------------------------------------------------------
// Zamienia tekst na wektor 768 liczb ("adres znaczeniowy") przez
// REST API Google Generative Language — model gemini-embedding-001.
//
// UWAGA: model natywnie zwraca 3072 wymiary. Prosimy o 768
// (outputDimensionality), bo taką kolumnę `embedding vector(768)`
// założyliśmy w W1. Przy skróconym wymiarze Google zaleca
// znormalizować wektor do długości 1 — robimy to poniżej.
//
// Świadomie używamy bezpośredniego fetch (a nie SDK), bo endpoint
// embeddingów jest stabilny i nie zależy od wersji @ai-sdk/google.
// (Starszy model text-embedding-004 nie jest dostępny w tym API.)
// ============================================================

const EMBED_MODEL = "models/gemini-embedding-001";
const EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/${EMBED_MODEL}:embedContent`;

// Ile liczb ma zwrócić model (musi pasować do vector(768) w Supabase).
export const EMBEDDING_DIM = 768;

// Normalizuje wektor do długości 1 (wymagane, gdy skracamy wymiar
// przez outputDimensionality — inaczej odległości byłyby przekłamane).
function normalize(vec: number[]): number[] {
  let sum = 0;
  for (const x of vec) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm === 0) return vec;
  return vec.map((x) => x / norm);
}

export type EmbeddingResult =
  | { embedding: number[]; error: null }
  | { embedding: null; error: string };

// Generuje embedding dla jednego fragmentu tekstu.
// Retry ×3 z rosnącym odstępem — API bywa chwilowo przeciążone (429/5xx).
// Nigdy nie rzuca wyjątkiem: zwraca { error } zamiast wywalać cały request.
export async function getEmbedding(text: string): Promise<EmbeddingResult> {
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    return { embedding: null, error: "Brak GOOGLE_GENERATIVE_AI_API_KEY w .env.local" };
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return { embedding: null, error: "Pusty tekst — nie ma czego embedować" };
  }

  const body = JSON.stringify({
    model: EMBED_MODEL,
    content: { parts: [{ text: trimmed }] },
    outputDimensionality: EMBEDDING_DIM,
  });

  let lastError = "Nieznany błąd";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${EMBED_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        lastError = `HTTP ${res.status}: ${detail.slice(0, 300)}`;
        // 4xx (poza 429) nie ma sensu ponawiać — to błąd żądania/klucza.
        if (res.status >= 400 && res.status < 500 && res.status !== 429) break;
      } else {
        const data = (await res.json()) as {
          embedding?: { values?: number[] };
        };
        const values = data.embedding?.values;
        if (Array.isArray(values) && values.length > 0) {
          return { embedding: normalize(values), error: null };
        }
        lastError = "API nie zwróciło wektora (pole embedding.values puste)";
      }
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }

    // Odczekaj przed kolejną próbą (0.5s, 1s) — poza ostatnią iteracją.
    if (attempt < 3) {
      await new Promise((r) => setTimeout(r, attempt * 500));
    }
  }

  return { embedding: null, error: lastError };
}
