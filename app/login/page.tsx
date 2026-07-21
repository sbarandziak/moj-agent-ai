// ============================================================
// Warsztat 3 (Lekcja 07): Strona /login — Supabase Auth
// ------------------------------------------------------------
// Jeden formularz z przełącznikiem Logowanie / Rejestracja.
//   - rejestracja: supabase.auth.signUp({ email, password })
//   - logowanie:   supabase.auth.signInWithPassword({ email, password })
// Po udanej autoryzacji AuthGate wykrywa sesję i przekierowuje na /.
// ============================================================

"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Mode = "login" | "register";

// Tłumaczy najczęstsze komunikaty Supabase na polski.
function translateError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "Nieprawidłowy email lub hasło.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Ten email jest już zarejestrowany — zaloguj się.";
  if (m.includes("password should be at least"))
    return "Hasło musi mieć co najmniej 6 znaków.";
  if (m.includes("unable to validate email") || m.includes("invalid email"))
    return "Nieprawidłowy adres email.";
  if (m.includes("email not confirmed"))
    return "Email nie został potwierdzony — sprawdź skrzynkę.";
  return msg;
}

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      if (mode === "register") {
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) {
          setError(translateError(error.message));
          return;
        }
        if (!data.session) {
          // Sesji brak = w Supabase włączone potwierdzanie email.
          setInfo(
            "Konto utworzone. Potwierdź adres w mailu, a potem zaloguj się poniżej."
          );
          setMode("login");
          return;
        }
        // Sesja od razu -> AuthGate przekieruje na stronę główną.
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          setError(translateError(error.message));
          return;
        }
        // Sukces -> AuthGate przekieruje na /.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  const isRegister = mode === "register";

  return (
    <div className="login-wrap">
      <div className="login-card">
        <div className="login-brand">🤖 Mój Agent AI</div>
        <h1 className="login-title">
          {isRegister ? "Załóż konto" : "Zaloguj się"}
        </h1>
        <p className="login-sub">
          {isRegister
            ? "Utwórz konto — Twoje rozmowy i dokumenty będą prywatne."
            : "Witaj z powrotem. Zaloguj się, aby wrócić do swoich rozmów."}
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label className="login-label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            className="login-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jan@example.com"
            autoComplete="email"
            required
            disabled={loading}
          />

          <label className="login-label" htmlFor="password">
            Hasło
          </label>
          <input
            id="password"
            className="login-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="min. 6 znaków"
            autoComplete={isRegister ? "new-password" : "current-password"}
            minLength={6}
            required
            disabled={loading}
          />

          {error && <div className="login-msg login-msg-err">⚠️ {error}</div>}
          {info && <div className="login-msg login-msg-ok">✅ {info}</div>}

          <button className="login-submit" type="submit" disabled={loading}>
            {loading
              ? "⏳ Chwila…"
              : isRegister
                ? "Zarejestruj się"
                : "Zaloguj się"}
          </button>
        </form>

        <div className="login-toggle">
          {isRegister ? "Masz już konto?" : "Nie masz konta?"}{" "}
          <button
            type="button"
            className="login-toggle-btn"
            onClick={() => {
              setMode(isRegister ? "login" : "register");
              setError(null);
              setInfo(null);
            }}
            disabled={loading}
          >
            {isRegister ? "Zaloguj się" : "Zarejestruj się"}
          </button>
        </div>
      </div>
    </div>
  );
}
