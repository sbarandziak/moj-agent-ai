// ============================================================
// Mapa nawigacji: grupy rail-a (ikona) -> strony aplikacji.
// Jedno źródło prawdy dla lewego rail-a (nav.tsx) i okruszka
// w topbarze (topbar.tsx).
//
// KAŻDA grupa ma własną ikonę w railu — nie ma już przycisku „Więcej".
// Rail przy 12 ikonach potrzebuje ~600px wysokości okna; niżej zwężają go
// media queries przy .rail-btn w globals.css. Dokładając kolejne grupy
// sprawdź te progi.
// ============================================================

import type { ReactNode } from "react";

export type NavItem = { href: string; label: string };

export type NavGroup = {
  /** Nazwa grupy w dymku; przy jednej stronie = nazwa strony. */
  label: string;
  /** Krótki podpis pod nazwą w dymku. */
  hint: string;
  icon: ReactNode;
  items: NavItem[];
  /** true = nad grupą rysujemy separator. */
  separatorBefore?: boolean;
};

// Wspólne atrybuty ikon (styl kreski jak w prototypie).
const S = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Dashboard",
    hint: "Pogoda, kursy, święta",
    icon: (
      <svg {...S}>
        <path d="M3 10.5 12 3l9 7.5" />
        <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
        <path d="M9.5 21v-6h5v6" />
      </svg>
    ),
    items: [{ href: "/", label: "Dashboard" }],
  },
  {
    label: "Chat",
    hint: "Chat · Historia",
    icon: (
      <svg {...S}>
        <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.6-.7L3 21l1.9-5A8.4 8.4 0 0 1 12 3.1a8.4 8.4 0 0 1 9 8.4Z" />
      </svg>
    ),
    items: [
      { href: "/chat", label: "Chat" },
      { href: "/history", label: "Historia" },
    ],
  },
  {
    label: "Myślenie",
    hint: "Analiza krok po kroku",
    icon: (
      <svg {...S}>
        <path d="M9 20h6M10 17h4" />
        <path d="M12 3a6 6 0 0 1 3.5 10.9c-.4.3-.6.7-.6 1.2v.9H9.1v-.9c0-.5-.2-.9-.6-1.2A6 6 0 0 1 12 3Z" />
      </svg>
    ),
    items: [{ href: "/think", label: "Myślenie" }],
  },
  {
    label: "ReAct",
    hint: "Zadania wieloetapowe",
    icon: (
      <svg {...S}>
        <rect x="4" y="8" width="16" height="12" rx="3" />
        <path d="M12 4v4M9 14h.01M15 14h.01" />
      </svg>
    ),
    items: [{ href: "/react", label: "ReAct" }],
  },
  {
    label: "Baza wiedzy",
    hint: "Baza · Dodaj wiedzę · Słownik",
    separatorBefore: true,
    icon: (
      <svg {...S}>
        <path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Z" />
        <path d="M8 7h7M8 11h7" />
      </svg>
    ),
    items: [
      { href: "/knowledge", label: "Baza wiedzy" },
      { href: "/upload", label: "Dodaj wiedzę" },
      { href: "/fewshot", label: "Słownik" },
    ],
  },
  {
    label: "E-mail",
    hint: "E-mail · E-mail Triage",
    icon: (
      <svg {...S}>
        <path d="M3 6h18v13a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    ),
    items: [
      { href: "/email", label: "E-mail" },
      { href: "/email-triage", label: "E-mail Triage" },
    ],
  },
  {
    label: "Raporty",
    hint: "Raporty · Briefingi",
    icon: (
      <svg {...S}>
        <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
      </svg>
    ),
    items: [
      { href: "/report", label: "Raporty" },
      { href: "/briefings", label: "Briefingi" },
    ],
  },
  {
    label: "Konkurencja",
    hint: "Rynek i ceny",
    icon: (
      <svg {...S}>
        <path d="M3 21V9l6-4 6 4v12" />
        <path d="M15 21V13l6 3v5M3 21h18M7 12h.01M11 12h.01" />
      </svg>
    ),
    items: [{ href: "/competitor", label: "Konkurencja" }],
  },
  {
    label: "Formater",
    hint: "Formater · Streszczacz",
    separatorBefore: true,
    icon: (
      <svg {...S}>
        <path d="M4 6h16M4 11h16M4 16h10M4 21h7" />
      </svg>
    ),
    items: [
      { href: "/format", label: "Formater" },
      { href: "/summarize", label: "Streszczacz" },
    ],
  },
  {
    label: "Grafiki",
    hint: "Grafiki · Vision",
    icon: (
      <svg {...S}>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="1.7" />
        <path d="m4 18 5-4.5 4 3.5 3-2.5 4 3.5" />
      </svg>
    ),
    items: [
      { href: "/generate", label: "Grafiki" },
      { href: "/vision", label: "Vision" },
    ],
  },
  {
    label: "Szukaj",
    hint: "Szukaj · Podróże",
    icon: (
      <svg {...S}>
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
    ),
    items: [
      { href: "/search", label: "Szukaj" },
      { href: "/travel", label: "Podróże" },
    ],
  },
  {
    label: "Bezpieczeństwo",
    hint: "Uprawnienia i logi",
    separatorBefore: true,
    icon: (
      <svg {...S}>
        <path d="M12 3l7 3v6c0 4.2-2.9 7.9-7 9-4.1-1.1-7-4.8-7-9V6Z" />
        <path d="m9 12 2 2 4-4" />
      </svg>
    ),
    items: [{ href: "/admin/security", label: "Bezpieczeństwo" }],
  },
];

/** Czy ścieżka odpowiada danemu linkowi (dopasowanie po całym segmencie). */
export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

/** Grupa + strona odpowiadające bieżącej ścieżce (do okruszka w topbarze). */
export function findCurrent(pathname: string): { group: NavGroup; item: NavItem } | null {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((i) => isActive(pathname, i.href));
    if (item) return { group, item };
  }
  return null;
}
