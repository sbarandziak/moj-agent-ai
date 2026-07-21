import { google } from "@ai-sdk/google";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from "ai";
// Wspólne narzędzie czytania stron — z timeoutem 5 s i obsługą błędów HTTP (W3).
import { readWebPage } from "../react/tools";

// Grounding + czytanie stron bywa wolniejsze — dajemy więcej czasu na stream.
export const maxDuration = 60;

// Ochrona przed pętlami (W0, lekcja 06): twardy limit kroków agenta.
const maxSteps = 3;

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

// Neutralny, pomocny asystent z dostępem do internetu.
// (Świadomie NIE używamy tu persony "Marty" z /api/chat — ona odmawia pytań
//  spoza nieruchomości, co zablokowałoby ogólne wyszukiwanie z tej lekcji.)
const SYSTEM = `Jesteś asystentem z dostępem do PRAWDZIWEGO internetu.

Masz do dyspozycji:
- Wyszukiwarkę Google (grounding) — używaj jej, gdy pytanie dotyczy aktualnych
  informacji: newsy, ceny, kursy walut, wyniki, "kto jest teraz…", "ile kosztuje…".
- Narzędzie readWebPage — używaj go, gdy użytkownik poda URL albo gdy chcesz
  przeczytać konkretną stronę/artykuł znaleziony w wyszukiwarce.

Zasady:
- Gdy pytanie da się rozstrzygnąć z aktualnych danych — NAJPIERW sięgnij do internetu,
  potem odpowiadaj. Nie zgaduj cen ani dat z pamięci.
- Gdy pytanie NIE wymaga internetu (np. "opowiedz żart", "przetłumacz zdanie",
  proste obliczenie) — odpowiadaj wprost, BEZ szukania.
- Zawsze podawaj konkretne liczby/fakty i — jeśli je masz — źródła (linki).
- Odpowiadaj po polsku, zwięźle, w markdownie (nagłówki, listy, pogrubienia).`;

export async function POST(req: Request) {
  const { messages }: { messages: UIMessage[] } = await req.json();

  const result = streamText({
    model: google("gemini-3.1-flash-lite"),
    system: SYSTEM,
    messages: await convertToModelMessages(messages),
    tools: {
      // Wbudowane wyszukiwanie Google (grounding) — TYLKO gdy włączone env varem
      // (płatne!). Domyślnie agent korzysta wyłącznie z darmowego readWebPage.
      ...(SEARCH_GROUNDING
        ? { google_search: google.tools.googleSearch({}) }
        : {}),
      // Nasze własne narzędzie do czytania konkretnych stron (darmowe).
      readWebPage,
    },
    // Pozwól na wieloetapową pracę: szukaj → przeczytaj stronę → odpowiedz.
    stopWhen: stepCountIs(maxSteps),
  });

  // sendSources: true → części "source-url" (linki z groundingu) trafiają do klienta.
  return result.toUIMessageStreamResponse({ sendSources: true });
}
