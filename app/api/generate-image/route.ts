import { GoogleGenAI } from "@google/genai";

// Generowanie obrazu trwa 5-15 s — dajemy route'owi zapas czasu.
export const maxDuration = 60;

// Darmowy model obrazowy z AI Studio (Nano Banana 2 Lite).
const IMAGE_MODEL = "gemini-3.1-flash-lite-image";

// Ten sam klucz co reszta agenta. W .env.local jest GOOGLE_GENERATIVE_AI_API_KEY,
// lekcja mówi o GOOGLE_API_KEY — akceptujemy oba warianty.
const API_KEY =
  process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY ?? "";

export async function POST(req: Request) {
  // 1. Odbierz prompt z body.
  let prompt: string;
  try {
    const body = await req.json();
    prompt = typeof body?.prompt === "string" ? body.prompt.trim() : "";
  } catch {
    return Response.json({ error: "Nieprawidłowe body żądania." }, { status: 400 });
  }

  // Brak promptu → 400.
  if (!prompt) {
    return Response.json(
      { error: "Podaj opis obrazu (pole 'prompt')." },
      { status: 400 }
    );
  }

  if (!API_KEY) {
    return Response.json(
      { error: "Brak klucza API (GOOGLE_API_KEY / GOOGLE_GENERATIVE_AI_API_KEY)." },
      { status: 500 }
    );
  }

  const ai = new GoogleGenAI({ apiKey: API_KEY });

  try {
    // 2. Wywołaj model obrazowy z modalnościami TEXT + IMAGE.
    //    Timeout 30 s — jeśli model milczy dłużej, przerywamy z czytelnym błędem.
    const generation = ai.models.generateContent({
      model: IMAGE_MODEL,
      contents: prompt,
      config: {
        responseModalities: ["TEXT", "IMAGE"],
      },
    });

    const timeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("TIMEOUT")), 30_000)
    );

    const response = await Promise.race([generation, timeout]);

    // 3. Wyciągnij obraz i komentarz z odpowiedzi.
    const parts = response.candidates?.[0]?.content?.parts ?? [];

    let image: string | null = null;
    let text = "";

    for (const part of parts) {
      if (part.inlineData?.data) {
        const mime = part.inlineData.mimeType ?? "image/png";
        image = `data:${mime};base64,${part.inlineData.data}`;
      } else if (part.text) {
        text += part.text;
      }
    }

    if (!image) {
      return Response.json(
        {
          error:
            "Model nie zwrócił obrazu. Spróbuj innego, bardziej konkretnego opisu.",
          text: text || undefined,
        },
        { status: 502 }
      );
    }

    // 4. Zwróć obraz (base64 data URL) + komentarz modelu.
    return Response.json({ image, text: text.trim() });
  } catch (err) {
    // 5. Błąd API / timeout → czytelny komunikat + poprawny status HTTP.
    if (err instanceof Error && err.message === "TIMEOUT") {
      return Response.json(
        {
          error:
            "Przekroczono limit czasu (30 s) — model generuje zbyt długo. Spróbuj ponownie.",
        },
        { status: 504 }
      );
    }

    // Komunikat z @google/genai bywa JSON-em ({error:{code,message,status,...}}).
    // Wyciągamy z niego kod i krótki opis, żeby nie zrzucać surowego dumpa do UI.
    const raw = err instanceof Error ? err.message : String(err);
    let code = 0;
    let status = "";
    let detail = raw;
    let retryAfter: number | undefined;
    try {
      const parsed = JSON.parse(raw.slice(raw.indexOf("{")));
      const e = parsed?.error ?? parsed;
      code = typeof e?.code === "number" ? e.code : 0;
      status = typeof e?.status === "string" ? e.status : "";
      // Pierwsza linia message = zwięzły opis (bez listy quot).
      detail = typeof e?.message === "string" ? e.message.split("\n")[0].trim() : raw;
      const retry = (e?.details as unknown[] | undefined)?.find(
        (d): d is { "@type"?: string; retryDelay?: string } =>
          typeof d === "object" &&
          d !== null &&
          (d as { "@type"?: string })["@type"]?.includes("RetryInfo") === true
      );
      const secs = retry?.retryDelay ? parseInt(retry.retryDelay, 10) : NaN;
      if (Number.isFinite(secs)) retryAfter = secs;
    } catch {
      /* nie-JSON — zostawiamy surowy komunikat */
    }

    // Quota / rate limit → 429 (nie 500: to nie awaria serwera).
    if (code === 429 || status === "RESOURCE_EXHAUSTED") {
      return Response.json(
        {
          error:
            "Limit darmowego API został wyczerpany (model obrazowy wymaga włączonego billingu w Google AI Studio)." +
            (retryAfter ? ` Spróbuj ponownie za ~${retryAfter} s.` : ""),
        },
        {
          status: 429,
          headers: retryAfter ? { "Retry-After": String(retryAfter) } : undefined,
        }
      );
    }

    // Przeciążenie modelu → 503.
    if (code === 503 || status === "UNAVAILABLE") {
      return Response.json(
        { error: "Model jest chwilowo przeciążony. Spróbuj ponownie za moment." },
        { status: 503 }
      );
    }

    // Pozostałe błędy → 500 z krótkim opisem.
    return Response.json(
      { error: `Błąd generowania obrazu: ${detail}` },
      { status: 500 }
    );
  }
}
