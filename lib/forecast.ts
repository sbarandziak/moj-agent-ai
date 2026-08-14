// ---------------------------------------------------------------------------
// Prognoza 7-dniowa (Open-Meteo, bez klucza API).
//
// Współdzielona przez DWA miejsca — tak jak lib/knowledge.ts obsługuje
// jednocześnie narzędzie agenta i endpoint podglądu:
//   - narzędzie getWeeklyForecast (app/api/react/tools.ts) → asystent podróży,
//   - kartę „Prognoza na tydzień" na dashboardzie (app/api/dashboard/route.ts).
//
// Dzięki temu agent i dashboard liczą „najlepszy dzień" tą SAMĄ metodą — gdyby
// każdy liczył po swojemu, użytkownik dostawałby dwie różne odpowiedzi na to
// samo pytanie.
//
// Zasada z W3: nigdy nie rzucamy wyjątkiem — zwracamy albo dane, albo { error }.
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 5000;

// Kody pogody WMO → opis PL + emoji.
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

export type ForecastDay = {
  date: string; // "2026-08-15"
  weekday: string; // "pt"
  tempMax: number;
  tempMin: number;
  emoji: string;
  description: string;
  precipMm: number;
  precipChance: number; // %
  windKmh: number;
  score: number; // 0-100: jak dobry to dzień na zwiedzanie
};

export type ForecastOk = {
  city: string;
  country: string;
  days: ForecastDay[];
  bestDay: ForecastDay;
  packing: string[];
  summary: string;
};

export type ForecastResult = ForecastOk | { error: string };

export function isForecastError(v: ForecastResult): v is { error: string } {
  return "error" in v;
}

