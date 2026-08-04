// ============================================================
// Wspólna bramka paneli administracyjnych (/admin/*)
// ------------------------------------------------------------
// Logika powstała w L10 W4 (panel bezpieczeństwa) i od L11 W2 obsługuje
// też dashboard użycia — dlatego mieszka tu, a nie w jednej z tras.
//
// KTO JEST ADMINEM: maile po przecinku w zmiennej ADMIN_EMAILS.
// Gdy zmienna NIE jest ustawiona, panele są otwarte dla każdego
// zalogowanego (wygodne na kursie) — tryb "open", a strona pokazuje
// żółte ostrzeżenie. Na produkcji ustaw ADMIN_EMAILS.
//
// Przy okazji zwracamy mapę user_id -> e-mail: obie trasy pokazują ludzi,
// a maile są dostępne wyłącznie przez auth.admin (klucz service_role).
// ============================================================

import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminMode = "open" | "restricted";

export type AdminGate = {
  /** Czy wołający ma prawo zobaczyć panel. */
  allowed: boolean;
  adminMode: AdminMode;
  /** user_id -> e-mail (puste, gdy Supabase nie oddał listy userów). */
  emails: Map<string, string>;
};

export async function checkAdminAccess(
  supabase: SupabaseClient,
  callerId: string
): Promise<AdminGate> {
  const emails = new Map<string, string>();
  try {
    const { data } = await supabase.auth.admin.listUsers({ perPage: 1000 });
    for (const u of data?.users ?? []) {
      if (u.email) emails.set(u.id, u.email);
    }
  } catch (err) {
    // Brak dostępu do listy userów nie może wywalić panelu — pokażemy same ID.
    console.warn(
      "[admin] Nie udało się pobrać listy użytkowników:",
      err instanceof Error ? err.message : err
    );
  }

  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  if (adminEmails.length === 0) {
    return { allowed: true, adminMode: "open", emails };
  }

  const callerEmail = emails.get(callerId)?.toLowerCase();
  return {
    allowed: !!callerEmail && adminEmails.includes(callerEmail),
    adminMode: "restricted",
    emails,
  };
}

/** Etykieta użytkownika, gdy maila nie znamy (usunięte konto, brak dostępu). */
export function labelUser(
  emails: Map<string, string>,
  userId: string | null
): string {
  if (!userId) return "(brak sesji)";
  return emails.get(userId) ?? `(nieznany: ${userId.slice(0, 8)}…)`;
}
