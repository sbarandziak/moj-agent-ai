// ============================================================
// Lekcja 11, W2: Cennik modeli — przeliczanie tokenów na dolary
// ------------------------------------------------------------
// Tabela `api_usage` (L10 W3) zapisuje tokeny i nazwę modelu. Żeby pokazać
// KOSZT, trzeba znać stawkę. Stawki są podane w USD za 1 MILION tokenów —
// tak samo jak w cennikach dostawców — i liczone osobno dla wejścia
// (prompt) i wyjścia (odpowiedź), bo output jest zwykle kilka razy droższy.
//
// UWAGA: to są stawki wpisane ręcznie, nie pobierane z API. Gdy dostawca
// zmieni cennik, popraw liczby TUTAJ — reszta aplikacji przeliczy się sama.
// Model spoza listy (np. nowy, dołożony później) wpada na FALLBACK, więc
// koszt nigdy nie znika z dashboardu, tylko jest przybliżony.
// ============================================================

export type ModelPrice = {
  /** USD za 1 mln tokenów wejściowych (prompt). */
  input: number;
  /** USD za 1 mln tokenów wyjściowych (odpowiedź). */
  output: number;
};

// Modele realnie używane w projekcie (grep po `google("...")` w app/).
const PRICES: Record<string, ModelPrice> = {
  "gemini-3.1-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-3.1-flash-lite-image": { input: 0.1, output: 0.4 },
  "gemini-3.5-flash": { input: 0.15, output: 0.6 },
  "gemini-3.1-pro-preview": { input: 1.25, output: 10.0 },
  // Embeddingi nie generują odpowiedzi — płaci się tylko za wejście.
  "gemini-embedding-001": { input: 0.15, output: 0 },
};

// Stawka dla modelu, którego nie ma w tabeli wyżej (i dla wierszy z
// `model = 'unknown'`). Celowo bliska najtańszemu flashowi — dashboard ma
// nie straszyć kwotą wziętą z sufitu.
const FALLBACK: ModelPrice = { input: 0.15, output: 0.6 };

export function priceFor(model: string | null | undefined): ModelPrice {
  if (!model) return FALLBACK;
  return PRICES[model] ?? FALLBACK;
}

/** Czy dla tego modelu znamy prawdziwą stawkę (do przypisu w UI). */
export function isKnownModel(model: string | null | undefined): boolean {
  return !!model && model in PRICES;
}

/** Koszt jednego wywołania w USD. */
export function estimateCost(
  model: string | null | undefined,
  tokensInput: number,
  tokensOutput: number
): number {
  const p = priceFor(model);
  return (tokensInput * p.input + tokensOutput * p.output) / 1_000_000;
}

/**
 * Kwota dla człowieka. Przy stawkach rzędu $0.10/1M pojedyncza rozmowa
 * kosztuje ułamek centa — dwa miejsca po przecinku pokazałyby wszędzie
 * "$0.00", więc małe kwoty dostają więcej cyfr.
 */
export function formatUSD(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.01) return `$${usd.toFixed(5)}`;
  if (usd < 1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