async function getJson(url: string): Promise<unknown | { __error: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "MojAgent/1.0 Forecast" },
      cache: "no-store",
    });
    if (!res.ok) return { __error: `HTTP ${res.status}` };
    return await res.json();
  } catch (err) {
    return {
      __error:
        err instanceof Error && err.name === "AbortError"
          ? "Timeout — serwer pogodowy nie odpowiedział w 5 sekund."
          : "Błąd połączenia z serwerem pogodowym.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isFetchError(v: unknown): v is { __error: string } {
  return !!v && typeof v === "object" && "__error" in v;
}

// Ocena dnia 0-100 — celowo prosta i JAWNA, żeby dało się ją wytłumaczyć
// użytkownikowi ("czemu wtorek, a nie środa?"). Punkt odniesienia to 21°C:
// każdy stopień odchylenia kosztuje 2 pkt, szansa opadów pół punktu za procent,
// a wiatr karany dopiero powyżej 20 km/h, bo niżej nie przeszkadza w zwiedzaniu.
function scoreDay(tempMax: number, tempMin: number, precipChance: number, windKmh: number): number {
  const avg = (tempMax + tempMin) / 2;
  const kara =
    Math.abs(avg - 21) * 2 + precipChance * 0.5 + Math.max(0, windKmh - 20) * 1;
  return Math.max(0, Math.min(100, Math.round(100 - kara)));
}

// Co spakować — wnioski z całego tygodnia, nie z jednego dnia.
function packingAdvice(days: ForecastDay[]): string[] {
  const rady: string[] = [];
  const maxTemp = Math.max(...days.map((d) => d.tempMax));
  const minTemp = Math.min(...days.map((d) => d.tempMin));
  const maxDeszcz = Math.max(...days.map((d) => d.precipChance));
  const maxWiatr = Math.max(...days.map((d) => d.windKmh));
  const najwiekszaAmplituda = Math.max(...days.map((d) => d.tempMax - d.tempMin));

  if (minTemp < 0) rady.push("🧤 Zimowa kurtka, czapka i rękawiczki — będzie mróz.");
  else if (minTemp < 10) rady.push("🧥 Ciepła kurtka na poranki i wieczory.");

  if (maxTemp > 25) rady.push("🧴 Lekkie ubrania, nakrycie głowy i krem z filtrem.");
  if (maxDeszcz >= 40) rady.push("☔ Parasol lub kurtka przeciwdeszczowa.");
  if (maxWiatr > 35) rady.push("💨 Wiatrówka — prognozowane silne podmuchy.");
  if (najwiekszaAmplituda > 12)
    rady.push("🧅 Ubieraj się na cebulkę — duże wahania dobowe temperatury.");

  if (rady.length === 0) rady.push("👕 Pogoda łagodna — wystarczy standardowy zestaw.");
  return rady;
}

/**
 * Prognoza na najbliższe dni dla miasta.
 * @param city  nazwa miasta (geokodowanie po nazwie)
 * @param days  ile dni, 1-16 (domyślnie 7)
 */
export async function getWeeklyForecast(city: string, days = 7): Promise<ForecastResult> {
  const nazwa = city?.trim() ?? "";
  if (!nazwa) return { error: "Podaj nazwę miasta." };

  const ile = Math.max(1, Math.min(16, Math.round(days) || 7));

  // 1. Geokodowanie: nazwa miasta → współrzędne.
  const geo = await getJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      nazwa,
    )}&count=1&language=pl&format=json`,
  );
  if (isFetchError(geo)) return { error: geo.__error };

  const place = (geo as { results?: Array<Record<string, string | number>> }).results?.[0];
  if (!place) return { error: `Nie znalazłem miasta „${nazwa}". Sprawdź pisownię.` };

  // 2. Prognoza dzienna. timezone=auto — daty mają być w strefie miasta,
  //    inaczej „jutro" w Tokio wypadałoby o dzień za wcześnie.
  const wx = await getJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}` +
      `&longitude=${place.longitude}` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,` +
      `precipitation_sum,precipitation_probability_max,wind_speed_10m_max` +
      `&timezone=auto&forecast_days=${ile}`,
  );
  if (isFetchError(wx)) return { error: wx.__error };

  const d = (wx as { daily?: Record<string, Array<number | string>> }).daily;
  if (!d?.time?.length) return { error: "Serwer pogodowy nie zwrócił prognozy." };

  const lista: ForecastDay[] = (d.time as string[]).map((data, i) => {
    const kod = Number(d.weather_code[i]);
    const opis = WEATHER_CODES[kod] ?? { label: "nieznana pogoda", emoji: "❓" };
    const tempMax = Math.round(Number(d.temperature_2m_max[i]));
    const tempMin = Math.round(Number(d.temperature_2m_min[i]));
    const precipChance = Math.round(Number(d.precipitation_probability_max[i]) || 0);
    const windKmh = Math.round(Number(d.wind_speed_10m_max[i]) || 0);

    return {
      date: data,
      // pl-PL daje skróty z kropką i różnej długości („pt.", „niedz.") —
      // w pasku 7 kolumn to się rozjeżdża, więc kropkę ucinamy.
      weekday: new Date(data + "T00:00:00")
        .toLocaleDateString("pl-PL", { weekday: "short" })
        .replace(/\.$/, ""),
      tempMax,
      tempMin,
      emoji: opis.emoji,
      description: opis.label,
      precipMm: Math.round(Number(d.precipitation_sum[i]) * 10) / 10 || 0,
      precipChance,
      windKmh,
      score: scoreDay(tempMax, tempMin, precipChance, windKmh),
    };
  });

  const bestDay = lista.reduce((a, b) => (b.score > a.score ? b : a));
  const srednia = Math.round(lista.reduce((s, x) => s + x.tempMax, 0) / lista.length);
  const deszczowe = lista.filter((x) => x.precipChance >= 40).length;

  return {
    city: place.name as string,
    country: (place.country as string) ?? "",
    days: lista,
    bestDay,
    packing: packingAdvice(lista),
    summary:
      `Średnia temperatura maksymalna: ${srednia}°C. ` +
      (deszczowe === 0
        ? "Bez dni z wysokim ryzykiem opadów."
        : `Dni z ryzykiem opadów: ${deszczowe} z ${lista.length}.`) +
      ` Najlepszy dzień na zwiedzanie: ${bestDay.weekday} (${bestDay.date}).`,
  };
}
