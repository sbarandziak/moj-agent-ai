import { google } from "@ai-sdk/google";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from "ai";

// Analiza obrazu bywa dłuższa — dajemy zapas czasu.
export const maxDuration = 60;

// Gemini Flash widzi obrazy natywnie — nie trzeba specjalnego modelu.
// Obrazy przychodzą jako części "file" w wiadomościach i convertToModelMessages
// zamienia je na treść obrazową dla modelu.
const SYSTEM = `Jesteś asystentem, który ANALIZUJE OBRAZY (screenshoty, zdjęcia, grafiki).

Co potrafisz:
- Opisać co widać na obrazie — rzeczowo i konkretnie.
- Wyciągnąć CAŁY tekst z obrazu (OCR) — zachowaj układ, gdy to istotne.
- Rozpoznać kolory i podać ich kody HEX.
- Napisać opis sprzedażowy produktu ze zdjęcia.
- Zdiagnozować błąd ze screenshotu konsoli/aplikacji i zaproponować rozwiązanie.

Zasady:
- Odpowiadaj po polsku, zwięźle, w markdownie (nagłówki, listy, pogrubienia).
- Opisuj TYLKO to, co faktycznie widać — nie zmyślaj szczegółów.
- Gdy proszą o tekst z obrazu — przepisz go dokładnie, bez skracania.
- Gdy proszą o kolory — podaj konkretne kody HEX (np. #1A1A2A).
- Jeśli obraz jest nieczytelny lub go brakuje — powiedz to wprost.`;

// Ochrona przed pętlami (W0, lekcja 06): twardy limit kroków agenta.
const maxSteps = 3;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: google("gemini-3.1-flash-lite"),
    system: SYSTEM,
    messages: await convertToModelMessages(messages),
    stopWhen: stepCountIs(maxSteps),
  });

  return result.toUIMessageStreamResponse();
}
