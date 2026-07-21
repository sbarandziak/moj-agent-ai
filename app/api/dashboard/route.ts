// Agregator danych dla dashboardu (W4). Pobiera PRAWDZIWE dane bezpośrednio
// z publicznych API (bez klucza, bez modelu) — żeby dashboard ładował się szybko:
//   - pogoda: Open-Meteo
//   - kursy: NBP (tabela A, ostatnie 2 notowania → zmiana ↑/↓)
//   - święta: Nager.Date
// Wszystko po stronie serwera → brak problemów z CORS, równoległe fetch.

export const dynamic = "force-dynamic"; // zawsze świeże dane

const TIMEOUT_MS = 5000;

async function getJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "MojAgent/1.0 Dashboard" },
      cache: "no-store",
    });
    if (!res.ok) return { __error: `HTTP ${res.status}` };
    return await res.json();
  } catch (err) {
    return {
      __error: err instanceof Error && err.name === "AbortError" ? "timeout" : "network",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function hasError(v: unknown): v is { __error: string } {
  return !!v && typeof v === "object" && "__error" in v;
}

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

async function loadWeather(city: string) {
  const geo = await getJson(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      city,
    )}&count=1&language=pl&format=json`,
  );
  if (hasError(geo)) return { error: "Nie udało się pobrać pogody." };
  const place = (geo as { results?: Array<Record<string, number | string>> }).results?.[0];
  if (!place) return { error: `Nie znalazłem miasta ${city}.` };

  const wx = await getJson(
    `https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}` +
      `&longitude=${place.longitude}` +
      `&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m`,
  );
  if (hasError(wx)) return { error: "Nie udało się pobrać pogody." };
  const c = (wx as { current: Record<string, number> }).current;
  const desc = WEATHER_CODES[c.weather_code] ?? { label: "nieznana pogoda", emoji: "❓" };

  return {
    city: place.name as string,
    country: place.country as string,
    temperature: c.temperature_2m,
    description: desc.label,
    emoji: desc.emoji,
    windKmh: c.wind_speed_10m,
    humidity: c.relative_humidity_2m,
  };
}

async function loadRate(code: string) {
  // last/2 → poprzednie i bieżące notowanie, żeby policzyć zmianę.
  const data = await getJson(
    `https://api.nbp.pl/api/exchangerates/rates/A/${code}/last/2/?format=json`,
  );
  if (hasError(data)) return { code, error: true };
  const rates = (data as { rates?: Array<{ mid: number; effectiveDate: string }> }).rates;
  if (!rates || rates.length === 0) return { code, error: true };
  const current = rates[rates.length - 1];
  const prev = rates.length > 1 ? rates[0] : null;
  const change = prev ? +(current.mid - prev.mid).toFixed(4) : 0;
  return { code, mid: current.mid, date: current.effectiveDate, change };
}

async function loadHolidays(country: string, year: number) {
  const data = await getJson(
    `https://date.nager.at/api/v3/PublicHolidays/${year}/${country}`,
  );
  if (hasError(data) || !Array.isArray(data)) {
    return { error: "Nie udało się pobrać świąt." };
  }
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const msDay = 1000 * 60 * 60 * 24;

  const upcoming = (data as Array<{ date: string; localName: string }>)
    .map((h) => {
      const d = new Date(h.date + "T00:00:00");
      const daysUntil = Math.round((d.getTime() - today.getTime()) / msDay);
      return { date: h.date, name: h.localName, daysUntil };
    })
    .filter((h) => h.daysUntil >= 0)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 4);

  return {
    upcoming,
    nextInDays: upcoming.length > 0 ? upcoming[0].daysUntil : null,
  };
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get("city")?.trim() || "Warszawa";
  const now = new Date();
  const year = now.getFullYear();

  // Wszystkie źródła równolegle — dashboard ma być szybki.
  const [weather, eur, usd, holidays] = await Promise.all([
    loadWeather(city),
    loadRate("EUR"),
    loadRate("USD"),
    loadHolidays("PL", year),
  ]);

  return Response.json({
    datetime: {
      weekday: now.toLocaleDateString("pl-PL", {
        weekday: "long",
        timeZone: "Europe/Warsaw",
      }),
      dateLabel: now.toLocaleDateString("pl-PL", {
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "Europe/Warsaw",
      }),
    },
    weather,
    rates: [eur, usd],
    holidays,
  });
}
