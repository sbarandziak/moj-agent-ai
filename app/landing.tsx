// ============================================================
// Warsztat 1 (Lekcja 11): Landing page — pierwsze wrażenie
// ------------------------------------------------------------
// Widok strony "/" dla NIEZALOGOWANYCH. Renderuje go app/page.tsx,
// gdy w UserContext nie ma użytkownika (AuthGate przepuszcza "/"
// bez sesji jako ścieżkę publiczną — patrz app/auth.tsx).
// Cztery sekcje: hero -> funkcje -> demo (mockup czatu) -> CTA.
// Style: klasy .lp-* w globals.css (własny blok, nic wspólnego
// z resztą aplikacji, więc nie ma ryzyka rozjechania podstron).
// ============================================================

import Link from "next/link";

// Nazwa i obietnica produktu — jedno miejsce, żeby zmienić brand.
const AGENT_NAME = "Mój Agent AI";
const TAGLINE =
  "Twój osobisty asystent AI, który zna dokumenty Twojej firmy i pamięta każdą rozmowę.";

// Karty funkcji. Opisy trzymają się tego, co agent naprawdę potrafi
// (historia rozmów, RAG z cytowaniem, izolacja per user, cron).
const FEATURES = [
  {
    icon: "🧠",
    title: "Pamięta Twoje rozmowy",
    text: "Historia zapisana przy Twoim koncie. Agent wraca do kontekstu i zwraca się do Ciebie po imieniu.",
  },
  {
    icon: "📚",
    title: "Zna dokumenty Twojej firmy",
    text: "Wgrywasz cennik, FAQ, regulamin — agent odpowiada z Twoich źródeł i pokazuje, z którego dokumentu.",
  },
  {
    icon: "🔐",
    title: "Prywatne dane per user",
    text: "Logowanie e-mailem. Rozmowy i pliki widzi wyłącznie właściciel konta — nikt inny.",
  },
  {
    icon: "⚡",
    title: "Pracuje 24/7",
    text: "Poranny briefing z pogodą i kursami walut przychodzi automatycznie, nawet gdy śpisz.",
  },
];

export default function Landing() {
  return (
    <div className="lp">
      {/* Animowane tło — dwie plamy gradientu pod całą stroną. */}
      <div className="lp-glow" aria-hidden="true" />

      {/* ---------- 1. HERO ---------- */}
      <header className="lp-hero">
        {/* Plakietka z logo jest skrótem do logowania — tak jak nazwa
            produktu w topbarze prowadzi do strony startowej. */}
        <Link className="lp-badge" href="/login">
          🤖 {AGENT_NAME}
        </Link>
        <h1 className="lp-title">{AGENT_NAME}</h1>
        <p className="lp-tagline">{TAGLINE}</p>

        <div className="lp-actions">
          <Link className="lp-cta" href="/login">
            🚀 Zacznij za darmo
          </Link>
          <a className="lp-cta-ghost" href="#demo">
            Zobacz, jak działa
          </a>
        </div>

        <p className="lp-note">Konto w 30 sekund. Bez karty.</p>
      </header>

      {/* ---------- 2. FUNKCJE ---------- */}
      <section className="lp-section">
        <h2 className="lp-h2">Co dostajesz</h2>
        <div className="lp-features">
          {FEATURES.map((f) => (
            <article className="lp-feature" key={f.title}>
              <div className="lp-feature-icon">{f.icon}</div>
              <h3 className="lp-feature-title">{f.title}</h3>
              <p className="lp-feature-text">{f.text}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ---------- 3. DEMO ---------- */}
      <section className="lp-section" id="demo">
        <h2 className="lp-h2">Zapytaj o cennik — odpowie z Twoich dokumentów</h2>
        <p className="lp-lead">
          Agent nie zgaduje. Najpierw przeszukuje Twoją bazę wiedzy, a potem
          pokazuje, skąd wziął odpowiedź.
        </p>

        {/* Mockup interfejsu czatu — czysty HTML/CSS, bez zrzutu ekranu. */}
        <div className="lp-mock">
          <div className="lp-mock-bar">
            <span className="lp-dot" />
            <span className="lp-dot" />
            <span className="lp-dot" />
            <div className="lp-mock-title">{AGENT_NAME} — czat</div>
          </div>

          <div className="lp-mock-body">
            <div className="lp-mock-user">Ile kosztuje pakiet Premium?</div>

            <div className="lp-mock-tool">
              🔎 searchKnowledge · znaleziono 3 fragmenty
            </div>

            <div className="lp-mock-ai">
              <p>
                Pakiet <strong>Premium</strong> kosztuje{" "}
                <strong>299 zł netto miesięcznie</strong>. Zawiera nielimitowane
                rozmowy, bazę wiedzy do 500 dokumentów i wsparcie w 24 h.
              </p>
              <div className="lp-mock-cite">📎 Źródło: Cennik 2026</div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- 4. CTA NA KONIEC ---------- */}
      <section className="lp-final">
        <h2 className="lp-final-title">Gotowy? Zacznij w 30 sekund.</h2>
        <p className="lp-final-text">
          Zakładasz konto, wgrywasz pierwszy dokument i od razu pytasz.
        </p>
        <Link className="lp-cta" href="/login">
          Stwórz konto
        </Link>
      </section>

      <footer className="lp-footer">
        © {AGENT_NAME} · zbudowane na kursie „laba agenci AI”
      </footer>
    </div>
  );
}
