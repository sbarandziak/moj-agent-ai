"use client";

// ============================================================
// Lekcja 11, W4: przełącznik motywu jasny/ciemny
// ------------------------------------------------------------
// Stan trzyma atrybut `data-theme` na <html> — ustawia go skrypt w
// layout.tsx jeszcze przed pierwszym malowaniem (żeby strona nie mrugała),
// a ten przycisk tylko go przestawia i zapisuje wybór w localStorage.
//
// Dlaczego stan czytamy w useEffect, a nie od razu: serwer nie zna
// localStorage ani preferencji systemu, więc pierwszy render MUSI być
// neutralny — inaczej React zgłosi rozjazd hydracji.
// ============================================================

import { useEffect, useState } from "react";

type Theme = "light" | "dark";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    setTheme(current === "dark" ? "dark" : "light");
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      // Wybór użytkownika wygrywa z preferencją systemu przy kolejnej wizycie.
      localStorage.setItem("theme", next);
    } catch {
      // Tryb prywatny bez localStorage — motyw i tak przełączy się teraz.
    }
    setTheme(next);
  }

  const dark = theme === "dark";
  const label = dark ? "Włącz motyw jasny" : "Włącz motyw ciemny";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      title={label}
      aria-label={label}
      // Do czasu odczytania motywu przycisk jest nieaktywny wizualnie —
      // inaczej mignąłby złą ikoną.
      data-ready={theme !== null ? "true" : undefined}
    >
      {dark ? "☀️" : "🌙"}
    </button>
  );
}
