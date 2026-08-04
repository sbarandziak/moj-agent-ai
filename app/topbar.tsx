"use client";

// ============================================================
// Górny pasek: marka, okruszek bieżącej strony i menu użytkownika
// (e-mail + wylogowanie — wcześniej stopka sidebaru).
// ============================================================

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { findCurrent } from "./nav-items";
import ThemeToggle from "./theme-toggle";
import { useUser } from "./useUser";

/** Inicjały z adresu e-mail: "jan.kowalski@x.pl" -> "JK". */
function initials(email: string): string {
  const local = email.split("@")[0] ?? "";
  const parts = local.split(/[._-]+/).filter(Boolean);
  const letters = parts.length > 1 ? parts[0][0] + parts[1][0] : local.slice(0, 2);
  return letters.toUpperCase() || "?";
}

export default function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const user = useUser();
  const [menuOpen, setMenuOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMenuOpen(false), [pathname]);

  // pointerdown zamiast mousedown — na iOS zdarzenia myszy są tylko emulowane
  // i tapnięcie poza menu potrafi ich nie wywołać (patrz ten sam zabieg w nav.tsx).
  useEffect(() => {
    if (!menuOpen) return;
    function onDown(e: PointerEvent) {
      if (!boxRef.current?.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [menuOpen]);

  const current = findCurrent(pathname);
  const email = user.email ?? "";

  // Wyloguj: kasuje sesję i wraca na "/", gdzie bez sesji czeka landing page
  // (W1 Lekcja 11). Bez tego skoku AuthGate wyrzuciłby wprost na /login.
  async function handleLogout() {
    setMenuOpen(false);
    await supabase.auth.signOut();
    router.replace("/");
  }

  return (
    <header className="topbar">
      <Link href="/" className="brand">
        {/* Znak marki: ten sam robot co w favikonie (app/icon.svg), ale
            jednobarwny. Głowa i antenka biorą --on-ink, oczy --ink — czyli
            dokładnie te dwa tokeny, które motyw ciemny zamienia miejscami.
            Dzięki temu logo obraca się samo, bez żadnej reguły warunkowej. */}
        <span className="brand-mark">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="8" cy="2.6" r="1.1" fill="var(--on-ink)" />
            <rect x="7.4" y="3.2" width="1.2" height="2.4" rx="0.6" fill="var(--on-ink)" />
            <rect x="2.5" y="5" width="11" height="8" rx="2.6" fill="var(--on-ink)" />
            <circle cx="6" cy="9" r="1.15" fill="var(--ink)" />
            <circle cx="10" cy="9" r="1.15" fill="var(--ink)" />
          </svg>
        </span>
        Mój Agent
      </Link>
      {current && (
        <div className="crumb">
          {current.group.label}
          {current.item.label !== current.group.label && ` · ${current.item.label}`}
        </div>
      )}
      <div className="spacer" />
      <ThemeToggle />

      <div className="topbar-user" ref={boxRef}>
        <button
          type="button"
          className="avatar"
          title={email}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((o) => !o)}
        >
          {initials(email)}
        </button>
        {menuOpen && (
          <div className="user-menu" role="menu">
            <span className="user-menu-email" title={email}>
              {email}
            </span>
            <button
              type="button"
              className="user-menu-btn"
              role="menuitem"
              onClick={handleLogout}
            >
              🚪 Wyloguj
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
