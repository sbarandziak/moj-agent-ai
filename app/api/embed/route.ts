// ============================================================
// Warsztat 2 (Lekcja 06): Endpoint /api/embed
// ------------------------------------------------------------
// POST { text: string } -> { embedding: number[768] }
// Cienka warstwa HTTP nad helperem getEmbedding (lib/embeddings.ts).
// Przydaje się do szybkiego testu ("czy klucz działa?") i mogą go
// wołać inne endpointy (np. /api/search w W3).
// ============================================================

import { getEmbedding } from "@/lib/embeddings";

export async function POST(req: Request) {
  let text: unknown;
  try {
    ({ text } = await req.json());
  } catch {
    return Response.json({ error: "Nieprawidłowy JSON w żądaniu" }, { status: 400 });
  }

  if (typeof text !== "string" || text.trim().length === 0) {
    return Response.json(
      { error: "Pole 'text' jest wymagane (niepusty string)" },
      { status: 400 }
    );
  }

  const result = await getEmbedding(text);
  if (result.embedding === null) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  return Response.json({ embedding: result.embedding, dim: result.embedding.length });
}
