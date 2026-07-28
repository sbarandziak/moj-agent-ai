import { google } from "@ai-sdk/google";
import { generateText } from "ai";
import { getWeather, getExchangeRate } from "@/app/api/react/tools";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const maxDuration = 30;

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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callTool(t: any, args: Record<string, unknown>): Promise<unknown> {
  return t.execute(args, { toolCallId: "briefing-gen", messages: [] });
}

export async function GET(request: Request) {
  try {
    const now = new Date();
    const isoDate = now.toISOString().slice(0, 10);
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

    const dataBlock = `DANE (${plDate}, ${isoDate}):

Pogoda (Warszawa): ${JSON.stringify(weather)}
Kurs EUR: ${JSON.stringify(eur)}
Kurs USD: ${JSON.stringify(usd)}
Data: ${plDate} (${isoDate})

Napisz na ich podstawie poranny briefing.`;

    const { text } = await generateText({
      model: google("gemini-3.1-flash-lite"),
      system: SYSTEM,
      prompt: dataBlock,
    });

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

    return Response.json({
      success: true,
      date: isoDate,
      preview: text.slice(0, 200),
    });
  } catch (err) {
    return Response.json(
      {
        success: false,
        error: err instanceof Error ? err.message : "Nieznany błąd",
      },
      { status: 500 },
    );
  }
}
