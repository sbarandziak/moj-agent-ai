// ============================================================
// Lekcja 11, W4: znak marki dla generowanych ikon (next/og)
// ------------------------------------------------------------
// Ten sam robot co w app/icon.svg (favicon), tylko złożony z divów, bo
// generator obrazków (satori) rysuje układ flexbox, a nie dowolne SVG.
// Używają go: app/apple-icon.tsx (iOS) i app/icon-512.png (PWA).
//
// Wszystko skaluje się od jednego parametru `size`, żeby 180 px i 512 px
// wyglądały identycznie, a nie „podobnie".
// ============================================================

export function BrandMark({ size }: { size: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: size * 0.045,
        // Gradient wypełnia CAŁY kwadrat — dzięki temu ikona przechodzi
        // maskowanie na Androidzie (maskable) bez białych rogów.
        background: "linear-gradient(135deg, #7c3aed, #2563eb)",
      }}
    >
      {/* antenka */}
      <div
        style={{
          display: "flex",
          width: size * 0.085,
          height: size * 0.085,
          borderRadius: size,
          background: "#ffffff",
        }}
      />
      {/* głowa z dwoma okami */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: size * 0.1,
          width: size * 0.52,
          height: size * 0.38,
          borderRadius: size * 0.11,
          background: "#ffffff",
        }}
      >
        <div
          style={{
            display: "flex",
            width: size * 0.115,
            height: size * 0.115,
            borderRadius: size,
            background: "#2563eb",
          }}
        />
        <div
          style={{
            display: "flex",
            width: size * 0.115,
            height: size * 0.115,
            borderRadius: size,
            background: "#2563eb",
          }}
        />
      </div>
    </div>
  );
}
