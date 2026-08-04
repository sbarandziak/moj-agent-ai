// ============================================================
// Lekcja 11, W4: manifest PWA — „Dodaj do ekranu głównego"
// ------------------------------------------------------------
// Konwencja Next.js `app/manifest.ts` serwuje /manifest.webmanifest i sama
// wstawia <link rel="manifest"> — nie trzeba go dopisywać w layout.tsx.
//
// Kolory to tokeny systemu „paper" (--paper i --ink z globals.css) wpisane
// wprost: manifest czyta system operacyjny, zanim jakikolwiek CSS się
// załaduje. background_color powinien być tłem ekranu startowego, więc
// zostaje jasny nawet dla użytkownika z motywem ciemnym.
// ============================================================

import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Mój Agent AI",
    short_name: "Agent",
    description:
      "Osobisty asystent AI: pamięta rozmowy, zna dokumenty Twojej firmy i pracuje 24/7.",
    lang: "pl",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f6f3",
    theme_color: "#f7f6f3",
    icons: [
      // SVG dla przeglądarek, które je przyjmują (ostry w każdym rozmiarze).
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      // PNG dla Chrome/Androida — bez niego nie ma monitu o instalację.
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // Gradient wypełnia cały kwadrat, więc ta sama grafika znosi
      // przycięcie do koła/kwadratu z zaokrągleniem na Androidzie.
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
