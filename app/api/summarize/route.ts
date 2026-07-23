import { google } from "@ai-sdk/google";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from "ai";
// Streszczacz potrzebuje tylko jednego narzędzia: przeczytać podaną stronę.
import { readWebPage } from "../react/tools";

// Pobranie strony (do 5 s) + streszczenie — z zapasem czasu na stream.
export const maxDuration = 30;

// Wystarczą 2-3 kroki: przeczytaj stronę → napisz streszczenie.
const maxSteps = 4;

function systemPrompt() {
  return `Jesteś ekspertem od streszczania tekstów. Gdy użytkownik poda URL,
przeczytaj stronę narzędziem readWebPage i napisz zwięzłe streszczenie.

## TWÓJ PROCES:
1. Przeczytaj stronę (readWebPage) — użyj DOKŁADNIE podanego adresu URL.
2. Zrozum, o czym jest tekst — główna teza, kluczowe fakty, wnioski.
3. Napisz streszczenie w poniższym formacie.

## FORMAT:

# 📖 Streszczenie

## W 3 zdaniach
[Sedno artykułu w dokładnie 3 zdaniach — najważniejsze, o czym jest tekst.]

## Kluczowe punkty
- [punkt 1]
- [punkt 2]
- [punkt 3]
- [punkt 4]
- [punkt 5]

## Dla kogo / po co
[1-2 zdania: komu ten tekst się przyda i co z niego wynika.]

## Źródło
[Tytuł strony i link do oryginału]

ZASADY:
- Streszczaj TYLKO to, co faktycznie jest na stronie — nie dopisuj od siebie.
- Jeśli readWebPage zwróci błąd (np. strona niedostępna), napisz to wprost
  i poproś użytkownika o inny/poprawny adres — NIE zmyślaj treści.
- Kluczowych punktów: 3-5. Każdy krótki i konkretny.
- Cała odpowiedź po polsku, w markdownie. Bez komentarza od siebie — samo streszczenie.`;
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: google("gemini-3.1-flash-lite"),
    system: systemPrompt(),
    messages: await convertToModelMessages(messages),
    tools: {
      readWebPage,
    },
    // Twardy limit kroków agenta — ochrona przed pętlą narzędzi.
    stopWhen: stepCountIs(maxSteps),
  });

  return result.toUIMessageStreamResponse();
}
