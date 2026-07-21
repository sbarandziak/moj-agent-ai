// ============================================================
// Warsztat 3 (Lekcja 07): AuthGate — brama logowania
// ------------------------------------------------------------
// Owija całą aplikację (w layout.tsx). Zadania:
//   - odczytać bieżącą sesję Supabase Auth i śledzić jej zmiany,
//   - niezalogowany na chronionej stronie  -> redirect na /login,
//   - zalogowany wchodzący na /login        -> redirect na /,
//   - dla zalogowanego renderować pełny układ (sidebar + treść),
//     udostępniając obiekt User przez UserContext (useUser()).
// Strona /login renderuje się samodzielnie, bez sidebaru.
// ============================================================

"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { UserContext } from "./useUser";
import Nav from "./nav";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // 1. Bieżąca sesja przy pierwszym renderze.
    supabase.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setReady(true);
    });
    // 2. Reaguj na logowanie / wylogowanie / odświeżenie tokenu.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // Przekierowania — dopiero gdy znamy stan sesji (unikamy migotania).
  useEffect(() => {
    if (!ready) return;
    if (!user && pathname !== "/login") {
      router.replace("/login");
    } else if (user && pathname === "/login") {
      router.replace("/");
    }
  }, [ready, user, pathname, router]);

  // Zanim ustalimy sesję — nie pokazuj żadnej treści.
  if (!ready) {
    return <div className="auth-loading">⏳ Sprawdzam sesję…</div>;
  }

  // Strona logowania: samodzielny widok (bez nawigacji).
  if (pathname === "/login") {
    return <>{children}</>;
  }

  // Niezalogowany na stronie chronionej — czekamy na redirect z efektu wyżej.
  if (!user) {
    return <div className="auth-loading">⏳ Przekierowuję do logowania…</div>;
  }

  // Zalogowany: pełny układ + kontekst użytkownika dla stron.
  return (
    <UserContext.Provider value={user}>
      <div className="shell">
        <Nav />
        <main className="main">{children}</main>
      </div>
    </UserContext.Provider>
  );
}
