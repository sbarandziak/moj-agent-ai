// ============================================================
// Warsztat 2 (Lekcja 06): Endpoint /api/upload-knowledge
// ------------------------------------------------------------
// POST { title, content } -> strumień NDJSON z postępem.
//
// Działanie:
//   1. Podziel content na fragmenty (splitIntoChunks).
//   2. Dla KAŻDEGO fragmentu (sekwencyjnie, by nie przekroczyć rate limitu):
//        a. wygeneruj embedding (getEmbedding),
//        b. zapisz w tabeli `documents` (title, content, embedding, metadata).
//   3. Po drodze wysyłaj linie postępu, na końcu podsumowanie.
//
// Odpowiedź to strumień linii JSON (po jednej na wiersz):
//   { "type": "start",    "total": 12 }
//   { "type": "progress", "current": 3, "total": 12 }
//   { "type": "done",     "chunks_saved": 12 }
//   { "type": "error",    "message": "..." }
// ============================================================

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { splitIntoChunks } from "@/lib/chunking";
import { getEmbedding } from "@/lib/embeddings";

// Embedowanie kilkunastu fragmentów po kolei bywa dłuższe niż domyślne 10 s.
export const maxDuration = 60;

export async function POST(req: Request) {
  let title: unknown;
  let content: unknown;
  let userId: unknown;
  try {
    ({ title, content, userId } = await req.json());
  } catch {
    return Response.json({ error: "Nieprawidłowy JSON w żądaniu" }, { status: 400 });
  }

  if (typeof title !== "string" || title.trim().length === 0) {
    return Response.json({ error: "Pole 'title' jest wymagane" }, { status: 400 });
  }
  if (typeof content !== "string" || content.trim().length === 0) {
    return Response.json({ error: "Pole 'content' jest wymagane" }, { status: 400 });
  }
  // W3: dokument musi mieć właściciela (auth.uid() z klienta).
  if (typeof userId !== "string" || userId.trim().length === 0) {
    return Response.json({ error: "Brak identyfikatora użytkownika (zaloguj się)" }, { status: 401 });
  }
  const ownerId = userId;

  const docTitle = title.trim();
  const chunks = splitIntoChunks(content);

  if (chunks.length === 0) {
    return Response.json({ error: "Nie udało się podzielić tekstu na fragmenty" }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const send = (
    controller: ReadableStreamDefaultController,
    obj: Record<string, unknown>
  ) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

  const stream = new ReadableStream({
    async start(controller) {
      try {
        // Klient service_role: trasa jest zaufana (sama sprawdziła userId),
        // a klient `anon` bez sesji zostałby zablokowany przez RLS (W3).
        const db = getSupabaseAdmin();

        send(controller, { type: "start", total: chunks.length });

        let saved = 0;
        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];

          // a) embedding
          const { embedding, error: embedErr } = await getEmbedding(chunk);
          if (embedErr || !embedding) {
            send(controller, {
              type: "error",
              message: `Fragment ${i + 1}/${chunks.length}: błąd embeddingu — ${embedErr}`,
            });
            controller.close();
            return;
          }

          // b) zapis do Supabase
          const { error: dbErr } = await db.from("documents").insert({
            // created_at ustawiamy jawnie — tabela z W1 bywa bez DEFAULT now().
            created_at: new Date().toISOString(),
            user_id: ownerId, // W3: właściciel dokumentu
            title: docTitle,
            content: chunk,
            embedding, // number[768] — PostgREST rzutuje na vector(768)
            metadata: {
              source: docTitle,
              chunk_index: i,
              total_chunks: chunks.length,
            },
          });

          if (dbErr) {
            send(controller, {
              type: "error",
              message: `Fragment ${i + 1}/${chunks.length}: błąd zapisu — ${dbErr.message}`,
            });
            controller.close();
            return;
          }

          saved++;
          send(controller, { type: "progress", current: i + 1, total: chunks.length });
        }

        send(controller, { type: "done", chunks_saved: saved });
        controller.close();
      } catch (e) {
        send(controller, {
          type: "error",
          message: e instanceof Error ? e.message : String(e),
        });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
