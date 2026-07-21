"use client";

import { useState } from "react";

// Klikalne przykłady promptów — inspiracja jednym kliknięciem.
const EXAMPLES = [
  "Minimalistyczne logo kawiarni w stylu japońskim",
  "Post na Instagram: kawa latte art, ciepłe światło, widok z góry",
  "Kreacja reklamowa: wyprzedaż letnia -50%, nowoczesny design",
  "Ikona aplikacji: robot AI, gradient fioletowo-niebieski, flat design",
  "Infografika: 5 kroków do produktywności, pastelowe kolory",
  "Zdjęcie produktowe: elegancki zegarek na ciemnym tle",
];

export default function GeneratePage() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [comment, setComment] = useState("");
  const [error, setError] = useState("");
  // Prompt, którym wygenerowano aktualny obraz (do przycisku "Ponownie").
  const [lastPrompt, setLastPrompt] = useState("");

  async function generate(text: string) {
    const t = text.trim();
    if (!t || loading) return;

    setLoading(true);
    setError("");
    setImage(null);
    setComment("");
    setLastPrompt(t);

    try {
      const res = await fetch("/api/generate-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: t }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data?.error ?? "Nie udało się wygenerować obrazu.");
      } else {
        setImage(data.image);
        setComment(data.text ?? "");
      }
    } catch {
      setError("Błąd połączenia z serwerem. Spróbuj ponownie.");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    generate(prompt);
  }

  // Pobierz obraz jako PNG — programatyczny klik w ukryty <a>.
  function download() {
    if (!image) return;
    const a = document.createElement("a");
    a.href = image;
    a.download = "ai-generated.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="app">
      <header className="header">
        🎨 Generator grafik AI
        <div className="subtitle">
          Opisz co chcesz - AI stworzy obraz w kilka sekund
        </div>
      </header>

      <div className="messages">
        {/* Ekran startowy: przykłady promptów. */}
        {!image && !loading && !error && (
          <div className="empty">
            <p>Opisz obraz, a AI go namaluje. 🎨</p>
            <p className="empty-hint">Kliknij przykład albo wpisz własny opis:</p>
            <div className="examples">
              {EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  className="example-btn"
                  onClick={() => {
                    setPrompt(ex);
                    generate(ex);
                  }}
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Stan ładowania: pulsujący placeholder. */}
        {loading && (
          <div className="img-loading">
            <div className="img-skeleton" />
            <p className="img-loading-text">Generuję... (5-15 sekund)</p>
          </div>
        )}

        {/* Błąd. */}
        {error && !loading && (
          <div className="img-error">
            ⚠️ {error}
            <div>
              <button
                type="button"
                className="ctx-btn"
                onClick={() => generate(lastPrompt || prompt)}
                disabled={!(lastPrompt || prompt)}
              >
                🔄 Spróbuj ponownie
              </button>
            </div>
          </div>
        )}

        {/* Wynik: obraz + komentarz + akcje. */}
        {image && !loading && (
          <div className="img-result">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image} alt={lastPrompt} className="img-generated" />
            {comment && <p className="img-comment">{comment}</p>}
            <div className="img-actions">
              <button type="button" className="ctx-btn" onClick={download}>
                💾 Pobierz
              </button>
              <button
                type="button"
                className="ctx-btn"
                onClick={() => generate(lastPrompt)}
              >
                🔄 Ponownie
              </button>
            </div>
          </div>
        )}
      </div>

      <form className="form" onSubmit={handleSubmit}>
        <textarea
          className="input textarea"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Opisz obraz który chcesz wygenerować..."
          rows={2}
          onKeyDown={(e) => {
            // Enter wysyła, Shift+Enter = nowa linia.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              generate(prompt);
            }
          }}
          autoFocus
        />
        <button
          className="send"
          type="submit"
          disabled={loading || !prompt.trim()}
        >
          🎨 Generuj
        </button>
      </form>
    </div>
  );
}
