// ============================================================
// Warsztat 3 (Lekcja 07): AuthGate — brama logowania
// ------------------------------------------------------------
// Owija całą aplikację (w layout.tsx). Zadania:
//   - odczytać bieżącą sesję Supabase Auth i śledzić jej zmiany,
//   - niezalogowany na chronionej stronie  -> redirect na /login,
//   - zalogowany wchodzący na /login        -> redirect na /,
//   - dla zalogowanego renderować pełny układ (sidebar + treść),
//     udostępniając obiekt User przez UserContext (useUser()).
// Strony publiczne (/login i "/" = landing page z W1 Lekcji 11)
// renderują się samodzielnie, bez sidebaru.
// ============================================================

"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { UserContext } from "./useUser";
import Nav from "./nav";
import Topbar from "./topbar";

// Ścieżki dostępne bez sesji. "/" jest publiczne, bo niezalogowanemu
// pokazujemy tam landing page (app/landing.tsx) zamiast wyrzucać go
// na /login — o tym, co wyrenderować, decyduje app/page.tsx.
const PUBLIC_PATHS = ["/login", "/"];

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
    if (!user && !PUBLIC_PATHS.includes(pathname)) {
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

  // Niezalogowany na "/": landing page na pełnej szerokości, bez railu
  // i topbara. UserContext zostaje pusty, więc page.tsx wie, co pokazać.
  if (!user && pathname === "/") {
    return <>{children}</>;
  }

  // Niezalogowany na stronie chronionej — czekamy na redirect z efektu wyżej.
  if (!user) {
    return <div className="auth-loading">⏳ Przekierowuję do logowania…</div>;
  }

  // Zalogowany: pełny układ + kontekst użytkownika dla stron.
  // Rail (ikony) z lewej, nad treścią topbar z okruszkiem i kontem.
  return (
    <UserContext.Provider value={user}>
      <div className="shell">
        <Nav />
        <div className="shell-main">
          <Topbar />
          <main className="main">{children}</main>
        </div>
      </div>
    </UserContext.Provider>
  );
}
