// ============================================================
// Lekcja 11, W4: og:image — podgląd linku w social media
// ------------------------------------------------------------
// Obrazek NIE leży w repo jako PNG — generuje go Next (next/og) z tego
// pliku. Zysk: żadnych binariów w gicie, a zmiana nazwy czy tagline'u to
// zmiana tekstu, nie wyprawa do Canvy.
//
// Nazwa pliku jest konwencją Next.js: `app/opengraph-image.tsx` sam wchodzi
// do <meta property="og:image">, bez wpisywania go w metadata w layout.tsx.
// Ten sam obrazek Next podpina pod twittera (summary_large_image).
//
// Kolory są wpisane wprost, nie tokenami z globals.css — obrazek powstaje
// po stronie serwera, gdzie nie ma CSS ani motywu użytkownika. To zawsze
// wersja jasna („paper").
// ============================================================

import { ImageResponse } from "next/og";

export const alt = "Mój Agent AI — osobisty asystent z bazą wiedzy firmy";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PAPER = "#f7f6f3";
const INK = "#16181c";
const MUTED = "#7a7c77";
const LINE = "#e5e3dd";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: PAPER,
          padding: 72,
        }}
      >
        {/* Marka: kwadrat z gradientem + nazwa (jak .brand w topbarze) */}
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div
            style={{
              display: "flex",
              width: 64,
              height: 64,
              borderRadius: 18,
              background: "linear-gradient(135deg, #7c3aed, #2563eb)",
            }}
          />
          <div style={{ display: "flex", fontSize: 34, color: MUTED }}>
            Mój Agent AI
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 92,
              fontWeight: 600,
              color: INK,
              letterSpacing: -2,
            }}
          >
            Twój osobisty asystent AI
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 40,
              color: MUTED,
              marginTop: 18,
              lineHeight: 1.35,
            }}
          >
            Pamięta rozmowy, zna dokumenty Twojej firmy i pracuje 24/7.
          </div>
        </div>

        {/* Plakietki z możliwościami — to samo, co karty na landingu */}
        <div style={{ display: "flex", gap: 14 }}>
          {["Pamięć rozmów", "Baza wiedzy", "Automatyzacje", "Prywatne dane"].map(
            (label) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  padding: "14px 26px",
                  borderRadius: 999,
                  border: `2px solid ${LINE}`,
                  background: "#ffffff",
                  fontSize: 28,
                  color: INK,
                }}
              >
                {label}
              </div>
            )
          )}
        </div>
      </div>
    ),
    size
  );
}
