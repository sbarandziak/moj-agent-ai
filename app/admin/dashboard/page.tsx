"use client";

// ============================================================
// Lekcja 11, W2: Dashboard użycia — /admin/dashboard
// ------------------------------------------------------------
// Deska rozdzielcza agenta: ilu userów, ile rozmów, ile tokenów i ile to
// kosztuje. Wszystkie liczby przychodzą policzone z /api/admin/dashboard
// (service_role) — przeglądarka nie ma dostępu do cudzych wierszy.
//
// Strona świadomie używa klas .sec-* z panelu bezpieczeństwa (L10 W4):
// oba panele /admin/* mają wyglądać tak samo. Własne są tylko klasy .adm-*
// dla wykresów.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { useUser } from "../../useUser";
import { formatUSD } from "@/lib/pricing";
import { BarChart, DonutChart, LineChart, PALETTE } from "../charts";

type DayPoint = {
  date: string;
  label: string;
  tokens: number;
  cost: number;
  conversations: number;
};

type EndpointSlice = {
  endpoint: string;
  tokens: number;
  cost: number;
  calls: number;
};

type RecentConversation = {
  id: string;
  title: string;
  email: string;
  createdAt: string;
  messages: number;
};

type DashboardData = {
  adminMode: "open" | "restricted";
  usageAvailable: boolean;
  days: DayPoint[];
  endpoints: EndpointSlice[];
  recent: RecentConversation[];
  unknownModelCalls: number;
  stats: {
    users: number;
    conversations: number;
    conversationsToday: number;
    tokensToday: number;
    costToday: number;
    tokensWeek: number;
    costWeek: number;
    forecastMonth: number;
  };
};

