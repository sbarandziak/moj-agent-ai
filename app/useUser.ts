// ============================================================
// Warsztat 3 (Lekcja 07): Kontekst zalogowanego użytkownika
// ------------------------------------------------------------
// AuthGate (app/auth.tsx) dostarcza tu obiekt User z Supabase Auth.
// Strony pod ochroną wołają useUser() i dostają user.id do filtrowania
// danych per użytkownik. Wydzielone do osobnego modułu, żeby uniknąć
// cyklicznego importu auth.tsx <-> nav.tsx.
// ============================================================

"use client";

import { createContext, useContext } from "react";
import type { User } from "@supabase/supabase-js";

export const UserContext = createContext<User | null>(null);

// Zwraca zalogowanego użytkownika. Strony chronione renderują się wyłącznie
// wewnątrz AuthGate, więc user jest tu zawsze dostępny.
export function useUser(): User {
  const user = useContext(UserContext);
  if (!user) {
    throw new Error(
      "useUser() użyty poza AuthGate — brak zalogowanego użytkownika"
    );
  }
  return user;
}
