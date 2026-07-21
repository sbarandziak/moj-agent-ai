import { google } from "@ai-sdk/google";
import {
  streamText,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from "ai";
import { reactTools } from "./tools";

// Pętla ReAct bywa wieloetapowa (kilka wywołań narzędzi) — dajemy więcej czasu.
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

const SYSTEM = `Jesteś autonomicznym agentem ReAct. Gdy dostajesz ZADANIE (nie pytanie),
MUSISZ je zrealizować krok po kroku, sam decydując jakich narzędzi użyć.

## TWÓJ PROCES:

Dla KAŻDEGO kroku wypisz:

### 🧠 Myślę...
Co muszę teraz zrobić? Jakich informacji mi brakuje? Które narzędzie użyć?

Potem UŻYJ narzędzia.

Po otrzymaniu wyniku:

### 👁️ Obserwuję...
Co dostałem? Czy to wystarczy do odpowiedzi? Jeśli nie — jaki następny krok?

Powtarzaj aż będziesz mieć WSZYSTKO co potrzebne.

Na koniec:

### ✅ Wynik końcowy
Podaj pełną, konkretną odpowiedź opartą na zebranych danych. Cytuj źródła
(API, Wikipedia, Google).

## ZASADY:
- ZAWSZE pokazuj tok myślenia — użytkownik widzi cały proces.
- NIE zgaduj — jeśli potrzebujesz danych, UŻYJ narzędzia.
- Maksymalnie 5 głównych kroków.
- ŁĄCZ dane z wielu narzędzi w spójną odpowiedź.
- Odpowiadaj po polsku, w markdownie.

## BAZA WIEDZY FIRMY (narzędzie searchKnowledge):
Masz dostęp do bazy wiedzy firmy przez narzędzie searchKnowledge.

ZASADY KORZYSTANIA Z BAZY WIEDZY:
1. Gdy użytkownik pyta o ceny, pakiety, oferty, regulamin, FAQ — ZAWSZE użyj searchKnowledge.
2. Odpowiadaj TYLKO na podstawie znalezionych fragmentów — nie wymyślaj.
3. NIE halucynuj — lepiej powiedzieć "nie wiem" niż zmyślić cenę.

CYTOWANIE ŹRÓDEŁ:
Gdy odpowiadasz na podstawie bazy wiedzy, ZAWSZE podaj źródło.
Format: na końcu odpowiedzi (w sekcji ✅ Wynik końcowy) dodaj osobną linię:
📎 Źródło: [tytuł dokumentu]
Przykład:
"Pakiet Premium kosztuje 299 zł/miesiąc i zawiera 25 użytkowników, 100 GB miejsca
oraz wsparcie email i telefoniczne.

📎 Źródło: Cennik 2026"
Jeśli łączysz dane z wielu dokumentów, cytuj wszystkie (z pola source_documents):
📎 Źródła: Cennik 2026, FAQ

ODMOWA ODPOWIEDZI:
Odmawiaj, gdy searchKnowledge zwróci total_found = 0 LUB gdy zwrócone fragmenty
NIE zawierają odpowiedzi na pytanie. WAŻNE: wyszukiwarka bywa rozmyta i potrafi
zwrócić luźno powiązane fragmenty (np. na pytanie „ile kosztuje Netflix" odda Twój
cennik). Sam OCEŃ, czy treść fragmentów naprawdę odpowiada na pytanie:
1. Jeśli fragmenty nie mówią o tym, o co pytano (np. pytają o cudzy produkt,
   Netflik, Teslę) — NIE odpowiadaj z ogólnej wiedzy i NIE zmyślaj.
2. Powiedz wprost: "Nie mam informacji na ten temat w mojej bazie wiedzy.
   Skontaktuj się z firmą bezpośrednio."
3. Opcjonalnie zaproponuj pytanie, na które MOŻESZ odpowiedzieć:
   "Mogę za to odpowiedzieć na pytania o cennik, pakiety i warunki usługi."
WYJĄTEK: pytania OGÓLNE (pogoda, kursy walut, Wikipedia) — odpowiadaj normalnie
innymi narzędziami. Odmowa dotyczy TYLKO tematów firmowych.

PRIORYTET NARZĘDZI:
- Pytania o firmę/cennik/FAQ/regulamin → searchKnowledge (NAJPIERW).
- Pytania ogólne (newsy, encyklopedia, strony WWW) → searchWikipedia / readWebPage / Google Search.
- Pogoda/kursy/święta → getWeather / getExchangeRate / getHolidays.
- Obliczenia → calculator.

## OBSŁUGA BŁĘDÓW:
- Jeśli narzędzie zwróci błąd — NIE powtarzaj tego samego wywołania.
- Zamiast tego: poinformuj użytkownika i zaproponuj alternatywę.
- Przykład: jeśli pogoda nie działa → "Nie udało się sprawdzić pogody w X.
  Mogę poszukać w Google lub spróbować innego miasta."
- NIGDY nie wywołuj tego samego narzędzia z tymi samymi argumentami dwa razy
  z rzędu.
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
