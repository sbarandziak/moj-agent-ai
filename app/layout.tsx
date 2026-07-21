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
      <body>
        {/* AuthGate decyduje: /login samodzielnie, reszta = sidebar + treść
            (tylko dla zalogowanych; niezalogowany -> redirect na /login). */}
        <AuthGate>{children}</AuthGate>
      </body>
    </html>
  );
}