function num(n: number): string {
  return n.toLocaleString("pl-PL");
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminDashboardPage() {
  const user = useUser();
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/dashboard?userId=${encodeURIComponent(user.id)}`
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Nie udało się pobrać danych dashboardu.");
        setData(null);
      } else {
        setData(json as DashboardData);
        setError(null);
      }
    } catch {
      setError("Brak połączenia z serwerem.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    load();
  }, [load]);

  const tokensPerDay =
    data?.days.map((d) => ({ label: d.label, value: d.tokens })) ?? [];
  const convosPerDay =
    data?.days.map((d) => ({ label: d.label, value: d.conversations })) ?? [];
  const endpointTotal =
    data?.endpoints.reduce((s, e) => s + e.tokens, 0) ?? 0;

  return (
    <div className="app">
      <header className="header">
        📊 Dashboard
        <div className="subtitle">
          Ilu masz użytkowników, ile rozmawiają i ile Cię to kosztuje
        </div>
      </header>

      <div className="sec-wrap">
        <div className="sec-toolbar">
          <button type="button" className="ctx-btn" onClick={load} disabled={loading}>
            {loading ? "⏳ Liczę…" : "🔄 Odśwież"}
          </button>
          {data?.adminMode === "open" && (
            <span className="sec-warn">
              ⚠️ Dashboard otwarty dla każdego zalogowanego — ustaw zmienną
              <code> ADMIN_EMAILS</code>, żeby ograniczyć dostęp.
            </span>
          )}
        </div>

        {error && <div className="sec-error">⚠️ {error}</div>}

        {loading && !data && <div className="sec-empty">⏳ Zbieram dane…</div>}

        {data && (
          <>
            {/* --- Karty z liczbami --- */}
            <section className="sec-section">
              <div className="sec-stats">
                <div className="sec-stat">
                  <span className="sec-stat-value">👥 {num(data.stats.users)}</span>
                  <span className="sec-stat-label">użytkownicy</span>
                </div>
                <div className="sec-stat">
                  <span className="sec-stat-value">
                    💬 {num(data.stats.conversations)}
                  </span>
                  <span className="sec-stat-label">
                    rozmowy · dziś {num(data.stats.conversationsToday)}
                  </span>
                </div>
                <div className="sec-stat">
                  <span className="sec-stat-value">
                    🔤 {num(data.stats.tokensToday)}
                  </span>
                  <span className="sec-stat-label">tokeny dziś</span>
                </div>
                <div className="sec-stat">
                  <span className="sec-stat-value">
                    💰 {formatUSD(data.stats.costToday)}
                  </span>
                  <span className="sec-stat-label">koszt dziś</span>
                </div>
                <div className="sec-stat">
                  <span className="sec-stat-value">
                    {formatUSD(data.stats.costWeek)}
                  </span>
                  <span className="sec-stat-label">
                    koszt 7 dni · {num(data.stats.tokensWeek)} tokenów
                  </span>
                </div>
                <div className="sec-stat">
                  <span className="sec-stat-value">
                    {formatUSD(data.stats.forecastMonth)}
                  </span>
                  <span className="sec-stat-label">prognoza na 30 dni</span>
                </div>
              </div>
              {!data.usageAvailable && (
                <div className="sec-error">
                  Tabela <code>api_usage</code> jest niedostępna — tokeny i koszty
                  pokazują zera. Uruchom <code>supabase/api_usage.sql</code> w
                  Supabase → SQL Editor.
                </div>
              )}
            </section>

            {/* --- Wykresy --- */}
            <section className="sec-section">
              <h2 className="sec-title">📈 Ostatnie 7 dni</h2>
              <div className="adm-charts">
                <div className="adm-chart">
                  <div className="adm-chart-head">
                    <span className="adm-chart-title">Tokeny dziennie</span>
                    <span className="adm-chart-sum">
                      {num(data.stats.tokensWeek)} razem
                    </span>
                  </div>
                  <LineChart points={tokensPerDay} title="Tokeny dziennie" />
                </div>

                <div className="adm-chart">
                  <div className="adm-chart-head">
                    <span className="adm-chart-title">Rozmowy dziennie</span>
                    <span className="adm-chart-sum">
                      {num(convosPerDay.reduce((s, p) => s + p.value, 0))} razem
                    </span>
                  </div>
                  <BarChart points={convosPerDay} title="Rozmowy dziennie" />
                </div>

                <div className="adm-chart">
                  <div className="adm-chart-head">
                    <span className="adm-chart-title">Tokeny wg endpointu</span>
                  </div>
                  {endpointTotal === 0 ? (
                    <div className="sec-empty">
                      Brak zużycia w tym oknie. Porozmawiaj z agentem i odśwież.
                    </div>
                  ) : (
                    <div className="adm-pie">
                      <DonutChart
                        slices={data.endpoints.map((e) => ({
                          label: e.endpoint,
                          value: e.tokens,
                        }))}
                        title="Tokeny wg endpointu"
                      />
                      <ul className="adm-legend">
                        {data.endpoints.map((e, i) => (
                          <li key={e.endpoint}>
                            <span
                              className="adm-dot"
                              style={{ background: PALETTE[i % PALETTE.length] }}
                            />
                            <span className="adm-legend-name">{e.endpoint}</span>
                            <span className="adm-legend-val">
                              {Math.round((e.tokens / endpointTotal) * 100)}% ·{" "}
                              {num(e.tokens)} · {formatUSD(e.cost)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
              <p className="adm-note">
                Koszt liczony ze stawek w <code>lib/pricing.ts</code> (USD za 1 mln
                tokenów, osobno wejście i wyjście).
                {data.unknownModelCalls > 0 &&
                  ` ${num(data.unknownModelCalls)} wywołań użyło stawki zastępczej — model spoza cennika.`}
              </p>
            </section>

            {/* --- Ostatnie rozmowy --- */}
            <section className="sec-section">
              <h2 className="sec-title">🕑 Ostatnie rozmowy</h2>
              {data.recent.length === 0 ? (
                <div className="sec-empty">
                  Nie ma jeszcze żadnej rozmowy. Wejdź na /chat i zacznij.
                </div>
              ) : (
                <div className="sec-table-wrap">
                  <table className="sec-table">
                    <thead>
                      <tr>
                        <th>Użytkownik</th>
                        <th>Tytuł</th>
                        <th>Data</th>
                        <th>Wiadomości</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent.map((c) => (
                        <tr key={c.id}>
                          <td>{c.email}</td>
                          <td className="adm-cell-title">{c.title}</td>
                          <td>{when(c.createdAt)}</td>
                          <td>{num(c.messages)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
