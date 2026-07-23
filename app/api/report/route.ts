import { google } from "@ai-sdk/google";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from "ai";
// Reuse narzędzi z lekcji 04 — agent raportowy nie dostaje nic nowego,
// tylko trudniejsze zadanie (szukaj → analizuj → napisz).
import { readWebPage, searchWikipedia, calculator } from "../react/tools";

// Zbieranie danych + długi raport — dajemy maksimum czasu na stream.
export const maxDuration = 60;

// Raport wymaga kilku kroków (szukaj → czytaj → licz → pisz).
const maxSteps = 8;

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

// Dzisiejsza data — model nie zna jej z pamięci, a raport ma ją w nagłówku.
function today() {
  return new Date().toLocaleDateString("pl-PL", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function systemPrompt() {
  return `Jesteś profesjonalnym analitykiem biznesowym. Gdy użytkownik poda temat,
AUTONOMICZNIE zbierasz informacje i piszesz raport.

Dzisiejsza data: ${today()}.

## TWÓJ PROCES:
1. Przeanalizuj temat — co trzeba zbadać?
2. Szukaj danych: ${SEARCH_GROUNDING ? "Google Search, " : ""}Wikipedia (searchWikipedia), strony branżowe (readWebPage)
3. Zbierz fakty, liczby, statystyki (do przeliczeń użyj calculator)
4. Napisz raport w profesjonalnym formacie

## FORMAT RAPORTU:

# 📊 Raport: [TEMAT]
Data: ${today()}
Autor: Agent AI

## Streszczenie (Executive Summary)
[3-4 zdania — kluczowe wnioski]

## 1. Wprowadzenie
[Kontekst, dlaczego ten temat jest ważny]

## 2. Kluczowe dane i fakty
[Wylistowane punkty z danymi — ze źródłami]

## 3. Analiza
[Interpretacja danych, trendy, porównania]

## 4. Wnioski i rekomendacje
[Co z tego wynika? Co robić?]

## Źródła
[Lista użytych źródeł z linkami]

ZASADY:
- Używaj PRAWDZIWYCH danych — ${SEARCH_GROUNDING ? "Google Search, " : ""}Wikipedia, konkretne strony WWW
- Podawaj źródła przy każdym fakcie
- Bądź konkretny — liczby, daty, nazwy
- Raport powinien mieć 500-1000 słów
- Nie wymyślaj statystyk — szukaj!
- Gdy porównujesz opcje (np. dwie technologie) — dodaj tabelę porównawczą
- Gdy jakiegoś faktu nie udało się potwierdzić, napisz to wprost zamiast zgadywać
- Cały raport po polsku, w markdownie. Bez komentarza od siebie — sam raport.`;
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
      calculator,
    },
    // Twardy limit kroków agenta — ochrona przed pętlą narzędzi.
    stopWhen: stepCountIs(maxSteps),
  });

  // sendSources: true → linki z groundingu trafiają do klienta jako "source-url".
  return result.toUIMessageStreamResponse({ sendSources: true });
}
