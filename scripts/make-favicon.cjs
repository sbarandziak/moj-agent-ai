/*
 * Generator app/favicon.ico  —  uruchom:  node scripts/make-favicon.cjs
 * ---------------------------------------------------------------------
 * Po co osobny skrypt: reszta ikon (og:image, apple-icon, icon-512.png)
 * powstaje w locie z kodu, ale favicon.ico MUSI być plikiem — przeglądarki
 * i boty pytają o /favicon.ico na sztywno, nie czytając <head>. To jedyny
 * binarny plik w tym repo, więc niech przynajmniej da się go odtworzyć.
 *
 * Skrypt renderuje znak marki w trzech rozmiarach (16/32/48 px) tym samym
 * silnikiem co pozostałe ikony (next/og), a potem skleja je w kontener ICO.
 *
 * UWAGA: geometria znaku jest tu POWTÓRZONA z app/brand-mark.tsx, bo skrypt
 * w czystym Node nie zaimportuje JSX. Zmieniasz logo? Popraw oba pliki
 * i puść ten skrypt ponownie.
 */

const fs = require("fs");
const path = require("path");
const React = require("react");
const { ImageResponse } = require("next/og");

const h = React.createElement;

// Odpowiednik <BrandMark size={n}> z app/brand-mark.tsx.
function mark(size) {
  const eye = () =>
    h("div", {
      style: {
        display: "flex",
        width: size * 0.115,
        height: size * 0.115,
        borderRadius: size,
        background: "#2563eb",
      },
    });

  return h(
    "div",
    {
      style: {
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: size * 0.045,
        background: "linear-gradient(135deg, #7c3aed, #2563eb)",
      },
    },
    h("div", {
      style: {
        display: "flex",
        width: size * 0.085,
        height: size * 0.085,
        borderRadius: size,
        background: "#ffffff",
      },
    }),
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: size * 0.1,
          width: size * 0.52,
          height: size * 0.38,
          borderRadius: size * 0.11,
          background: "#ffffff",
        },
      },
      eye(),
      eye()
    )
  );
}

/*
 * Kontener ICO:
 *   ICONDIR       6 B   — rezerwa(2) + typ(2, 1 = ikona) + liczba obrazków(2)
 *   ICONDIRENTRY 16 B   — po jednym na rozmiar, z długością i offsetem danych
 *   dane          ...   — tu wprost bajty PNG (dozwolone od Windows Vista;
 *                         wszystkie dzisiejsze przeglądarki to czytają)
 */
function buildIco(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);

  const entries = [];
  let offset = 6 + images.length * 16;

  for (const { size, png } of images) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // szerokość (0 = 256)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // wysokość
    e.writeUInt8(0, 2); // paleta: brak
    e.writeUInt8(0, 3); // rezerwa
    e.writeUInt16LE(1, 4); // planes
    e.writeUInt16LE(32, 6); // bitów na piksel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    entries.push(e);
    offset += png.length;
  }

  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

(async () => {
  const sizes = [16, 32, 48];
  const images = [];

  for (const size of sizes) {
    const res = new ImageResponse(mark(size), { width: size, height: size });
    const png = Buffer.from(await res.arrayBuffer());
    images.push({ size, png });
    console.log(`  ${size}x${size}: ${png.length} B`);
  }

  const out = path.join(__dirname, "..", "app", "favicon.ico");
  fs.writeFileSync(out, buildIco(images));
  console.log("zapisano", out, `(${fs.statSync(out).size} B)`);
})();
