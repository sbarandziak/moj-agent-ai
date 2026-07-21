import { google } from "@ai-sdk/google";
import { generateText, stepCountIs } from "ai";

export const maxDuration = 60;

// Ochrona przed pętlami (W0, lekcja 06): twardy limit kroków agenta.
const maxSteps = 3;

// Krok 1 funkcji "Wygeneruj podobny obraz w innym stylu":
// model OGLĄDA obraz i zwraca gotowy PROMPT dla generatora grafik,
// zmodyfikowany zgodnie z instrukcją stylu (np. "ale ciemniejsze").
export async function POST(req: Request) {
  let image: string;
  let instruction: string;
  try {
    const body = await req.json();
    image = typeof body?.image === "string" ? body.image : "";
    instruction =
      typeof body?.instruction === "string" && body.instruction.trim()
        ? body.instruction.trim()
        : "w innym, ciekawym stylu";
  } catch {
    return Response.json({ error: "Nieprawidłowe body żądania." }, { status: 400 });
  }

  if (!image) {
    return Response.json({ error: "Brak obrazu (pole 'image')." }, { status: 400 });
  }

  try {
    const { text } = await generateText({
      model: google("gemini-3.1-flash-lite"),
      stopWhen: stepCountIs(maxSteps),
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image },
            {
              type: "text",
              text:
                `Obejrzyj ten obraz i napisz zwięzły, szczegółowy PROMPT do generatora grafik AI, ` +
                `który stworzy podobny obraz, ale ${instruction}. ` +
                `Opisz kompozycję, kolory, styl i nastrój. ` +
                `Zwróć TYLKO gotowy prompt (1-3 zdania), bez komentarza i bez cudzysłowów.`,
            },
          ],
        },
      ],
    });

    const prompt = text.trim();
    if (!prompt) {
      return Response.json(
        { error: "Model nie zwrócił opisu obrazu." },
        { status: 502 }
      );
    }
    return Response.json({ prompt });
  } catch (err) {
    return Response.json(
      {
        error: `Błąd analizy obrazu: ${
          err instanceof Error ? err.message : "nieznany błąd"
        }`,
      },
      { status: 500 }
    );
  }
}
