"use client";

// ============================================================
// Lekcja 10, W3: Hook licznika budżetu tokenów
// ------------------------------------------------------------
// Pobiera z /api/usage dzienne zużycie zalogowanego użytkownika i pozwala
// je odświeżyć (refresh) — wołamy to po każdej zakończonej turze rozmowy,
// bo dopiero wtedy trasa zdążyła zapisać usage do api_usage.
// ============================================================

import { useCallback, useEffect, useState } from "react";

export type Budget = {
  used: number;
  limit: number;
  remaining: number;
  percent: number;
};

export function useBudget(userId: string | null | undefined) {
  const [budget, setBudget] = useState<Budget | null>(null);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      const res = await fetch(`/api/usage?userId=${encodeURIComponent(userId)}`);
      if (!res.ok) {
        // Brak tabeli/klucza — chowamy licznik zamiast straszyć błędem.
        setBudget(null);
        return;
      }
      setBudget((await res.json()) as Budget);
    } catch {
      setBudget(null);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { budget, refresh };
}

// Kolor paska/licznika: zielony do 60%, żółty do 80%, czerwony wyżej
// (80% to próg alertu z W4).
export function budgetColor(percent: number): string {
  if (percent >= 80) return "#dc2626";
  if (percent >= 60) return "#d97706";
  return "#16a34a";
}
