"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

// Dashboard (🏠) na górze; dalej czat i pozostałe narzędzia agenta.
const LINKS = [
  { href: "/", icon: "🏠", label: "Dashboard" },
  { href: "/chat", icon: "💬", label: "Chat" },
  { href: "/history", icon: "📜", label: "Historia" },
  { href: "/upload", icon: "📤", label: "Dodaj wiedzę" },
  { href: "/knowledge", icon: "🔎", label: "Baza wiedzy" },
  { href: "/think", icon: "🧠", label: "Myślenie" },
  { href: "/fewshot", icon: "📚", label: "Słownik" },
  { href: "/format", icon: "📐", label: "Formater" },
  { href: "/email", icon: "✉️", label: "E-mail" },
  { href: "/search", icon: "🌐", label: "Szukaj" },
  { href: "/generate", icon: "🎨", label: "Grafiki" },
  { href: "/vision", icon: "👁️", label: "Vision" },
  { href: "/react", icon: "🔄", label: "ReAct" },
  { href: "/travel", icon: "✈️", label: "Podróże" },
];

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Pasek górny z hamburgerem — widoczny tylko na telefonie. */}
      <div className="mobile-bar">
        <button
          type="button"
          className="hamburger"
          onClick={() => setOpen((o) => !o)}
          aria-label="Menu"
        >
          ☰
        </button>
        <span className="mobile-brand">🤖 Mój Agent</span>
      </div>

      {/* Przyciemnienie tła, gdy menu jest otwarte (mobile). */}
      {open && <div className="sidebar-overlay" onClick={() => setOpen(false)} />}

      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-brand">🤖 Mój Agent</div>
        <nav className="sidebar-nav">
          {LINKS.map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`side-link ${active ? "active" : ""}`}
                onClick={() => setOpen(false)}
              >
                <span className="side-icon">{l.icon}</span>
                <span className="side-label">{l.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
