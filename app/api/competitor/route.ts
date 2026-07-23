import { google } from "@ai-sdk/google";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from "ai";
// Reuse narzędzi z lekcji 04 — analityk konkurencji zbiera dane tak samo jak
// agent raportowy (szukaj → czytaj → porównaj), więc nic nowego nie dostaje.
import { readWebPage, searchWikipedia } from "../react/tools";

// Zbieranie danych o 3 firmach + tabela + rekomendacja — dajemy maksimum czasu.
export const maxDuration = 60;

// Analiza 3 firm wymaga wielu kroków (dla każdej: szukaj → czytaj), stąd 10.
const maxSteps = 10;

// Search Grounding to najdroższa funkcja API ($14/1000 zapytań) — domyślnie
// WYŁĄCZONA. Włącz tylko na czas testów: ENABLE_SEARCH_GROUNDING=true w .env.local.
const SEARCH_GROUNDING = process.env.ENABLE_SEARCH_GROUNDING === "true";
if (SEARCH_GROUNDING) {
  console.warn(
    "⚠️ UWAGA: Search Grounding jest WŁĄCZONY. " +
      "To jest najdroższa funkcja API ($14/1000 zapytań). " +
      "Używaj TYLKO do testów. Wyłącz po testach usuwając ENABLE_SEARCH_GROUNDING z .env.local, " +
      "bo inni uczestnicy kursu mają wtedy ograniczony dostęp do modeli."
  );
}

// Dzisiejsza data — model nie zna jej z pamięci, a dane rynkowe się starzeją.
function today() {
  return new Date().toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function systemPrompt() {
  return `Jesteś analitykiem konkurencji. Gdy użytkownik poda nazwy firm,
AUTONOMICZNIE zbierasz informacje i porównujesz je.

Dzisiejsza data: ${today()}.

## TWÓJ PROCES:
1. Dla KAŻDEJ firmy: szukaj informacji (${SEARCH_GROUNDING ? "Google (google_search), " : ""}Wikipedia (searchWikipedia), strony firmowe (readWebPage))
2. Zbierz: opis, branża, wielkość, produkty, ceny, mocne/słabe strony
3. Stwórz tabelę porównawczą
4. Napisz rekomendację

## FORMAT:

# 🏢 Analiza konkurencji

## Porównanie

| Aspekt | [Firma 1] | [Firma 2] | [Firma 3] |
|--------|-----------|-----------|-----------|
| Branża | ... | ... | ... |
| Wielkość | ... | ... | ... |
| Główny produkt | ... | ... | ... |
| Mocne strony | ... | ... | ... |
| Słabe strony | ... | ... | ... |
| Ceny (orientacyjne) | ... | ... | ... |

## Szczegółowa analiza
[Rozwinięcie dla każdej firmy — 3-4 zdania]

## Rekomendacja
[Która firma jest najlepsza i dlaczego — w kontekście użytkownika]

## Źródła
[Linki do stron firmowych i artykułów]

ZASADY:
- Używaj PRAWDZIWYCH danych — ${SEARCH_GROUNDING ? "Google Search, " : ""}Wikipedia, konkretne strony WWW
- Nie wymyślaj cen ani statystyk — szukaj! Gdy czegoś nie da się potwierdzić, napisz to wprost.
- Jeśli użytkownik podał kontekst (np. "szukam platformy dla małego sklepu"), dopasuj do niego rekomendację.
- Cała analiza po polsku, w markdownie. Bez komentarza od siebie — sama analiza.`;
}

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: google("gemini-3.1-flash-lite"),
    system: systemPrompt(),
    messages: await convertToModelMessages(messages),
    tools: {
      // Wbudowane wyszukiwanie Google (grounding) — TYLKO gdy włączone env varem
      // (płatne!). Bez niego agent i tak zbiera dane z Wikipedii i stron WWW.
      ...(SEARCH_GROUNDING
        ? { google_search: google.tools.googleSearch({}) }
        : {}),
      readWebPage,
      searchWikipedia,
    },
    // Twardy limit kroków agenta — ochrona przed pętlą narzędzi.
    stopWhen: stepCountIs(maxSteps),
  });

  // sendSources: true → linki z groundingu trafiają do klienta jako "source-url".
  return result.toUIMessageStreamResponse({ sendSources: true });
}
