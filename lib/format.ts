// ============================================================
// Warsztat 4 (Lekcja 05): Formatowanie dat na liście rozmów
// ============================================================

const MONTHS_PL = [
  "stycznia", "lutego", "marca", "kwietnia", "maja", "czerwca",
  "lipca", "sierpnia", "września", "października", "listopada", "grudnia",
];

// "2 godziny temu", "wczoraj", "15 czerwca 2026" — jak w ChatGPT.
export function relativeTime(iso: string): string {
  const then = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - then.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffH / 24);

  if (diffMin < 1) return "przed chwilą";
  if (diffMin < 60) return `${diffMin} ${plural(diffMin, "minutę", "minuty", "minut")} temu`;
  if (diffH < 24) return `${diffH} ${plural(diffH, "godzinę", "godziny", "godzin")} temu`;
  if (diffDays === 1) return "wczoraj";
  if (diffDays < 7) return `${diffDays} dni temu`;

  return `${then.getDate()} ${MONTHS_PL[then.getMonth()]} ${then.getFullYear()}`;
}

// Godzina "14:32" — do bąbelków w podglądzie rozmowy.
export function formatClock(iso: string): string {
  return new Date(iso).toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Data pełna "15 czerwca 2026, 14:32" — nagłówek podglądu rozmowy.
export function formatFull(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS_PL[d.getMonth()]} ${d.getFullYear()}, ${formatClock(iso)}`;
}

// Polska odmiana liczebnika (1 minuta / 2 minuty / 5 minut).
function plural(n: number, one: string, few: string, many: string): string {
  if (n === 1) return one;
  const last = n % 10;
  const last2 = n % 100;
  if (last >= 2 && last <= 4 && (last2 < 10 || last2 >= 20)) return few;
  return many;
}
