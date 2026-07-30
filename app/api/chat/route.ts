import { google } from "@ai-sdk/google";
import {
  streamText,
  convertToModelMessages,
  tool,
  stepCountIs,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { updateUserName, updateUserPreference } from "@/lib/supabase";
import { validateInput, filterOutput, checkRateLimit } from "@/lib/defenses";

// Pozwól odpowiedziom strumieniować się do 60 sekund (Pro bywa wolniejszy).
export const maxDuration = 60;

type ModelKey = "flash" | "pro";

// Dwa modele Google na tym samym kluczu API.
const MODELS: Record<ModelKey, string> = {
  flash: "gemini-3.1-flash-lite", // najtańszy — do codziennych pytań (W0 lekcja 06)
  pro: "gemini-3.1-pro-preview", // zaawansowany — do złożonych analiz
};

// Ochrona przed pętlami (W0, lekcja 06): twardy limit kroków agenta.
const maxSteps = 3;

// Profesjonalna persona z jasno zdefiniowanym formatem odpowiedzi.
const SYSTEM = `# Marta Wiśniewska — Doradca ds. nieruchomości i kredytów hipotecznych

## KIM JESTEM
Jestem doradcą nieruchomości z 12-letnim doświadczeniem na polskim rynku.
Specjalizuję się w: zakupie i sprzedaży mieszkań (rynek pierwotny i wtórny), kredytach hipotecznych oraz analizie stanu prawnego nieruchomości (księgi wieczyste, umowy).
Pracowałam z klientami indywidualnymi, inwestorami pod wynajem oraz deweloperami.

## JAK ODPOWIADAM

### Struktura KAŻDEJ odpowiedzi (zawsze te 4 sekcje):
1. 📋 **Kontekst** — potwierdzam zrozumienie pytania (1 zdanie).
2. 🔍 **Analiza** — merytoryczna odpowiedź (max 2 akapity).
3. ✅ **Rekomendacja** — konkretne działanie do podjęcia (1-3 punkty).
4. ❓ **Pytanie** — jedno pytanie pogłębiające do użytkownika.

### Zasady:
- ZANIM odpowiem na złożone pytanie — dopytuję o kontekst (budżet, miasto, cel zakupu).
- Gdy podaję fakty — oznaczam pewność: ✓ pewne, ~ przybliżone, ? do weryfikacji.
- **Pogrubiam** kluczowe terminy przy pierwszym użyciu.
- Listy numerowane dla kroków, punktowane dla opcji.
- Maksymalnie 3 akapity + rekomendacja.

### Styl:
- Język: polski.
- Ton: profesjonalny, ale przystępny.
- Gdy używam terminu branżowego — wyjaśniam go w nawiasie.

## PAMIĘĆ
- Pamiętasz CAŁĄ rozmowę od początku i nawiązujesz do wcześniejszych wiadomości.
- Jeśli użytkownik podał imię — używaj go konsekwentnie.
- Na komendę "podsumuj" lub "co ustaliliśmy" — streszczenie całej rozmowy w numerowanej liście.

## CZEGO NIE ROBIĘ
- Nie odpowiadam na pytania spoza nieruchomości i kredytów — mówię wprost: "To nie moja specjalizacja" i proponuję, w czym MOGĘ pomóc.
- Nie udaję, że wiem coś, czego nie wiem.
- Nie udzielam wiążących porad prawnych ani podatkowych — przy zawiłych sprawach odsyłam do notariusza lub doradcy podatkowego.`;

// Buduje system prompt spersonalizowany pod użytkownika (W3 §2, §4, §5).
function buildSystem(
  userName?: string | null,
  preferences?: Record<string, string>
): string {
  const prefEntries = Object.entries(preferences ?? {});
  const prefLine =
    prefEntries.length > 0
      ? `\nZnane preferencje użytkownika: ${prefEntries
          .map(([k, v]) => `${k} = ${v}`)
          .join(", ")}. Wykorzystuj je naturalnie w rozmowie.`
      : "";

  if (userName && userName.trim()) {
    return (
      SYSTEM +
      `\n\n## UŻYTKOWNIK\n` +
      `Użytkownik ma na imię ${userName.trim()}. Zwracaj się do niego po imieniu, ` +
      `bądź ciepły i personalny — to Twój stały użytkownik.` +
      prefLine +
      `\nGdy zdradzi NOWĄ preferencję (jedzenie, miasto, hobby itp.) — zapisz ją ` +
      `narzędziem saveUserPreference.`
    );
  }

  return (
    SYSTEM +
    `\n\n## UŻYTKOWNIK\n` +
    `To nowy użytkownik — nie znasz jeszcze jego imienia. Na początku pierwszej ` +
    `rozmowy przywitaj się krótko i zapytaj, jak ma na imię. Gdy poda imię — użyj ` +
    `narzędzia saveUserName, aby je zapamiętać. Gdy zdradzi swoje preferencje ` +
    `(jedzenie, miasto, hobby itp.) — zapisz je narzędziem saveUserPreference.` +
    prefLine
  );
}

export async function POST(req: Request) {
  const {
    messages,
    model = "flash",
    userId,
    userName,
    preferences,
  }: {
    messages: UIMessage[];
    model?: ModelKey;
    userId?: string;
    userName?: string | null;
    preferences?: Record<string, string>;
  } = await req.json();

  // ========== W2: Rate limiting per user ==========
  if (userId) {
    const rateLimitCheck = checkRateLimit(userId);
    if (!rateLimitCheck.allowed) {
      return new Response(
        JSON.stringify({
          error: `Osiągnąłeś limit wiadomości (50/h). Spróbuj za ${rateLimitCheck.minutesUntilReset} minut.`,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  // ========== W2: Input validation ==========
  for (const msg of messages) {
    if (msg.role === "user") {
      // UIMessage has parts array, extract text from user messages
      const parts = (msg as any).parts ?? [];
      const textContent = parts
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text)
        .join("\n");

      if (textContent) {
        const validation = validateInput(textContent);
        if (!validation.valid) {
          return new Response(
            JSON.stringify({ error: validation.reason }),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }
      }
    }
  }

  const modelId = MODELS[model] ?? MODELS.flash;

  // Personalizacja: dobuduj do system promptu wiedzę o użytkowniku (W3 §4).
  const system = buildSystem(userName, preferences);

  // Narzędzia zapisu profilu — tylko gdy znamy ID użytkownika (W3 §3, §5).
  const tools = userId
    ? {
        saveUserName: tool({
          description:
            "Zapisuje imię użytkownika w jego profilu. Wywołaj ZAWSZE, gdy użytkownik " +
            "poda swoje imię (np. 'mam na imię Paweł', 'jestem Anna', 'nazywam się Jan').",
          inputSchema: z.object({
            name: z.string().describe("Imię użytkownika, np. Paweł"),
          }),
          execute: async ({ name }) => {
            const clean = name?.trim() ?? "";
            if (!clean) return { error: "Puste imię — nie zapisano." };
            const ok = await updateUserName(userId, clean);
            return ok
              ? { saved: true, name: clean }
              : { error: "Nie udało się zapisać imienia w bazie." };
          },
        }),
        saveUserPreference: tool({
          description:
            "Zapisuje jedną preferencję użytkownika w jego profilu (dopisuje do JSONB, " +
            "nie nadpisuje pozostałych). Wywołaj, gdy użytkownik zdradzi coś o sobie: " +
            "ulubione jedzenie, miasto, hobby, styl pracy itp.",
          inputSchema: z.object({
            key: z
              .string()
              .describe(
                "Klucz preferencji (bez spacji, np. 'ulubione_jedzenie', 'miasto', 'hobby')"
              ),
            value: z.string().describe("Wartość, np. 'pizza', 'Kraków', 'narty'"),
          }),
          execute: async ({ key, value }) => {
            const k = key?.trim().toLowerCase().replace(/\s+/g, "_") ?? "";
            const v = value?.trim() ?? "";
            if (!k || !v) return { error: "Podaj klucz i wartość preferencji." };
            const ok = await updateUserPreference(userId, k, v);
            return ok
              ? { saved: true, key: k, value: v }
              : { error: "Nie udało się zapisać preferencji w bazie." };
          },
        }),
      }
    : undefined;

  const result = streamText({
    model: google(modelId),
    system,
    messages: await convertToModelMessages(messages),
    tools,
    // Pozwól modelowi odpowiedzieć PO wywołaniu narzędzia (zapis imienia/preferencji).
    stopWhen: stepCountIs(maxSteps),
  });

  // ========== W2: Output filtering ==========
  // Intercept the stream to filter out sensitive data
  const originalStream = result.toUIMessageStreamResponse({
    messageMetadata: () => ({ model }),
    onError: errorMessage,
  });

  // Create a new response that filters the stream
  const reader = originalStream.body?.getReader();
  if (!reader) return originalStream;

  const filteredStream = new ReadableStream({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = new TextDecoder().decode(value);

          // Parse the SSE format and check for sensitive data
          // Format: "0: {"type":"...", "text":"..."}\n"
          const lines = chunk.split("\n");
          const filtered = lines
            .map((line) => {
              // Skip empty lines and non-data lines
              if (!line.startsWith("0:")) return line;

              try {
                const jsonStr = line.substring(2).trim();
                if (!jsonStr) return line;

                const obj = JSON.parse(jsonStr);

                // Filter text content in text, assistant messages, and delta.text
                if (obj.text && typeof obj.text === "string") {
                  const result = filterOutput(obj.text);
                  if (!result.safe) {
                    obj.text = result.text;
                  }
                }

                if (obj.content && Array.isArray(obj.content)) {
                  obj.content = obj.content.map((c: any) => {
                    if (c.type === "text" && c.text) {
                      const result = filterOutput(c.text);
                      if (!result.safe) c.text = result.text;
                    }
                    return c;
                  });
                }

                if (obj.delta?.text && typeof obj.delta.text === "string") {
                  const result = filterOutput(obj.delta.text);
                  if (!result.safe) {
                    obj.delta.text = result.text;
                  }
                }

                return "0: " + JSON.stringify(obj);
              } catch {
                // If it's not JSON, pass through unchanged
                return line;
              }
            })
            .join("\n");

          controller.enqueue(new TextEncoder().encode(filtered));
        }
      } catch (err) {
        controller.error(err);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(filteredStream, {
    headers: originalStream.headers,
  });
}

// Zamienia błąd modelu na zwięzły, zrozumiały komunikat po polsku.
function errorMessage(error: unknown): string {
  const status =
    typeof error === "object" && error !== null && "statusCode" in error
      ? (error as { statusCode?: number }).statusCode
      : undefined;
  const raw = error instanceof Error ? error.message : String(error);

  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(raw)) {
    return "Limit darmowego API został wyczerpany. Spróbuj ponownie za chwilę lub włącz billing w Google AI Studio.";
  }
  if (status === 503 || /UNAVAILABLE|high demand|overloaded/i.test(raw)) {
    return "Model jest chwilowo przeciążony. Spróbuj ponownie za moment.";
  }
  return `Błąd modelu: ${raw}`;
}
