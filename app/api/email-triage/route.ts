import { google } from "@ai-sdk/google";
import { streamText } from "ai";

export const maxDuration = 60;

// Lekcja 08, W1: e-mail triage.
// Tu agent nie odpowiada na PYTANIE — wykonuje ZADANIE: czyta paczkę maili,
// kategoryzuje je, nadaje priorytet i pisze gotowy szkic odpowiedzi.
const SYSTEM = `Jesteś profesjonalnym asystentem do zarządzania pocztą.

Dla KAŻDEGO maila wykonaj:
1. 📧 KATEGORYZACJA: określ typ (zapytanie ofertowe / reklamacja / spam / informacja / prośba o spotkanie)
2. 🔴🟡🟢 PRIORYTET: Wysoki (wymaga odpowiedzi dziś) / Średni (w ciągu 3 dni) / Niski (może poczekać)
3. ✍️ DRAFT: Napisz krótki, profesjonalny szkic odpowiedzi (3-5 zdań)

FORMAT ODPOWIEDZI:
Dla każdego maila:

### Mail [numer]: [krótki temat]
| Kategoria | [typ] |
| Priorytet | [🔴 Wysoki / 🟡 Średni / 🟢 Niski] |
| Uzasadnienie | [dlaczego ten priorytet] |

**Proponowana odpowiedź:**
> [draft odpowiedzi]

---

Na końcu: PODSUMOWANIE
- 🔴 Pilne: [ile] maili
- 🟡 Średnie: [ile] maili
- 🟢 Niskie: [ile] maili
- ✅ Rekomendacja: [który mail obsłużyć najpierw]

ZASADY:
- Zachowaj DOKŁADNIE powyższy format i kolejność maili (Mail 1, Mail 2, ...).
- Dla spamu w miejscu draftu napisz: "> Brak odpowiedzi — spam, do usunięcia."
- Sekcję podsumowania zacznij nagłówkiem "### PODSUMOWANIE".
- Język: polski, forma grzecznościowa (Pan/Pani).`;

export async function POST(req: Request) {
  const { emails }: { emails?: string[] } = await req.json();

  const list = (emails ?? []).map((e) => e.trim()).filter(Boolean);

  if (list.length === 0) {
    return new Response("Brak maili do analizy.", { status: 400 });
  }

  // Maile trafiają do modelu jako ponumerowana lista — numeracja z promptu
  // ("Mail 1", "Mail 2") musi się zgadzać z kolejnością wklejoną przez użytkownika.
  const prompt = list
    .map((mail, i) => `--- MAIL ${i + 1} ---\n${mail}`)
    .join("\n\n");

  const result = streamText({
    model: google("gemini-3.1-flash-lite"),
    system: SYSTEM,
    prompt,
  });

  // Zwykły strumień tekstu (nie czat) — strona czyta go readerem i renderuje
  // na bieżąco jako karty.
  return result.toTextStreamResponse();
}
