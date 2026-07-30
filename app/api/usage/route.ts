// ============================================================
// Lekcja 10, W3: Odczyt dziennego zużycia tokenów
// ------------------------------------------------------------
// GET /api/usage?userId=<uuid>
//   -> { used, limit, remaining, percent, resetsAt }
//
// Używa go panel "Budżet" w /chat i /react, żeby pokazać ile z dziennego
// limitu zostało. Liczy klientem service_role (jak reszta budżetu), bo
// trasy API nie mają sesji użytkownika — userId przychodzi z klienta,
// tak samo jak w /api/chat i /api/upload-knowledge (ten sam model zaufania).
// Endpoint jest tylko do ODCZYTU własnego licznika — nic nie zmienia.
// ============================================================

import {
  DAILY_TOKEN_LIMIT,
  getTokensUsedToday,
  startOfToday,
} from "@/lib/budget";

export async function GET(req: Request) {
  const userId = new URL(req.url).searchParams.get("userId");

  if (!userId) {
    return Response.json(
      { error: "Brak parametru userId." },
      { status: 400 }
    );
  }

  const used = await getTokensUsedToday(userId);

  if (used === null) {
    // Licznik niedostępny (brak tabeli / klucza) — mówimy to wprost,
    // zamiast pokazywać w UI zmyślone zero.
    return Response.json(
      {
        error:
          "Nie udało się odczytać zużycia. Sprawdź, czy tabela api_usage " +
          "istnieje (supabase/api_usage.sql) i czy ustawiony jest " +
          "SUPABASE_SERVICE_ROLE_KEY.",
        limit: DAILY_TOKEN_LIMIT,
      },
      { status: 503 }
    );
  }

  // Reset licznika: północ UTC (patrz startOfToday w lib/budget.ts).
  const resetsAt = new Date(
    new Date(startOfToday()).getTime() + 24 * 3600 * 1000
  ).toISOString();

  return Response.json({
    used,
    limit: DAILY_TOKEN_LIMIT,
    remaining: Math.max(0, DAILY_TOKEN_LIMIT - used),
    percent: Math.min(100, Math.round((used / DAILY_TOKEN_LIMIT) * 100)),
    resetsAt,
  });
}
