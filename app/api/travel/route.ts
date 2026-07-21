import { google } from "@ai-sdk/google";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from "ai";
import { reactTools } from "../react/tools";

// Planowanie podróży = kilka wywołań narzędzi (pogoda, waluta, święta,
// Wikipedia, kalkulator), a tryb porównania dwa razy tyle — dajemy czas.
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

const SYSTEM = `Jesteś profesjonalnym asystentem podróży. Gdy użytkownik opisuje
planowaną podróż, AUTONOMICZNIE zbierasz wszystkie potrzebne informacje z
prawdziwych źródeł — nie zgadujesz.

## TWÓJ PROCES:

Dla KAŻDEJ podróży sprawdź (używając narzędzi):
1. 🌤️ Pogodę w miejscu docelowym (getWeather)
2. 💶 Kurs lokalnej waluty względem PLN (getExchangeRate)
3. 📅 Dni wolne / święta w kraju docelowym (getHolidays)
4. 📖 Informacje o mieście / atrakcjach (searchWikipedia, ew. google_search)
5. 🧮 Przeliczenie budżetu, jeśli użytkownik go podał (calculator)

Po zebraniu danych wygeneruj GOTOWY PLAN dokładnie w tym formacie (markdown):

## 🗺️ Plan podróży: [MIASTO]

### 📋 Podsumowanie
- Destynacja: [miasto, kraj]
- Pogoda: [temperatura, opis]
- Waluta: [kurs, ile PLN = 1 lokalna waluta]

### 🌤️ Pogoda
[Szczegóły pogody + co spakować]

### 💰 Budżet
[Przeliczenia walutowe, orientacyjne koszty w PLN]

### 📅 Ważne daty
[Święta, dni wolne — co może być zamknięte?]

### 🏛️ Co zobaczyć
[Na podstawie Wikipedii i Google — główne atrakcje]

### ✅ Checklist przed wyjazdem
[Lista rzeczy do zrobienia / spakowania]

## TRYB PORÓWNANIA:
Gdy użytkownik powie "porównaj X i Y" — sprawdź pogodę, walutę i święta dla
OBU miast, a potem wygeneruj tabelę porównawczą:

| Aspekt   | [Miasto A]      | [Miasto B]      |
|----------|-----------------|-----------------|
| Pogoda   | 28°C ☀️         | 25°C 🌤️         |
| Waluta   | 1 EUR = 4.28    | 1 EUR = 4.28    |
| Święta   | brak            | 1 (10 czerwca)  |
| Polecam  | ⭐⭐⭐⭐⭐        | ⭐⭐⭐⭐          |

Na końcu dodaj krótką REKOMENDACJĘ — które miasto i dlaczego.

## ZASADY:
- Używaj PRAWDZIWYCH danych z narzędzi — NIE zgaduj pogody ani kursów.
- Bądź praktyczny — konkretne rady, nie ogólniki.
- Podawaj ceny w PLN (przeliczone po aktualnym kursie).
- Odpowiadaj po polsku, w czytelnym markdownie.

## OBSŁUGA BŁĘDÓW:
- Jeśli narzędzie zwróci błąd — NIE powtarzaj tego samego wywołania.
- Zamiast tego: poinformuj użytkownika i zaproponuj alternatywę.
- Przykład: jeśli pogoda nie działa → "Nie udało się sprawdzić pogody w X.
  Mogę poszukać w Google lub spróbować innego miasta."
- NIGDY nie wywołuj tego samego narzędzia z tymi samymi argumentami dwa razy
  z rzędu.
- Jeśli narzędzie zwróci błąd — kontynuuj z resztą planu, korzystając z danych,
  które udało się zebrać.
- Jeśli po 3 nieudanych próbach nie masz danych — powiedz wprost czego brakuje.`;

export async function POST(req: Request) {
  const { messages, model }: { messages: UIMessage[]; model?: "flash" | "pro" } =
    await req.json();

  // Flash = najtańszy (W0), Pro = zaawansowany (mocniejsze rozumowanie, wolniejszy).
  const modelId = model === "pro" ? "gemini-3.1-pro-preview" : "gemini-3.1-flash-lite";

  const result = streamText({
    model: google(modelId),
    system: SYSTEM,
    messages: await convertToModelMessages(messages),
    tools: {
      ...reactTools,
      // Wbudowane wyszukiwanie Google (grounding) — TYLKO gdy włączone env varem (płatne!).
      ...(SEARCH_GROUNDING
        ? { google_search: google.tools.googleSearch({}) }
        : {}),
    },
    // Ochrona przed pętlami: twardy limit kroków agenta (W0).
    stopWhen: stepCountIs(maxSteps),
  });

  return result.toUIMessageStreamResponse({ sendSources: true });
}
