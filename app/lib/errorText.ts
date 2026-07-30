// ============================================================
// Lekcja 10: czytelny tekst błędu z trasy API
// ------------------------------------------------------------
// Trasy zwracają błędy jako JSON { error: "..." } (rate limit z W2, budżet
// z W3, walidacja inputu). Transport useChat przy odpowiedzi != 2xx rzuca
// Error, którego `message` to SUROWE ciało odpowiedzi — czyli użytkownik
// zobaczyłby `{"error":"Dzienny limit..."}`. Ta funkcja wyłuskuje samą treść.
// ============================================================

export function errorText(err: unknown, fallback = "Coś poszło nie tak."): string {
  const raw = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (!raw.trim()) return fallback;

  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && typeof parsed.error === "string") {
      return parsed.error;
    }
  } catch {
    // Nie JSON — pokazujemy tekst tak, jak przyszedł.
  }
  return raw;
}
