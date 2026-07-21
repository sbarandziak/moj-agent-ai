// ============================================================
// Lekcja 06, W4 §5: Endpoint /api/knowledge-search
// ------------------------------------------------------------
// POST { query } -> te same wyniki co widzi agent (fragmenty + similarity),
// ale BEZ modelu — do testowania RAG na stronie /knowledge przed rozmową.
// ============================================================

import { queryKnowledge } from "@/lib/knowledge";

export const maxDuration = 30;

export async function POST(req: Request) {
  let query: unknown;
  try {
    ({ query } = await req.json());
  } catch {
    return Response.json({ error: "Nieprawidłowy JSON w żądaniu" }, { status: 400 });
  }

  if (typeof query !== "string" || query.trim().length === 0) {
    return Response.json({ error: "Pole 'query' jest wymagane" }, { status: 400 });
  }

  const result = await queryKnowledge(query);
  if ("error" in result && result.error) {
    return Response.json({ error: result.error }, { status: 502 });
  }

  return Response.json(result);
}
