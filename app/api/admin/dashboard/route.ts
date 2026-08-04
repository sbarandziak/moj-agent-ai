// ============================================================
// Lekcja 11, W2: Dane dla dashboardu użycia — /admin/dashboard
// ------------------------------------------------------------
// GET /api/admin/dashboard?userId=<uuid>
//
// Wszystko liczone po stronie serwera kluczem service_role, bo dashboard
// pokazuje dane WSZYSTKICH użytkowników (RLS na api_usage/conversations
// celowo na to nie pozwala z przeglądarki). Dostęp: lib/admin-auth.ts.
//
// Doba jest liczona w UTC — tak samo jak dzienny limit tokenów w
// lib/budget.ts (Supabase i Vercel chodzą w UTC). Dzięki temu "tokeny dziś"
// na dashboardzie i licznik budżetu w czacie pokazują tę samą liczbę.
// ============================================================

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { startOfToday } from "@/lib/budget";
import { checkAdminAccess, labelUser, type AdminMode } from "@/lib/admin-auth";
import { estimateCost, isKnownModel } from "@/lib/pricing";

const DAYS = 7; // długość okna wykresów (z dzisiejszym włącznie)
const RECENT_LIMIT = 10; // ile ostatnich rozmów w tabeli

type UsageRow = {
  user_id: string | null;
  created_at: string;
  tokens_input: number | null;
  tokens_output: number | null;
  model: string | null;
  endpoint: string | null;
};

type ConversationRow = {
  id: string;
  created_at: string;
  title: string | null;
  user_id: string | null;
};

export type DayPoint = {
  /** Klucz dnia w UTC, np. "2026-08-04". */
  date: string;
  /** Etykieta na osi X, np. "04.08". */
  label: string;
  tokens: number;
  cost: number;
  conversations: number;
};

export type EndpointSlice = {
  endpoint: string;
  tokens: number;
  cost: number;
  calls: number;
};

export type RecentConversation = {
  id: string;
  title: string;
  email: string;
  createdAt: string;
  messages: number;
};

// "2026-08-04T09:12:33+00:00" -> "2026-08-04" (PostgREST oddaje czas w UTC).
function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

// Siedem kolejnych dni UTC kończących się dzisiaj.
function lastDays(count: number): string[] {
  const todayMs = new Date(startOfToday()).getTime();
  return Array.from({ length: count }, (_, i) =>
    new Date(todayMs - (count - 1 - i) * 86_400_000).toISOString().slice(0, 10)
  );
}

