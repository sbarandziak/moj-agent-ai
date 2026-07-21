import { tool } from "ai";
import { z } from "zod";
import { queryKnowledge } from "@/lib/knowledge";

// ---------------------------------------------------------------------------
// Wspólne narzędzia agenta ReAct (Lekcja 4).
//
// W3 (obsługa błędów) wymaga, żeby KAŻDE narzędzie robiące fetch() do
// zewnętrznego API:
//   1. miało timeout 5 s (AbortController) — nie wieszamy agenta na wolnym API,
//   2. obsługiwało błędy gracefully — zwracało { error } zamiast rzucać wyjątek,
//   3. sprawdzało status HTTP — !res.ok → czytelny komunikat.
// Dodatkowo (W3 §2) każde narzędzie waliduje parametry wejściowe.
//
// Narzędzie NIGDY nie rzuca — zawsze zwraca albo dane, albo { error: "..." }.
// Dzięki temu model dostaje czytelny komunikat i może zareagować (patrz
// system prompt bezpieczeństwa w route.ts), a UI potrafi policzyć błędy.
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 5000;

/** fetch z twardym timeoutem 5 s. Po przekroczeniu rzuca AbortError. */
async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/** Zamienia wyjątek z fetch na czytelny { error }. */
function connectionError(err: unknown): { error: string } {
  if (err instanceof Error && err.name === "AbortError") {
    return {
      error: "Timeout — serwer nie odpowiedział w 5 sekund. Spróbuj ponownie.",
    };
  }
  return {
    error: `Błąd połączenia: ${err instanceof Error ? err.message : "nieznany błąd"}`,
  };
}

// --- Pogoda (Open-Meteo, bez klucza API) -----------------------------------

// Kody pogody Open-Meteo (WMO) → opis PL + emoji (podzbiór najczęstszych).
const WEATHER_CODES: Record<number, { label: string; emoji: string }> = {
  0: { label: "bezchmurnie", emoji: "☀️" },
  1: { label: "przeważnie słonecznie", emoji: "🌤️" },
  2: { label: "częściowe zachmurzenie", emoji: "⛅" },
  3: { label: "pochmurno", emoji: "☁️" },
  45: { label: "mgła", emoji: "🌫️" },
  48: { label: "szadź", emoji: "🌫️" },
  51: { label: "mżawka", emoji: "🌦️" },
  53: { label: "mżawka", emoji: "🌦️" },
  55: { label: "gęsta mżawka", emoji: "🌧️" },
  61: { label: "lekki deszcz", emoji: "🌧️" },
  63: { label: "deszcz", emoji: "🌧️" },
  65: { label: "ulewny deszcz", emoji: "🌧️" },
  71: { label: "lekki śnieg", emoji: "🌨️" },
  73: { label: "śnieg", emoji: "🌨️" },
  75: { label: "intensywny śnieg", emoji: "❄️" },
  80: { label: "przelotne opady", emoji: "🌦️" },
  81: { label: "przelotne opady", emoji: "🌧️" },
  82: { label: "gwałtowne opady", emoji: "⛈️" },
  95: { label: "burza", emoji: "⛈️" },
  96: { label: "burza z gradem", emoji: "⛈️" },
  99: { label: "burza z gradem", emoji: "⛈️" },
};

