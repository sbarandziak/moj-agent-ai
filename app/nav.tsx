"use client";

// ============================================================
// Rail: pionowy pasek ikon (na telefonie — poziomy, na dole).
// Grupa z jedną stroną = link + dymek z podpowiedzią.
// Grupa z wieloma stronami = przycisk otwierający menu
// (hover na desktopie, klik wszędzie).
// ============================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { NAV_GROUPS, isActive } from "./nav-items";

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const railRef = useRef<HTMLElement>(null);

  // Zmiana strony zamyka menu.
  useEffect(() => setOpen(null), [pathname]);

  // Klik poza railem zamyka menu (istotne na dotyku, gdzie nie ma hovera).
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!railRef.current?.contains(e.target as Node)) setOpen(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <aside className="rail" ref={railRef}>
      <nav className="rail-card" aria-label="Nawigacja główna">
        {NAV_GROUPS.map((group) => {
          const active = group.items.some((i) => isActive(pathname, i.href));
          const single = group.items.length === 1;

          return (
            <div key={group.label} className="rail-item">
              {group.separatorBefore && <div className="rail-sep" />}
              <div className="rail-group">
                {single ? (
                  <Link
                    href={group.items[0].href}
                    className="rail-btn"
                    aria-current={active ? "true" : undefined}
                    aria-label={group.label}
                  >
                    {group.icon}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="rail-btn"
                    aria-current={active ? "true" : undefined}
                    aria-expanded={open === group.label}
                    aria-label={group.label}
                    onClick={() =>
                      setOpen((o) => (o === group.label ? null : group.label))
                    }
                  >
                    {group.icon}
                  </button>
                )}

                {single ? (
                  <span className="rail-flyout tip-only" role="tooltip">
                    {group.label}
                  </span>
                ) : (
                  <div
                    className={`rail-flyout ${open === group.label ? "open" : ""}`}
                  >
                    <span className="rail-flyout-title">{group.label}</span>
                    {group.items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`rail-flyout-link ${
                          isActive(pathname, item.href) ? "active" : ""
                        }`}
                        onClick={() => setOpen(null)}
                      >
                        {item.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
