import type { Metadata } from "next";
import "./globals.css";
import AuthGate from "./auth";

export const metadata: Metadata = {
  title: "Mój Agent AI — dashboard",
  description:
    "Centrum dowodzenia agenta: pogoda, kursy walut i święta na żywo, plus asystent podróży i agent ReAct",
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
