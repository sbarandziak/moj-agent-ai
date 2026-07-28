import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { randomUUID } from "crypto";

export const maxDuration = 60;

// Schematy walidacji dla różnych typów zdarzeń
const FeedbackData = z.object({
  customer: z.string(),
  rating: z.number().min(1).max(5),
  comment: z.string(),
});

const AlertData = z.object({
  service: z.string(),
  status: z.string(),
  since: z.string(),
});

const WebhookRequest = z.object({
  type: z.enum(["feedback", "alert", "order"]),
  data: z.unknown(),
});

// Análiza feedbacku — sentiment, priorytet, sugestia odpowiedzi
async function analyzeFeedback(data: z.infer<typeof FeedbackData>): Promise<string> {
  const prompt = `
Przeanalizuj to opinie klienta i udziel strukturyzowanej odpowiedzi:

Klient: ${data.customer}
Ocena: ${data.rating}/5
Komentarz: ${data.comment}

Podaj:
1. Sentiment (pozytywny/neutralny/negatywny)
2. Priorytet (niski/średni/wysoki)
3. Kategoria problemu (jeśli dotyczy)
4. Sugestia odpowiedzi dla zespołu
5. Rekomendowana akcja

Odpowiedź zwróć w formacie:
Sentiment: ...
Priorytet: ...
Kategoria: ...
Sugestia: ...
Akcja: ...
`;

  const { text } = await generateText({
    model: google("gemini-3.1-flash-lite"),
    prompt,
  });

  return text;
}

// Analiza alertu — severity, recommended action
async function analyzeAlert(data: z.infer<typeof AlertData>): Promise<string> {
  const prompt = `
Przeanalizuj alert infrastruktury i zaproponuj akcję:

Serwis: ${data.service}
Status: ${data.status}
Od: ${data.since}

Podaj:
1. Severity (low/medium/high/critical)
2. Przybliżony wpływ na użytkowników
3. Procedura escalation (jeśli wymagana)
4. Rekomendowana akcja (diagnostyka, restart, etc.)
5. Czas do monitorowania

Odpowiedź zwróć w formacie:
Severity: ...
Wpływ: ...
Escalation: ...
Akcja: ...
Monitoring: ...
`;

  const { text } = await generateText({
    model: google("gemini-3.1-flash-lite"),
    prompt,
  });

  return text;
}

// Główny handler webhooku
export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Walidacja schematu
    const webhook = WebhookRequest.parse(body);
    const eventId = randomUUID();

    let analysis = "";

    // Analiza zależnie od typu zdarzenia
    if (webhook.type === "feedback") {
      const feedbackData = FeedbackData.parse(webhook.data);
      analysis = await analyzeFeedback(feedbackData);
    } else if (webhook.type === "alert") {
      const alertData = AlertData.parse(webhook.data);
      analysis = await analyzeAlert(alertData);
    } else if (webhook.type === "order") {
      // Opcjonalny typ order
      analysis = `Zamówienie od: ${(webhook.data as any).customer}, Produkt: ${(webhook.data as any).product}, Kwota: ${(webhook.data as any).amount}`;
    }

    // Zapis do Supabase
    const admin = getSupabaseAdmin();
    const { error } = await admin.from("webhook_events").insert({
      id: eventId,
      type: webhook.type,
      data: webhook.data,
      analysis,
    });

    if (error) {
      console.error("Błąd zapisu webhook_events:", error.message);
      return Response.json(
        { success: false, error: "Nie udało się zapisać zdarzenia" },
        { status: 500 }
      );
    }

    return Response.json({
      success: true,
      analysis,
      event_id: eventId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Nieznany błąd";
    console.error("Błąd webhooku:", message);

    return Response.json(
      { success: false, error: message },
      { status: 400 }
    );
  }
}
