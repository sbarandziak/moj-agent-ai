// ============================================================
// Lekcja 11, W4: ikona dla iOS („Dodaj do ekranu głównego")
// ------------------------------------------------------------
// Safari nie bierze ikony z manifestu ani SVG-owego favicona — chce
// apple-touch-icon w PNG. Konwencja Next.js `app/apple-icon.tsx` generuje
// go z tego pliku i sama wstawia <link rel="apple-touch-icon">.
// 180×180 to rozmiar, którego oczekuje iOS.
// ============================================================

import { ImageResponse } from "next/og";
import { BrandMark } from "./brand-mark";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(<BrandMark size={180} />, size);
}
