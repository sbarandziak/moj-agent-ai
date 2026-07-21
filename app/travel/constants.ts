// Maksymalna liczba kroków (iteracji narzędzi) asystenta podróży.
// Podróż wymaga zebrania danych z 4-5 źródeł (pogoda, waluta, święta,
// Wikipedia, kalkulator), a tryb porównania dwóch miast — dwa razy tyle.
// Współdzielone przez endpoint (/api/travel) i pasek postępu (/travel).
export const MAX_STEPS = 10;
