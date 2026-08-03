"use client";

// ============================================================
// Rail: pionowy pasek ikon (na telefonie — poziomy, na dole).
// Grupa z jedną stroną = link + dymek z podpowiedzią.
// Grupa z wieloma stronami = przycisk otwierający menu
// (hover na desktopie, klik wszędzie).
//
// W railu są tylko grupy główne (PRIMARY_GROUPS). Reszta siedzi pod jednym
// przyciskiem „Więcej" — inaczej 12 ikon wymagało ~650px wysokości okna
// i rail musiał się ściskać. Podział ustawia flaga `secondary` w nav-items.tsx.
// ============================================================

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  PRIMARY_GROUPS,
  SECONDARY_GROUPS,
  MORE_ICON,
  isActive,
} from "./nav-items";

const MORE_LABEL = "Więcej";

export default function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState<string | null>(null);
  const railRef = useRef<HTMLElement>(null);

  // Ikona „Więcej" świeci, gdy otwarta strona siedzi w którejś z ukrytych grup.
  const moreActive = SECONDARY_GROUPS.some((g) =>
    g.items.some((i) => isActive(pathname, i.href))
  );

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
        {PRIMARY_GROUPS.map((group) => {
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
                    className="rail-btn has-more"
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

        {/* Jeden przycisk na całą resztę grup. Nic nie znika — każda strona
            z SECONDARY_GROUPS jest tu wypisana pod nazwą swojej grupy. */}
        {SECONDARY_GROUPS.length > 0 && (
          <div className="rail-item">
            <div className="rail-sep" />
            <div className="rail-group">
              <button
                type="button"
                className="rail-btn has-more"
                aria-current={moreActive ? "true" : undefined}
                aria-expanded={open === MORE_LABEL}
                aria-label={MORE_LABEL}
                onClick={() =>
                  setOpen((o) => (o === MORE_LABEL ? null : MORE_LABEL))
                }
              >
                {MORE_ICON}
              </button>

              <div
                className={`rail-flyout scrollable ${
                  open === MORE_LABEL ? "open" : ""
                }`}
              >
                {SECONDARY_GROUPS.map((group) => (
                  <div className="rail-flyout-section" key={group.label}>
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
                ))}
              </div>
            </div>
          </div>
        )}
      </nav>
    </aside>
  );
}
