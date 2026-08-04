import type { Metadata, Viewport } from "next";
import "./globals.css";
import AuthGate from "./auth";

// Adres produkcyjny — potrzebny, bo og:image i og:url muszą być pełnymi
// URL-ami, a nie ścieżkami. Na innym wdrożeniu wystarczy NEXT_PUBLIC_SITE_URL.
const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://moj-agent-ai-rosy.vercel.app";

const TITLE = "Mój Agent AI — Twój osobisty asystent";
const DESCRIPTION =
  "Agent AI, który pamięta Twoje rozmowy, zna dokumenty Twojej firmy i pracuje 24/7.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  // Podstrony mogą nadpisać sam tytuł — szablon dokleja markę.
  title: { default: TITLE, template: "%s · Mój Agent AI" },
  description: DESCRIPTION,
  applicationName: "Mój Agent AI",
  openGraph: {
    type: "website",
    locale: "pl_PL",
    url: "/",
    siteName: "Mój Agent AI",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  // Nazwa pod ikoną po „Dodaj do ekranu głównego" na iOS.
  appleWebApp: { capable: true, title: "Agent", statusBarStyle: "default" },
};

// Kolor paska przeglądarki na telefonie — zgodny z tłem obu motywów.
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f3" },
    { media: "(prefers-color-scheme: dark)", color: "#14151a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pl">
      <head>
        {/* Fonty systemu wizualnego: Instrument Sans (tekst) + JetBrains Mono
            (liczby, plakietki .eyebrow). Ładowane z CDN — bez kroku build-time. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* AuthGate decyduje: /login samodzielnie, reszta = rail + topbar + treść
            (tylko dla zalogowanych; niezalogowany -> redirect na /login). */}
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
