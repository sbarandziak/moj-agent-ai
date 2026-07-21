// Maksymalna liczba kroków (iteracji narzędzi) agenta ReAct.
// Współdzielone przez endpoint (/api/react) i panel diagnostyki (/react),
// żeby pasek postępu odzwierciedlał prawdziwy limit.
export const MAX_STEPS = 8;
