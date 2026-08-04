// Strona główna "/" — dwa widoki zależnie od sesji (W1 Lekcja 11):
//   zalogowany     -> dashboard agenta (jak dotychczas, W4 §5 Lekcji 04),
//   niezalogowany  -> landing page.
// AuthGate (app/auth.tsx) trzyma "/" na liście ścieżek publicznych, więc
// bez sesji nie ma już redirectu na /login — decyzja zapada tutaj.
"use client";

import { useOptionalUser } from "./useUser";
import Dashboard from "./dashboard/Dashboard";
import Landing from "./landing";

export default function Home() {
  const user = useOptionalUser();
  return user ? <Dashboard /> : <Landing />;
}
