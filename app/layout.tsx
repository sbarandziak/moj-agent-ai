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
    // suppressHydrationWarning: data-theme dokłada poniższy skrypt, więc
    // serwerowy HTML i ten w przeglądarce różnią się o ten jeden atrybut.
    <html lang="pl" suppressHydrationWarning>
      <head>
        {/* Motyw ustawiamy PRZED pierwszym malowaniem — inaczej użytkownik
            z motywem ciemnym dostaje na ułamek sekundy białą stronę.
            Wybór z localStorage wygrywa, a gdy go nie ma, idziemy za
            ustawieniem systemu. Przełącznik: app/theme-toggle.tsx. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t!=="dark"&&t!=="light"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}})()`,
          }}
        />
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
