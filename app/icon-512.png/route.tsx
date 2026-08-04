// ============================================================
// Lekcja 11, W4: ikona 512×512 dla PWA (Android / Chrome)
// ------------------------------------------------------------
// Chrome wymaga do instalacji ikony rastrowej co najmniej 144 px; sam
// favicon w SVG mu nie wystarcza. Zamiast wrzucać PNG do repo generujemy
// go tak samo jak og:image — z kodu.
//
// Katalog nazywa się dosłownie „icon-512.png", więc trasa serwuje się pod
// /icon-512.png i manifest może na nią wskazać zwykłą ścieżką z rozszerzeniem.
// force-static: obrazek jest stały, niech powstanie raz przy budowaniu.
// ============================================================

import { ImageResponse } from "next/og";
import { BrandMark } from "../brand-mark";

export const dynamic = "force-static";

export function GET() {
  return new ImageResponse(<BrandMark size={512} />, {
    width: 512,
    height: 512,
  });
}
