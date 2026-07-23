// ============================================================
// Lekcja 07, W3: Klient Supabase z kluczem service_role
// ------------------------------------------------------------
// UWAGA: TYLKO po stronie serwera. Ten klient POMIJA RLS, więc daje
// pełny dostęp do bazy. Używamy go w zaufanych trasach serwerowych,
// które SAME weryfikują userId (upload wiedzy, zapis profilu z agenta) —
// tam nie ma sesji użytkownika, więc klient `anon` byłby zablokowany
// przez polityki RLS.
//
// NIGDY nie importuj/nie wołaj tego z komponentu klienckiego:
// SUPABASE_SERVICE_ROLE_KEY jest tajny (bez prefiksu NEXT_PUBLIC_,
// więc nie trafia do przeglądarki) i daje admina na bazie.
//
// Klient tworzymy LENIWIE (dopiero przy pierwszym wywołaniu), żeby sam
// import modułu do bundla klienta nie wywalał się na braku klucza.
// ============================================================

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let admin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (admin) return admin;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "Brak SUPABASE_SERVICE_ROLE_KEY lub NEXT_PUBLIC_SUPABASE_URL. " +
        "Ustaw je w .env.local (lokalnie) oraz w Vercel → Settings → " +
        "Environment Variables. Klucz service_role znajdziesz w Supabase → " +
        "Settings → API."
    );
  }

  admin = createClient(url, serviceKey, {
    // Serwer nie potrzebuje sesji ani odświeżania tokenu.
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return admin;
}
