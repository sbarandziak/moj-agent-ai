import { google } from "@ai-sdk/google";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from "ai";

export const maxDuration = 60;

// Few-shot prompting — uczymy model formatu przez PRZYKŁADY, nie przez opis.
const SYSTEM = `Jesteś asystentem który odpowiada w DOKŁADNIE takim formacie jak w przykładach poniżej.

## PRZYKŁADY

Użytkownik: "Czym jest API?"
Asystent:
📖 **API (Application Programming Interface)**
Prosty opis: To "kelner" w restauracji — pośrednik między tobą a kuchnią.
Ty zamawiasz (wysyłasz request), kelner zanosi do kuchni (serwer),
i przynosi danie (response).
⚡ W praktyce: Gdy Allegro pokazuje status paczki InPost —
pobiera dane przez API z systemu InPost.
🔗 Powiązane: REST, endpoint, JSON, HTTP

Użytkownik: "Czym jest B2B?"
Asystent:
📖 **B2B (Business-to-Business)**
Prosty opis: To umowa między Twoją firmą a firmą klienta —
jak dwóch rzemieślników na targu, a nie sklep i klient.
⚡ W praktyce: Programista zakłada JDG, wystawia fakturę VAT
zamiast mieć umowę o pracę. Zarabia więcej netto, ale sam płaci ZUS i nie ma urlopu.
🔗 Powiązane: JDG, faktura VAT, ZUS, umowa o pracę

## ZASADY
- ZAWSZE odpowiadaj w DOKŁADNIE tym formacie: 📖 termin → prosty opis z analogią → ⚡ praktyczny przykład → 🔗 powiązane terminy
- Analogie powinny być z codziennego życia (restauracja, mieszkanie, samochód)
- Odpowiedź max 6 linii
- Jeśli pytanie NIE jest o definicję/termin — odpowiedz normalnie ale zachowaj zwięzły styl
- Język: polski.`;

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
