// ============================================================
// Lekcja 10, W4: Dane dla panelu /admin/security
// ------------------------------------------------------------
// GET /api/admin/security?userId=<uuid>
//
// Cała agregacja idzie po stronie serwera klientem service_role, bo panel
// pokazuje dane WSZYSTKICH użytkowników (RLS na api_usage/message_logs
// celowo na to nie pozwala z przeglądarki).
//
// KTO JEST ADMINEM: lista maili w zmiennej środowiskowej ADMIN_EMAILS —
// bramka mieszka w lib/admin-auth.ts (współdzielona z /api/admin/dashboard
// od L11 W2). Gdy zmienna NIE jest ustawiona, panel jest otwarty dla
// każdego zalogowanego (wygodne na kursie) — trasa zwraca wtedy
// adminMode: "open", a strona wyświetla ostrzeżenie.
// ============================================================

import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { DAILY_TOKEN_LIMIT, startOfToday } from "@/lib/budget";
import { loadBlockedLogs, type BlockedLogRow } from "@/lib/security-log";
import { checkAdminAccess, labelUser } from "@/lib/admin-auth";

type UsageRow = {
  user_id: string | null;
  tokens_input: number | null;
  tokens_output: number | null;
  created_at: string;
  endpoint: string | null;
};

export type TopUser = {
  userId: string;
  email: string;
  today: number; // tokeny dziś
  week: number; // tokeny w ostatnich 7 dniach
  percent: number; // % dziennego limitu
};

export type Alert = {
  level: "red" | "yellow";
  icon: string;
  text: string;
};

// Progi alertów (W4 §3).
const ALERT_PERCENT = 80; // % limitu dziennego
const BURST_CALLS = 20; // liczba wywołań...
const BURST_MINUTES = 10; // ...w tylu minutach

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

  // --- Kontrola dostępu + mapa user_id -> email ---------------------------
  const { allowed, adminMode, emails } = await checkAdminAccess(
    supabase,
    callerId
  );
  if (!allowed) {
    return Response.json(
      { error: "Brak uprawnień do panelu bezpieczeństwa." },
      { status: 403 }
    );
  }

  // --- Zużycie tokenów: dziś i ostatnie 7 dni -----------------------------
  const todayStart = startOfToday();
  const weekStart = new Date(
    new Date(todayStart).getTime() - 6 * 24 * 3600 * 1000
  ).toISOString();
  const burstStart = new Date(
    Date.now() - BURST_MINUTES * 60 * 1000
  ).toISOString();

  const { data: usageData, error: usageError } = await supabase
    .from("api_usage")
    .select("user_id, tokens_input, tokens_output, created_at, endpoint")
    .gte("created_at", weekStart)
    .order("created_at", { ascending: false })
    .limit(20000);

  if (usageError) {
    return Response.json(
      {
        error:
          `Nie udało się odczytać api_usage: ${usageError.message}. ` +
          "Czy uruchomiłeś supabase/api_usage.sql?",
      },
      { status: 503 }
    );
  }

  const usage = (usageData ?? []) as UsageRow[];

  // Agregacja per użytkownik (dziś / tydzień) + wykrycie serii wywołań.
  const perUser = new Map<
    string,
    { today: number; week: number; burstCalls: number }
  >();
  let tokensToday = 0;
  let tokensWeek = 0;

  for (const row of usage) {
    const tokens = (row.tokens_input ?? 0) + (row.tokens_output ?? 0);
    tokensWeek += tokens;
    const isToday = row.created_at >= todayStart;
    if (isToday) tokensToday += tokens;

    // Wywołania systemowe (cron) liczą się do statystyk globalnych, ale nie
    // do rankingu użytkowników — nie mają właściciela.
    if (!row.user_id) continue;

    const acc = perUser.get(row.user_id) ?? { today: 0, week: 0, burstCalls: 0 };
    acc.week += tokens;
    if (isToday) acc.today += tokens;
    if (row.created_at >= burstStart) acc.burstCalls += 1;
    perUser.set(row.user_id, acc);
  }

  const topUsers: TopUser[] = [...perUser.entries()]
    .map(([userId, v]) => ({
      userId,
      email: labelUser(emails, userId),
      today: v.today,
      week: v.week,
      percent: Math.min(100, Math.round((v.today / DAILY_TOKEN_LIMIT) * 100)),
    }))
    .sort((a, b) => b.today - a.today || b.week - a.week)
    .slice(0, 5);

  // --- Zablokowane wiadomości --------------------------------------------
  const blockedRows = await loadBlockedLogs(50);
  const blocked = (blockedRows ?? []).map((r: BlockedLogRow) => ({
    ...r,
    email: labelUser(emails, r.user_id),
  }));

  const dayAgo = Date.now() - 24 * 3600 * 1000;
  const blockedToday = blocked.filter(
    (b) => new Date(b.created_at).getTime() >= dayAgo
  );

  // --- Alerty -------------------------------------------------------------
  const alerts: Alert[] = [];

  for (const u of topUsers) {
    if (u.percent >= ALERT_PERCENT) {
      alerts.push({
        level: u.percent >= 100 ? "red" : "yellow",
        icon: "🔋",
        text:
          `${u.email} zużył ${u.percent}% dziennego limitu ` +
          `(${u.today.toLocaleString("pl-PL")} / ${DAILY_TOKEN_LIMIT.toLocaleString("pl-PL")} tokenów).`,
      });
    }
  }

  for (const [userId, v] of perUser) {
    if (v.burstCalls > BURST_CALLS) {
      alerts.push({
        level: "red",
        icon: "⚡",
        text:
          `${emails.get(userId) ?? userId.slice(0, 8) + "…"} wysłał ` +
          `${v.burstCalls} zapytań w ${BURST_MINUTES} minut.`,
      });
    }
  }

  for (const b of blockedToday.slice(0, 10)) {
    alerts.push({
      level: "red",
      icon: "🚫",
      text: `Zablokowano wiadomość (${layerLabel(b.layer)}) — ${b.email}: „${b.message.slice(0, 80)}${b.message.length > 80 ? "…" : ""}"`,
    });
  }

  // --- Statystyki ---------------------------------------------------------
  const activeUsers = perUser.size;
  const stats = {
    tokensToday,
    tokensWeek,
    blockedTotal: blocked.length,
    blockedToday: blockedToday.length,
    activeUsers,
    avgPerUser: activeUsers > 0 ? Math.round(tokensToday / activeUsers) : 0,
  };

  return Response.json({
    adminMode,
    limit: DAILY_TOKEN_LIMIT,
    // null = tabela message_logs nie istnieje (strona pokaże instrukcję),
    // [] = istnieje i jest pusta (czyli po prostu nikt nic nie przeskrobał).
    logsAvailable: blockedRows !== null,
    blocked,
    topUsers,
    alerts,
    stats,
  });
}

function layerLabel(layer: string): string {
  switch (layer) {
    case "input":
      return "walidacja inputu";
    case "output":
      return "filtr outputu";
    case "rate_limit":
      return "rate limit";
    case "budget":
      return "budżet tokenów";
    default:
      return layer;
  }
}