export async function GET(req: Request) {
  const callerId = new URL(req.url).searchParams.get("userId");
  if (!callerId) {
    return Response.json({ error: "Brak parametru userId." }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (err) {
    return Response.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Brak konfiguracji klienta administracyjnego Supabase.",
      },
      { status: 503 }
    );
  }

  const gate = await checkAdminAccess(supabase, callerId);
  if (!gate.allowed) {
    return Response.json(
      { error: "Brak uprawnień do dashboardu." },
      { status: 403 }
    );
  }

  const todayStart = startOfToday();
  const days = lastDays(DAYS);
  const windowStart = `${days[0]}T00:00:00.000Z`;

  // --- Rozmowy (wszystkie, do liczników globalnych) -----------------------
  const { data: convData, error: convError } = await supabase
    .from("conversations")
    .select("id, created_at, title, user_id")
    .order("created_at", { ascending: false })
    .limit(20000);

  if (convError) {
    return Response.json(
      {
        error:
          `Nie udało się odczytać tabeli conversations: ${convError.message}. ` +
          "Czy uruchomiłeś supabase/schema.sql?",
      },
      { status: 503 }
    );
  }

  const conversations = (convData ?? []) as ConversationRow[];

  // --- Zużycie tokenów z ostatnich 7 dni ----------------------------------
  // Brak tabeli api_usage nie może wywalić całej strony — wykresy tokenów
  // wtedy znikają, a liczniki rozmów i tak mają sens (usageAvailable: false).
  const { data: usageData, error: usageError } = await supabase
    .from("api_usage")
    .select("user_id, created_at, tokens_input, tokens_output, model, endpoint")
    .gte("created_at", windowStart)
    .order("created_at", { ascending: false })
    .limit(20000);

  if (usageError) {
    console.warn("[admin/dashboard] api_usage niedostępne:", usageError.message);
  }
  const usage = (usageData ?? []) as UsageRow[];

  // --- Agregacja dnia po dniu --------------------------------------------
  const byDay = new Map<string, DayPoint>(
    days.map((date) => [
      date,
      {
        date,
        label: `${date.slice(8, 10)}.${date.slice(5, 7)}`,
        tokens: 0,
        cost: 0,
        conversations: 0,
      },
    ])
  );

  const byEndpoint = new Map<string, EndpointSlice>();
  let tokensToday = 0;
  let costToday = 0;
  let tokensWeek = 0;
  let costWeek = 0;
  let unknownModelCalls = 0;

  for (const row of usage) {
    const tokensIn = row.tokens_input ?? 0;
    const tokensOut = row.tokens_output ?? 0;
    const tokens = tokensIn + tokensOut;
    const cost = estimateCost(row.model, tokensIn, tokensOut);
    if (!isKnownModel(row.model)) unknownModelCalls += 1;

    tokensWeek += tokens;
    costWeek += cost;
    if (row.created_at >= todayStart) {
      tokensToday += tokens;
      costToday += cost;
    }

    const day = byDay.get(dayKey(row.created_at));
    if (day) {
      day.tokens += tokens;
      day.cost += cost;
    }

    const endpoint = row.endpoint || "unknown";
    const slice = byEndpoint.get(endpoint) ?? {
      endpoint,
      tokens: 0,
      cost: 0,
      calls: 0,
    };
    slice.tokens += tokens;
    slice.cost += cost;
    slice.calls += 1;
    byEndpoint.set(endpoint, slice);
  }

  // --- Rozmowy per dzień + liczniki globalne ------------------------------
  const uniqueUsers = new Set<string>();
  let conversationsToday = 0;

  for (const c of conversations) {
    if (c.user_id) uniqueUsers.add(c.user_id);
    if (c.created_at >= todayStart) conversationsToday += 1;
    const day = byDay.get(dayKey(c.created_at));
    if (day) day.conversations += 1;
  }

  // --- Ostatnie rozmowy + liczba wiadomości w każdej ----------------------
  const recentRows = conversations.slice(0, RECENT_LIMIT);
  const messageCounts = new Map<string, number>();

  if (recentRows.length > 0) {
    const { data: msgData, error: msgError } = await supabase
      .from("messages")
      .select("conversation_id")
      .in(
        "conversation_id",
        recentRows.map((c) => c.id)
      )
      .limit(5000);

    if (msgError) {
      console.warn("[admin/dashboard] messages niedostępne:", msgError.message);
    }
    for (const m of (msgData ?? []) as { conversation_id: string }[]) {
      messageCounts.set(
        m.conversation_id,
        (messageCounts.get(m.conversation_id) ?? 0) + 1
      );
    }
  }

  const recent: RecentConversation[] = recentRows.map((c) => ({
    id: c.id,
    title: c.title?.trim() || "(bez tytułu)",
    email: labelUser(gate.emails, c.user_id),
    createdAt: c.created_at,
    messages: messageCounts.get(c.id) ?? 0,
  }));

  // Prognoza miesięczna: średnia dzienna z okna × 30. Świadomie liczona z
  // pełnych 7 dni (także pustych) — inaczej jeden dzień testów rozdmuchałby
  // prognozę do absurdu.
  const forecastMonth = (costWeek / DAYS) * 30;

  return Response.json({
    adminMode: gate.adminMode as AdminMode,
    usageAvailable: !usageError,
    days: [...byDay.values()],
    endpoints: [...byEndpoint.values()].sort((a, b) => b.tokens - a.tokens),
    recent,
    // Ile wywołań poszło po stawce zastępczej (przypis o dokładności kosztu).
    unknownModelCalls,
    stats: {
      users: uniqueUsers.size,
      conversations: conversations.length,
      conversationsToday,
      tokensToday,
      costToday,
      tokensWeek,
      costWeek,
      forecastMonth,
    },
  });
}
