"use client";

// ============================================================
// Lekcja 10, W4: Panel bezpieczeństwa — /admin/security
// ------------------------------------------------------------
// Cztery sekcje wprost z warsztatu: zablokowane wiadomości, top 5 userów po
// zużyciu tokenów, alerty i statystyki. Wszystkie dane liczy trasa
// /api/admin/security (service_role) — przeglądarka nie ma dostępu do cudzych
// wierszy, bo RLS na to nie pozwala.
// ============================================================

import { useCallback, useEffect, useState } from "react";
import { useUser } from "../../useUser";
import { budgetColor } from "../../lib/useBudget";

type BlockedRow = {
  id: string;
  created_at: string;
  user_id: string | null;
  email: string;
  message: string;
  reason: string | null;
  layer: string;
  endpoint: string;
};

type TopUser = {
  userId: string;
  email: string;
  today: number;
  week: number;
  percent: number;
};

type Alert = { level: "red" | "yellow"; icon: string; text: string };

type SecurityData = {
  adminMode: "open" | "restricted";
  limit: number;
  logsAvailable: boolean;
  blocked: BlockedRow[];
  topUsers: TopUser[];
  alerts: Alert[];
  stats: {
    tokensToday: number;
    tokensWeek: number;
    blockedTotal: number;
    blockedToday: number;
    activeUsers: number;
    avgPerUser: number;
  };
};

const LAYERS: Record<string, { label: string; icon: string }> = {
  input: { label: "walidacja inputu", icon: "🛑" },
  output: { label: "filtr outputu", icon: "🔒" },
  rate_limit: { label: "rate limit", icon: "⏱️" },
  budget: { label: "budżet tokenów", icon: "🔋" },
};

function num(n: number): string {
  return n.toLocaleString("pl-PL");
}

// "przed chwilą" / "12 min temu" / "2026-07-30 09:14"
function when(iso: string): string {
  const diffMin = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return "przed chwilą";
  if (diffMin < 60) return `${diffMin} min temu`;
  if (diffMin < 24 * 60) return `${Math.floor(diffMin / 60)} h temu`;
  return new Date(iso).toLocaleString("pl-PL", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SecurityPage() {
  const user = useUser();
  const [data, setData] = useState<SecurityData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/security?userId=${encodeURIComponent(user.id)}`
      );
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Nie udało się pobrać danych panelu.");
        setData(null);
      } else {
        setData(json as SecurityData);
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

  return (
    <div className="app">
      <header className="header">
        🛡️ Panel bezpieczeństwa
        <div className="subtitle">
          Kto próbuje złamać agenta i ile kosztuje Cię każdy użytkownik
        </div>
      </header>

      <div className="sec-wrap">
        <div className="sec-toolbar">
          <button type="button" className="ctx-btn" onClick={load} disabled={loading}>
            {loading ? "⏳ Odświeżam…" : "🔄 Odśwież"}
          </button>
          {data?.adminMode === "open" && (
            <span className="sec-warn">
              ⚠️ Panel otwarty dla każdego zalogowanego — ustaw zmienną
              <code> ADMIN_EMAILS</code>, żeby ograniczyć dostęp.
            </span>
          )}
        </div>

        {error && <div className="sec-error">⚠️ {error}</div>}

        {loading && !data && <div className="sec-empty">⏳ Liczę statystyki…</div>}

        {data && (
          <>
            {/* --- 4. Statystyki (na górze — najszybszy przegląd) --- */}
            <section className="sec-section">
              <h2 className="sec-title">📈 Statystyki</h2>
              <div className="sec-stats">
                <div className="sec-stat">
                  <span className="sec-stat-value">{num(data.stats.tokensToday)}</span>
                  <span className="sec-stat-label">tokeny dziś</span>
                </div>
                <div className="sec-stat">
                  <span className="sec-stat-value">{num(data.stats.tokensWeek)}</span>
                  <span className="sec-stat-label">tokeny (7 dni)</span>
                </div>
                <div className="sec-stat">
                  <span className="sec-stat-value">{num(data.stats.avgPerUser)}</span>
                  <span className="sec-stat-label">średnio na usera dziś</span>
                </div>
                <div className="sec-stat">
                  <span className="sec-stat-value">{num(data.stats.activeUsers)}</span>
                  <span className="sec-stat-label">aktywni użytkownicy</span>
                </div>
                <div className="sec-stat">
                  <span
                    className="sec-stat-value"
                    style={{ color: data.stats.blockedToday > 0 ? "#dc2626" : undefined }}
                  >
                    {num(data.stats.blockedToday)}
                  </span>
                  <span className="sec-stat-label">blokady (24 h)</span>
                </div>
              </div>
            </section>

            {/* --- 3. Alerty --- */}
            <section className="sec-section">
              <h2 className="sec-title">🔴 Alerty</h2>
              {data.alerts.length === 0 ? (
                <div className="sec-empty">✅ Cisza w eterze — brak podejrzanych zachowań.</div>
              ) : (
                <ul className="sec-alerts">
                  {data.alerts.map((a, i) => (
                    <li key={i} className={`sec-alert ${a.level}`}>
                      <span className="sec-alert-icon">{a.icon}</span>
                      <span>{a.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* --- 2. Top 5 użytkowników po zużyciu --- */}
            <section className="sec-section">
              <h2 className="sec-title">📊 Top 5 użytkowników po zużyciu</h2>
              {data.topUsers.length === 0 ? (
                <div className="sec-empty">
                  Brak zużycia w ostatnich 7 dniach. Porozmawiaj z agentem, a tabela się zapełni.
                </div>
              ) : (
                <div className="sec-table-wrap">
                  <table className="sec-table">
                    <thead>
                      <tr>
                        <th>Użytkownik</th>
                        <th>Dziś</th>
                        <th>7 dni</th>
                        <th>% limitu ({num(data.limit)})</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topUsers.map((u) => (
                        <tr key={u.userId}>
                          <td>{u.email}</td>
                          <td>{num(u.today)}</td>
                          <td>{num(u.week)}</td>
                          <td>
                            <div className="sec-bar">
                              <div
                                className="sec-bar-fill"
                                style={{
                                  width: `${u.percent}%`,
                                  background: budgetColor(u.percent),
                                }}
                              />
                            </div>
                            <span style={{ color: budgetColor(u.percent) }}>
                              {u.percent}%
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {/* --- 1. Zablokowane wiadomości --- */}
            <section className="sec-section">
              <h2 className="sec-title">⚠️ Zablokowane wiadomości</h2>
              {!data.logsAvailable ? (
                <div className="sec-error">
                  Tabela <code>message_logs</code> jest niedostępna. Uruchom
                  <code> supabase/message_logs.sql</code> w Supabase → SQL Editor.
                </div>
              ) : data.blocked.length === 0 ? (
                <div className="sec-empty">
                  ✅ Żadna wiadomość nie została zablokowana. Spróbuj ataku z W1 —
                  pojawi się tutaj.
                </div>
              ) : (
                <ul className="sec-logs">
                  {data.blocked.map((b) => {
                    const layer = LAYERS[b.layer] ?? { label: b.layer, icon: "🚫" };
                    return (
                      <li key={b.id} className="sec-log">
                        <div className="sec-log-head">
                          <span className="sec-log-layer">
                            {layer.icon} {layer.label}
                          </span>
                          <span className="sec-log-user">{b.email}</span>
                          <span className="sec-log-time">{when(b.created_at)}</span>
                        </div>
                        <div className="sec-log-msg">„{b.message}"</div>
                        {b.reason && <div className="sec-log-reason">↳ {b.reason}</div>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
