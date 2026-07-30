import { google } from "@ai-sdk/google";
import { generateText } from "ai";
// Reuse narzędzi z Lekcji 04 — cron nie dostaje nic nowego, tylko sam
// (bez użytkownika) zbiera pogodę i kursy walut.
import { getWeather, getExchangeRate } from "@/app/api/react/tools";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { logUsage } from "@/lib/budget";

// Zbieranie danych z 3 API + generowanie briefingu — dajemy zapas czasu.
export const maxDuration = 30;

// System prompt: model dostaje surowe dane (pogoda, kursy, data) i składa
// z nich gotowy briefing w ustalonym formacie markdown.
const SYSTEM = `Jesteś osobistym asystentem. Napisz poranny briefing w formacie:

# ☀️ Dzień dobry! Twój briefing na [data]

## 🌤️ Pogoda
[temperatura, opis, co ubrać]

## 💶 Kursy walut
- EUR: [kurs] PLN
- USD: [kurs] PLN

## 📅 Dzisiejszy dzień
- Dzień tygodnia: [...]
- Uwagi: [czy dziś święto? dzień wolny?]

## 💡 Porada dnia
[Krótka, pozytywna porada na dzień]

ZASADY:
- Używaj WYŁĄCZNIE danych z sekcji "DANE" poniżej — nie zmyślaj temperatur ani kursów.
- Jeśli któreś dane mają pole "error", napisz krótko że były niedostępne — nie zgaduj.
- Cała treść po polsku, w markdownie. Zwróć SAM briefing, bez komentarza od siebie.`;

// Narzędzia z L04 to obiekty tool() — poza pętlą modelu wołamy ich execute()
// bezpośrednio, podając minimalne opcje (cron nie ma toolCallId ani historii).
// Wynik i tak trafia tylko do JSON.stringify, więc zwracamy `unknown`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callTool(t: any, args: Record<string, unknown>): Promise<unknown> {
  return t.execute(args, { toolCallId: "cron", messages: [] });
}

export async function GET(request: Request) {
  // W2 §2: endpoint jest publiczny dla ręcznego triggera z UI.
  // Vercel Cron samo go wołana automatycznie (każdego dnia o 7 UTC).
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${secret}`) {
      return Response.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
  }

  try {
    // 1-3. Zbierz dane. Każde narzędzie NIGDY nie rzuca — zwraca dane lub { error },
    // więc pojedyncza awaria API nie wywala całego briefingu.
    const now = new Date();
    const isoDate = now.toISOString().slice(0, 10); // "2026-07-28"
    const plDate = now.toLocaleDateString("pl-PL", {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Warsaw",
    });

    const [weather, eur, usd] = await Promise.all([
      callTool(getWeather, { city: "Warszawa" }),
      callTool(getExchangeRate, { currency: "EUR" }),
      callTool(getExchangeRate, { currency: "USD" }),
    ]);

    // 4. Wygeneruj briefing przez AI. Dane wstrzykujemy jako JSON w prompt,
    // żeby model niczego nie zgadywał.
    const dataBlock = `DANE (${plDate}, ${isoDate}):

Pogoda (Warszawa): ${JSON.stringify(weather)}
Kurs EUR: ${JSON.stringify(eur)}
Kurs USD: ${JSON.stringify(usd)}
Data: ${plDate} (${isoDate})

Napisz na ich podstawie poranny briefing.`;

    const { text, usage } = await generateText({
      model: google("gemini-3.1-flash-lite"),
      system: SYSTEM,
      prompt: dataBlock,
    });

    // W3 (L10): cron też kosztuje — logujemy go bez user_id (wywołanie
    // systemowe). Limit dzienny go nie dotyczy: nie ma właściciela, a i tak
    // odpala się raz dziennie.
    await logUsage({
      userId: null,
      tokensInput: usage.inputTokens,
      tokensOutput: usage.outputTokens,
      model: "gemini-3.1-flash-lite",
      endpoint: "/api/cron/morning",
    });

    // 5. Zapisz w Supabase (klient service_role — omija RLS, bo cron nie ma sesji).
    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("briefings")
      .insert({ content: text, date: isoDate });

    if (error) {
      return Response.json(
        { success: false, error: `Zapis do Supabase nie powiódł się: ${error.message}` },
        { status: 500 },
      );
    }

    // 6. Zwróć krótkie potwierdzenie + podgląd.
    return Response.json({
      success: true,
      date: isoDate,
      preview: text.slice(0, 200),
    });
  } catch (err) {
    // Siatka bezpieczeństwa — cron nigdy nie powinien rzucać nieobsłużonym błędem.
    return Response.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Nieznany błąd",
      },
      { status: 500 },
    );
  }
}
