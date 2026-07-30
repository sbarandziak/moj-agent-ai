// ============================================================
// Lekcja 10, W4: Log zdarzeń bezpieczeństwa
// ------------------------------------------------------------
// Każde zadziałanie obrony z W2/W3 (walidacja inputu, filtr outputu, rate
// limiting, wyczerpany budżet) zostawia ślad w tabeli `message_logs`
// (supabase/message_logs.sql). Panel /admin/security czyta z niej listę
// zablokowanych wiadomości i alerty.
//
// Zapis idzie klientem service_role i NIGDY nie rzuca — log bezpieczeństwa
// nie może zepsuć odpowiedzi ani zablokować obrony, która właśnie zadziałała.
// ============================================================

import { getSupabaseAdmin } from "./supabaseAdmin";

// Która warstwa obrony zareagowała.
export type DefenseLayer = "input" | "output" | "rate_limit" | "budget";

export type BlockedEntry = {
  userId?: string | null;
  message: string; // treść wiadomości użytkownika (przytniemy)
  reason: string; // komunikat, który zobaczył użytkownik
  layer: DefenseLayer;
  endpoint: string;
};

// Wiadomości potrafią mieć 2000 znaków — w logu wystarczy początek.
const MAX_LOGGED_CHARS = 500;

export async function logBlockedMessage(entry: BlockedEntry): Promise<void> {
  try {
    const message = (entry.message ?? "").slice(0, MAX_LOGGED_CHARS);

    const { error } = await getSupabaseAdmin().from("message_logs").insert({
      user_id: entry.userId ?? null,
      message,
      blocked: true,
      reason: entry.reason,
      layer: entry.layer,
      endpoint: entry.endpoint,
    });

    if (error) {
      console.warn("[security] Nie udało się zapisać blokady:", error.message);
    }
  } catch (err) {
    console.warn(
      "[security] Log bezpieczeństwa niedostępny:",
      err instanceof Error ? err.message : err
    );
  }
}

export type BlockedLogRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  message: string;
  reason: string | null;
  layer: string;
  endpoint: string;
};

// Ostatnie blokady (do panelu). Zwraca null, gdy tabela jest niedostępna —
// panel odróżnia wtedy "brak ataków" od "brak tabeli".
export async function loadBlockedLogs(
  limit = 50
): Promise<BlockedLogRow[] | null> {
  try {
    const { data, error } = await getSupabaseAdmin()
      .from("message_logs")
      .select("id, created_at, user_id, message, reason, layer, endpoint")
      .eq("blocked", true)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.warn("[security] Nie udało się odczytać logów:", error.message);
      return null;
    }
    return (data ?? []) as BlockedLogRow[];
  } catch (err) {
    console.warn(
      "[security] Log bezpieczeństwa niedostępny:",
      err instanceof Error ? err.message : err
    );
    return null;
  }
}