export const getWeather = tool({
  description:
    "Sprawdza aktualną pogodę w podanym mieście (temperatura, opis, wiatr, wilgotność).",
  inputSchema: z.object({
    city: z.string().describe("Nazwa miasta, np. Warszawa, Berlin, Tokyo"),
  }),
  execute: async ({ city }) => {
    // W3 §2: walidacja parametrów.
    if (!city || !city.trim()) return { error: "Podaj nazwę miasta" };

    try {
      // 1. Geokodowanie: nazwa miasta → współrzędne.
      const geoRes = await fetchWithTimeout(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
          city.trim(),
        )}&count=1&language=pl&format=json`,
      );
      if (!geoRes.ok) {
        return {
          error: `API geokodowania zwróciło błąd ${geoRes.status}. Sprawdź parametry.`,
        };
      }
      const geo = await geoRes.json();
      const place = geo.results?.[0];
      if (!place) {
        return { error: `Nie znalazłem miasta ${city}. Sprawdź pisownię.` };
      }

      // 2. Prognoza dla znalezionych współrzędnych.
      const wxRes = await fetchWithTimeout(
        `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}` +
          `&longitude=${place.longitude}` +
          `&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m`,
      );
      if (!wxRes.ok) {
        return {
          error: `API pogodowe zwróciło błąd ${wxRes.status}. Sprawdź parametry.`,
        };
      }
      const wx = await wxRes.json();
      const c = wx.current;
      const desc = WEATHER_CODES[c.weather_code] ?? {
        label: "nieznana pogoda",
        emoji: "❓",
      };

      return {
        city: place.name,
        country: place.country,
        temperature: c.temperature_2m,
        unit: "°C",
        description: desc.label,
        emoji: desc.emoji,
        windKmh: c.wind_speed_10m,
        humidity: c.relative_humidity_2m,
      };
    } catch (err) {
      return connectionError(err);
    }
  },
});

// --- Kurs waluty (NBP, tabela A) --------------------------------------------

export const getExchangeRate = tool({
  description:
    "Sprawdza aktualny kurs waluty względem PLN wg NBP (tabela A). " +
    "Zwraca ile PLN kosztuje 1 jednostka danej waluty.",
  inputSchema: z.object({
    currency: z
      .string()
      .describe("3-literowy kod waluty ISO, np. EUR, USD, GBP, CHF"),
  }),
  execute: async ({ currency }) => {
    // W3 §2: kod musi być 3-literowy.
    const code = currency?.trim().toUpperCase() ?? "";
    if (!/^[A-Z]{3}$/.test(code)) {
      return { error: "Podaj 3-literowy kod waluty (np. EUR, USD)" };
    }

    try {
      const res = await fetchWithTimeout(
        `https://api.nbp.pl/api/exchangerates/rates/A/${code}/?format=json`,
      );
      // NBP zwraca 404, gdy nie zna waluty.
      if (res.status === 404) {
        return {
          error: `Waluta ${code} nie jest w tabeli NBP. Popularne: EUR, USD, GBP, CHF`,
        };
      }
      if (!res.ok) {
        return { error: `API NBP zwróciło błąd ${res.status}. Sprawdź parametry.` };
      }
      const data = await res.json();
      const rate = data.rates?.[0];
      if (!rate) {
        return {
          error: `Waluta ${code} nie jest w tabeli NBP. Popularne: EUR, USD, GBP, CHF`,
        };
      }
      return {
        currency: code,
        name: data.currency,
        rate: rate.mid,
        date: rate.effectiveDate,
        info: `1 ${code} = ${rate.mid} PLN`,
      };
    } catch (err) {
      return connectionError(err);
    }
  },
});

// --- Święta / dni wolne (Nager.Date) ----------------------------------------

export const getHolidays = tool({
  description:
    "Zwraca listę świąt / dni wolnych od pracy w danym kraju i roku.",
  inputSchema: z.object({
    country: z
      .string()
      .describe("2-literowy kod kraju ISO, np. PL, DE, US, GB, FR"),
    year: z
      .number()
      .optional()
      .describe("Rok, np. 2026. Domyślnie bieżący rok."),
  }),
  execute: async ({ country, year }) => {
    // W3 §2: kod kraju musi być 2-literowy.
    const code = country?.trim().toUpperCase() ?? "";
    if (!/^[A-Z]{2}$/.test(code)) {
      return { error: "Podaj 2-literowy kod kraju (np. PL, DE, US)" };
    }
    const y = year ?? new Date().getFullYear();

    try {
      const res = await fetchWithTimeout(
        `https://date.nager.at/api/v3/PublicHolidays/${y}/${code}`,
      );
      if (res.status === 404) {
        return {
          error: `Nie znalazłem świąt dla kraju ${code}. Popularne: PL, DE, US, GB, FR`,
        };
      }
      if (!res.ok) {
        return {
          error: `API świąt zwróciło błąd ${res.status}. Sprawdź parametry.`,
        };
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        return {
          error: `Nie znalazłem świąt dla kraju ${code}. Popularne: PL, DE, US, GB, FR`,
        };
      }
      return {
        country: code,
        year: y,
        count: data.length,
        holidays: data.map((h: { date: string; localName: string; name: string }) => ({
          date: h.date,
          name: h.localName,
          englishName: h.name,
        })),
      };
    } catch (err) {
      return connectionError(err);
    }
  },
});

// --- Wikipedia (PL) ---------------------------------------------------------

