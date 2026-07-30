// ============================================================
// Lekcja 10, W3: Budżet kosztów — kontrola zużycia tokenów
// ------------------------------------------------------------
// Dwie rzeczy, obie oparte o tabelę `api_usage` (supabase/api_usage.sql):
//   1. PRZED wywołaniem LLM  -> checkBudget(userId): czy user zmieścił się
//      dziś w limicie tokenów. Jeśli nie — trasa zwraca 429 i model w ogóle
//      nie jest wołany (czyli nie generuje kosztu).
//   2. PO wywołaniu LLM      -> logUsage(...): zapis realnego zużycia
//      (usage z Vercel AI SDK) do `api_usage`.
//
// Zapis/odczyt idzie klientem service_role — trasy API nie mają sesji
// użytkownika (auth jest po stronie przeglądarki), a RLS na `api_usage`
// pozwala czytać tylko własne wiersze i nie pozwala pisać nikomu poza
// service_role. Dzięki temu licznika nie da się obejść z przeglądarki.
//
// FAIL-OPEN: gdy baza jest nieosiągalna (brak klucza, timeout), budżet
// PRZEPUSZCZA ruch i tylko loguje ostrzeżenie. Awaria licznika nie może
// zablokować całej aplikacji — od twardej ochrony przed nadużyciem jest
// dodatkowo rate limiting z W2 (lib/defenses.ts).
// ============================================================

import { getSupabaseAdmin } from "./supabaseAdmin";

// Dzienny limit tokenów (input + output) na użytkownika.
// Do testu W3 obniż w .env.local: DAILY_TOKEN_LIMIT=100
export const DAILY_TOKEN_LIMIT = (() => {
  const raw = Number(process.env.DAILY_TOKEN_LIMIT);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 10_000;
})();

export type UsageEntry = {
  userId?: string | null; // null = wywołanie systemowe (cron)
  tokensInput?: number;
  tokensOutput?: number;
  model: string;
  endpoint: string;
};

export type BudgetCheck = {
  allowed: boolean;
  used: number; // tokeny zużyte dziś
  limit: number;
  remaining: number;
  reason?: string; // komunikat dla użytkownika, gdy allowed === false
};

// Początek dnia w UTC — ta sama doba, którą widzi Postgres w `now()` na
// Supabase/Vercel (oba chodzą w UTC). Limit resetuje się o północy UTC.
export function startOfToday(): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  ).toISOString();
}

// "10000" -> "10k", "100" -> "100" — do komunikatu dla użytkownika.
function formatLimit(limit: number): string {
  return limit >= 1000 && limit % 1000 === 0 ? `${limit / 1000}k` : String(limit);
}

// Suma tokenów użytkownika od północy. Zwraca null, gdy nie udało się
// odpytać bazy (wtedy wołający przepuszcza ruch — patrz FAIL-OPEN wyżej).
export async function getTokensUsedToday(userId: string): Promise<number | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("api_usage")
      .select("tokens_input, tokens_output")
      .eq("user_id", userId)
      .gte("created_at", startOfToday())
      // Bezpiecznik na wypadek lawiny wierszy — przy limicie 10k tokenów
      // realnie jest ich kilkadziesiąt dziennie.
      .limit(5000);

    if (error) {
      console.warn("[budget] Nie udało się policzyć zużycia:", error.message);
      return null;
    }

    return (data ?? []).reduce(
      (sum, row: { tokens_input: number | null; tokens_output: number | null }) =>
        sum + (row.tokens_input ?? 0) + (row.tokens_output ?? 0),
      0
    );
  } catch (err) {
    console.warn(
      "[budget] Brak dostępu do api_usage:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}

// Sprawdzenie PRZED wywołaniem LLM.
// Bez userId (demo/test) nie ma czego limitować — przepuszczamy.
export async function checkBudget(userId?: string | null): Promise<BudgetCheck> {
  const limit = DAILY_TOKEN_LIMIT;

  if (!userId) {
    return { allowed: true, used: 0, limit, remaining: limit };
  }

  const used = await getTokensUsedToday(userId);
  if (used === null) {
    // Licznik niedostępny — nie blokujemy użytkownika.
    return { allowed: true, used: 0, limit, remaining: limit };
  }

  const remaining = Math.max(0, limit - used);
  if (used > limit) {
    return {
      allowed: false,
      used,
      limit,
      remaining: 0,
      reason:
        `Dzienny limit tokenów (${formatLimit(limit)}) został wyczerpany. Wróć jutro! ` +
        `Zużycie dziś: ${used.toLocaleString("pl-PL")} tokenów. ` +
        `Limit odnawia się o północy (UTC).`,
    };
  }

  return { allowed: true, used, limit, remaining };
}

// Gotowa odpowiedź 429 dla trasy API — ten sam kształt co rate limiting z W2
// ({ error }), więc frontend obsługuje oba tak samo.
export function budgetExceededResponse(check: BudgetCheck): Response {
  return new Response(
    JSON.stringify({
      error: check.reason ?? "Dzienny limit tokenów został wyczerpany. Wróć jutro!",
      used: check.used,
      limit: check.limit,
    }),
    { status: 429, headers: { "Content-Type": "application/json" } }
  );
}

// Zapis PO wywołaniu LLM. NIGDY nie rzuca — nieudane logowanie nie może
// zepsuć odpowiedzi, którą użytkownik właśnie dostał.
export async function logUsage(entry: UsageEntry): Promise<void> {
  const tokensInput = Math.max(0, Math.round(entry.tokensInput ?? 0));
  const tokensOutput = Math.max(0, Math.round(entry.tokensOutput ?? 0));

  // Model bywa, że nie zwróci usage (np. odpowiedź przerwana) — nie zaśmiecamy
  // tabeli pustymi wierszami.
  if (tokensInput === 0 && tokensOutput === 0) return;

  try {
    const { error } = await getSupabaseAdmin().from("api_usage").insert({
      user_id: entry.userId ?? null,
      tokens_input: tokensInput,
      tokens_output: tokensOutput,
      model: entry.model,
      endpoint: entry.endpoint,
    });
    if (error) {
      console.warn("[budget] Nie udało się zapisać zużycia:", error.message);
    }
  } catch (err) {
    console.warn(
      "[budget] Zapis do api_usage nieudany:",
      err instanceof Error ? err.message : err
    );
  }
}
