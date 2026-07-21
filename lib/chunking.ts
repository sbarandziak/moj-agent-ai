// ============================================================
// Warsztat 2 (Lekcja 06): Chunkowanie tekstu
// ------------------------------------------------------------
// Dzieli długi dokument na mniejsze fragmenty (~chunkSize znaków),
// z zakładką (overlap) między sąsiednimi fragmentami, żeby nie tracić
// kontekstu na granicach. Prosty algorytm oparty na zdaniach — bez ML.
// ============================================================

// Dzieli tekst na zdania po . ! ? oraz nowych liniach.
// Znaki interpunkcyjne zostają przyklejone do zdania (regex z lookbehind).
function splitIntoSentences(text: string): string[] {
  return text
    // po każdym . ! ? (opcjonalnie z cudzysłowem/nawiasem) wstaw podział
    .replace(/([.!?]["')\]]?)\s+/g, "$1\n")
    .split(/\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// Zwraca ostatnie ~overlap znaków tekstu, ucięte do granicy słowa,
// żeby zakładka zaczynała się od pełnego wyrazu (a nie w połowie).
function tailOverlap(text: string, overlap: number): string {
  if (overlap <= 0 || text.length <= overlap) return text;
  const tail = text.slice(text.length - overlap);
  const spaceIdx = tail.indexOf(" ");
  return spaceIdx > 0 ? tail.slice(spaceIdx + 1) : tail;
}

// Główna funkcja: łączy zdania w fragmenty ~chunkSize znaków,
// każdy z zakładką ~overlap znaków z poprzednim.
export function splitIntoChunks(
  text: string,
  chunkSize: number = 1000,
  overlap: number = 50
): string[] {
  const clean = text.trim();
  if (!clean) return [];

  const sentences = splitIntoSentences(clean);
  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    // Pojedyncze bardzo długie zdanie (> chunkSize) tnij twardo na kawałki.
    if (sentence.length > chunkSize) {
      if (current) {
        chunks.push(current.trim());
        current = "";
      }
      for (let i = 0; i < sentence.length; i += chunkSize - overlap) {
        chunks.push(sentence.slice(i, i + chunkSize).trim());
      }
      continue;
    }

    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length > chunkSize && current) {
      // Bieżący fragment jest pełny — zamknij go i zacznij nowy z zakładką.
      chunks.push(current.trim());
      const overlapText = tailOverlap(current, overlap);
      current = overlapText ? `${overlapText} ${sentence}` : sentence;
    } else {
      current = candidate;
    }
  }

  if (current.trim()) chunks.push(current.trim());
  return chunks;
}