export const searchWikipedia = tool({
  description:
    "Szuka hasła w polskiej Wikipedii i zwraca streszczenie oraz link do artykułu.",
  inputSchema: z.object({
    query: z.string().describe("Hasło do wyszukania, np. Berlin, Hanami, ReAct"),
  }),
  execute: async ({ query }) => {
    if (!query || !query.trim()) return { error: "Podaj hasło do wyszukania" };

    try {
      // 1. Znajdź najlepiej pasujący tytuł artykułu.
      const searchRes = await fetchWithTimeout(
        `https://pl.wikipedia.org/w/api.php?action=query&list=search` +
          `&srsearch=${encodeURIComponent(query.trim())}` +
          `&format=json&srlimit=1&origin=*`,
      );
      if (!searchRes.ok) {
        return {
          error: `Wikipedia zwróciła błąd ${searchRes.status}. Sprawdź parametry.`,
        };
      }
      const searchData = await searchRes.json();
      const hit = searchData.query?.search?.[0];
      if (!hit) {
        return { error: `Nie znalazłem w Wikipedii hasła "${query}".` };
      }

      // 2. Pobierz streszczenie znalezionego artykułu.
      const summaryRes = await fetchWithTimeout(
        `https://pl.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
          hit.title,
        )}`,
      );
      if (!summaryRes.ok) {
        return {
          error: `Wikipedia zwróciła błąd ${summaryRes.status}. Sprawdź parametry.`,
        };
      }
      const s = await summaryRes.json();
      return {
        title: s.title,
        extract: s.extract,
        url: s.content_urls?.desktop?.page,
      };
    } catch (err) {
      return connectionError(err);
    }
  },
});

// --- Czytanie dowolnej strony WWW -------------------------------------------
// (Ta sama logika co w /api/search — timeout 5 s + obsługa błędów HTTP.)

export const readWebPage = tool({
  description:
    "Pobiera i czyta zawartość strony internetowej. Używaj gdy użytkownik poda URL " +
    "lub gdy chcesz przeczytać artykuł/stronę znalezioną w wyszukiwarce.",
  inputSchema: z.object({
    url: z
      .string()
      .describe("Pełny adres URL strony, np. https://example.com/artykul"),
  }),
  execute: async ({ url }) => {
    try {
      const res = await fetchWithTimeout(url, {
        headers: {
          // Część serwerów blokuje żądania bez nagłówka User-Agent.
          "User-Agent":
            "Mozilla/5.0 (compatible; MojAgent/1.0; +https://example.com/bot)",
        },
      });

      if (!res.ok) {
        return {
          url,
          error: `Strona zwróciła błąd HTTP ${res.status} (${res.statusText}).`,
        };
      }

      const html = await res.text();

      // Wyciągnij czysty tekst z HTML.
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
        .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, " ")
        .trim();

      if (!text) {
        return { url, error: "Nie udało się wyciągnąć tekstu ze strony (pusta treść)." };
      }

      return {
        url,
        content: text.slice(0, 3000),
        truncated: text.length > 3000,
        length: text.length,
      };
    } catch (err) {
      const e = connectionError(err);
      return { url, error: e.error };
    }
  },
});

// --- Kalkulator (bez fetch, ale z walidacją bezpieczeństwa) -----------------

export const calculator = tool({
  description:
    "Oblicza wyrażenie matematyczne, np. (2+3)*4, 3000/4.28, 15%*200.",
  inputSchema: z.object({
    expression: z
      .string()
      .describe("Wyrażenie matematyczne z liczbami i operatorami + - * / % ( )"),
  }),
  execute: async ({ expression }) => {
    const expr = expression?.trim() ?? "";
    if (!expr) return { error: "Podaj wyrażenie do obliczenia" };

    // W3 §2: blokuj niebezpieczne konstrukcje (RCE przez Function/eval).
    if (/import|require|eval|process|function|=>|;|`|\[|\]/i.test(expr)) {
      return { error: "Wyrażenie zawiera niedozwolone znaki" };
    }
    // Dopuszczamy WYŁĄCZNIE znaki arytmetyczne.
    if (!/^[0-9+\-*/%.,()\s]+$/.test(expr)) {
      return { error: "Wyrażenie zawiera niedozwolone znaki" };
    }

    try {
      // Przecinek dziesiętny → kropka. Wyrażenie zawiera już tylko cyfry i
      // operatory, więc Function jest tu bezpieczne.
      const result = Function(`"use strict"; return (${expr.replace(/,/g, ".")})`)();
      if (typeof result !== "number" || !Number.isFinite(result)) {
        return { error: `Nie mogę obliczyć: ${expr}` };
      }
      return { expression: expr, result };
    } catch {
      return { error: `Nie mogę obliczyć: ${expr}` };
    }
  },
});

// --- Notatnik agenta (pamięć w procesie, bez fetch) -------------------------
// Prosty magazyn w pamięci modułu. W dev (jeden proces Next) notatki żyją
// między requestami — wystarcza, by agent zapisał wyniki w jednym kroku i
// odczytał je w kolejnym (scenariusz "przelicz waluty i zapisz").

type Note = { id: number; text: string; savedAt: string };

const notes: Note[] = [];
let noteSeq = 0;

export const saveNote = tool({
  description:
    "Zapisuje notatkę w pamięci agenta (np. wynik przeliczenia, kurs waluty, " +
    "podsumowanie). Używaj gdy użytkownik prosi 'zapisz' albo chcesz zachować " +
    "dane na później.",
  inputSchema: z.object({
    text: z.string().describe("Treść notatki do zapisania"),
  }),
  execute: async ({ text }) => {
    const t = text?.trim() ?? "";
    if (!t) return { error: "Pusta notatka — podaj treść do zapisania" };

    const note: Note = {
      id: ++noteSeq,
      text: t,
      savedAt: new Date().toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }),
    };
    notes.push(note);
    return {
      saved: true,
      id: note.id,
      savedAt: note.savedAt,
      total: notes.length,
      info: `Zapisano notatkę #${note.id}. Łącznie notatek: ${notes.length}.`,
    };
  },
});

export const getNotes = tool({
  description:
    "Zwraca wszystkie notatki zapisane wcześniej przez agenta w tej sesji.",
  inputSchema: z.object({}),
  execute: async () => {
    if (notes.length === 0) {
      return { count: 0, notes: [], info: "Brak zapisanych notatek." };
    }
    return {
      count: notes.length,
      notes: notes.map((n) => ({ id: n.id, text: n.text, savedAt: n.savedAt })),
    };
  },
});

// --- Aktualna data i godzina (bez fetch) ------------------------------------

export const currentDateTime = tool({
  description: "Zwraca aktualną datę i godzinę (strefa Europe/Warsaw).",
  inputSchema: z.object({}),
  execute: async () => {
    const now = new Date();
    return {
      iso: now.toISOString(),
      pl: now.toLocaleString("pl-PL", { timeZone: "Europe/Warsaw" }),
      year: now.getFullYear(),
    };
  },
});

// --- Baza wiedzy firmy (RAG — Lekcja 06, W3) --------------------------------
// Retrieval: zamiast zmyślać, agent szuka w wektorowej bazie Supabase.
//   1. embedding pytania (ten sam model 768D co w /upload),
//   2. RPC match_documents (cosine <=>) — najbliższe fragmenty,
//   3. zwróć fragmenty + similarity (albo total_found=0 → agent mówi "nie wiem").
// Jak każde narzędzie: NIGDY nie rzuca — przy błędzie zwraca { error }.

export const searchKnowledge = tool({
  description:
    "Wyszukuje informacje w bazie wiedzy firmy (cenniki, FAQ, regulaminy, oferty). " +
    "Używaj ZAWSZE gdy użytkownik pyta o:\n" +
    "- ceny, pakiety, koszty\n" +
    "- procedury, regulaminy, warunki\n" +
    "- FAQ, pytania o firmę/usługi\n" +
    "- cokolwiek co może być w dokumentach firmowych",
  inputSchema: z.object({
    query: z
      .string()
      .describe('Pytanie użytkownika, np. "ile kosztuje pakiet premium"'),
  }),
  execute: async ({ query }) => {
    // Cała logika (embedding → match_documents → źródła) jest w lib/knowledge.ts,
    // współdzielona z endpointem /api/knowledge-search (podgląd na stronie /knowledge).
    return await queryKnowledge(query);
  },
});

// Komplet narzędzi agenta — używany przez /api/react (i gotowy dla /travel).
export const reactTools = {
  getWeather,
  getExchangeRate,
  getHolidays,
  searchWikipedia,
  readWebPage,
  calculator,
  currentDateTime,
  saveNote,
  getNotes,
  searchKnowledge,
};
