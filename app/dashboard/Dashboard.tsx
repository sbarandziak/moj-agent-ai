"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ForecastOk } from "@/lib/forecast";

// Domyślne miasto pogodowe. Praca domowa: zmień na swoje lub dodaj wybór miasta.
const CITY = "Warszawa";

// Jak często odświeżać (W4 §4). Pogodę co 15 min; kursy NBP i tak zmieniają się
// raz dziennie, więc odświeżamy je razem z pogodą.
const REFRESH_MS = 15 * 60 * 1000;

type WeatherOk = {
  city: string;
  country: string;
  temperature: number;
  description: string;
  emoji: string;
  windKmh: number;
  humidity: number;
};
type Weather = WeatherOk | { error: string };

type Rate = { code: string; mid?: number; date?: string; change?: number; error?: boolean };

type HolidaysOk = {
  upcoming: { date: string; name: string; daysUntil: number }[];
  nextInDays: number | null;
};
type Holidays = HolidaysOk | { error: string };

// Zwęża typ unii do wariantu z błędem (pogoda / święta mogą zwrócić { error }).
function hasError<T extends object>(v: T): v is T & { error: string } {
  return typeof v === "object" && v !== null && "error" in v;
}

// Prognoza 7-dniowa — ten sam kształt, który dostaje agent podróży
// z narzędzia getWeeklyForecast (lib/forecast.ts).
type Forecast = ForecastOk | { error: string };

type DashboardData = {
  datetime: { weekday: string; dateLabel: string };
  weather: Weather;
  forecast: Forecast;
  rates: Rate[];
  holidays: Holidays;
};

// Szybkie akcje → linki do odpowiednich stron (W4 §3).
const ACTIONS = [
  { href: "/travel", icon: "🌍", label: "Zaplanuj podróż" },
  {
    href: "/react?q=" + encodeURIComponent("Porównaj kursy EUR, USD, GBP i CHF"),
    icon: "📊",
    label: "Porównaj waluty",
  },
  { href: "/react", icon: "🔄", label: "Agent ReAct" },
  { href: "/chat", icon: "💬", label: "Chat z agentem" },
  { href: "/think", icon: "🧠", label: "Tryb myślenia" },
  { href: "/fewshot", icon: "📖", label: "Słownik AI" },
];

// Krótka data PL: "15 sie".
function shortDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("pl-PL", { day: "numeric", month: "short" });
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/dashboard?city=${encodeURIComponent(CITY)}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as DashboardData;
      setData(json);
      setUpdatedAt(new Date());
    } catch {
      // Zostaw poprzednie dane; kolejne odświeżenie może się udać.
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const updatedLabel = updatedAt
    ? updatedAt.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })
    : "—";

  const greeting = getGreeting();
  const dt = data?.datetime;

  // Prognozę zawężamy TUTAJ, a nie w JSX: zawężenie typu przez hasError()
  // nie przetrwałoby wejścia do callbacka .map() poniżej (TS nie zakłada,
  // że właściwość obiektu jest niezmienna wewnątrz domknięcia).
  const forecast = data && !hasError(data.forecast) ? data.forecast : null;
  const forecastError = data && hasError(data.forecast) ? data.forecast.error : null;

  return (
    <div className="dashboard">
      <div className="dash-topbar">
        <div className="dash-hello">
          <span className="dash-greet">{greeting}</span>
          {dt && (
            <span className="dash-date">
              Dziś: {dt.weekday}, {dt.dateLabel}
            </span>
          )}
        </div>
        <button
          type="button"
          className={`dash-refresh ${refreshing ? "spinning" : ""}`}
          onClick={load}
          title="Odśwież dane"
          disabled={refreshing}
        >
          🔄
        </button>
      </div>

      <div className="dash-grid">
        {/* --- Pogoda --- */}
        <section className="card card-weather fade-in">
          <div className="card-head">
            <span className="card-title">🌤️ Pogoda</span>
            <span className="card-updated">akt. {updatedLabel}</span>
          </div>
          {!data ? (
            <Skeleton lines={3} />
          ) : hasError(data.weather) ? (
            <p className="card-error">⚠️ {data.weather.error}</p>
          ) : (
            <div className="weather-body">
              <div className="weather-main">
                <span className="weather-emoji">{data.weather.emoji}</span>
                <span className="weather-temp">
                  {Math.round(data.weather.temperature)}°C
                </span>
              </div>
              <div className="weather-city">
                {data.weather.city}
                {data.weather.country ? `, ${data.weather.country}` : ""}
              </div>
              <div className="weather-desc">{data.weather.description}</div>
              <div className="weather-extra">
                <span>💨 {Math.round(data.weather.windKmh)} km/h</span>
                <span>💧 {data.weather.humidity}%</span>
              </div>
            </div>
          )}
        </section>

        {/* --- Prognoza na tydzień (nowa funkcja) --- */}
        {/* Karta na całą szerokość siatki: 7 dni obok siebie czyta się jak pasek
            czasu, a w dwóch kolumnach musiałyby się zawijać. */}
        <section className="card card-forecast fade-in">
          <div className="card-head">
            <span className="card-title">📆 Prognoza na tydzień</span>
            <span className="card-updated">
              {forecast ? `${forecast.city} · ` : ""}akt. {updatedLabel}
            </span>
          </div>
          {!data ? (
            <Skeleton lines={3} />
          ) : forecastError ? (
            <p className="card-error">⚠️ {forecastError}</p>
          ) : forecast ? (
            <div className="forecast-body">
              <div className="forecast-strip">
                {forecast.days.map((d) => {
                  const best = d.date === forecast.bestDay.date;
                  return (
                    <div
                      key={d.date}
                      className={`forecast-day ${best ? "best" : ""}`}
                      title={`${d.description} · opady ${d.precipChance}% · wiatr ${d.windKmh} km/h`}
                    >
                      <span className="fc-weekday">{d.weekday}</span>
                      <span className="fc-emoji">{d.emoji}</span>
                      <span className="fc-temp">
                        <b>{d.tempMax}°</b>
                        <span className="fc-min">{d.tempMin}°</span>
                      </span>
                      <span className={`fc-rain ${d.precipChance >= 40 ? "wet" : ""}`}>
                        💧 {d.precipChance}%
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="forecast-best">
                🏆 Najlepszy dzień na wyjazd: <b>{forecast.bestDay.weekday}</b>,{" "}
                {shortDate(forecast.bestDay.date)} — {forecast.bestDay.tempMax}°C,{" "}
                {forecast.bestDay.description}
              </div>

              <ul className="forecast-packing">
                {forecast.packing.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>

              <Link
                href={
                  "/travel?q=" +
                  encodeURIComponent(
                    `Zaplanuj wyjazd do ${forecast.city} w najbliższym tygodniu`,
                  )
                }
                className="forecast-cta"
              >
                ✈️ Zaplanuj wyjazd na ten tydzień →
              </Link>
            </div>
          ) : null}
        </section>

        {/* --- Kursy walut --- */}
        <section className="card card-rates fade-in">
          <div className="card-head">
            <span className="card-title">💶 Kursy walut</span>
            <span className="card-updated">akt. {updatedLabel}</span>
          </div>
          {loading && !data ? (
            <Skeleton lines={2} />
          ) : data ? (
            <div className="rates-body">
              {data.rates.map((r) =>
                r.error || r.mid === undefined ? (
                  <div key={r.code} className="rate-row">
                    <span className="rate-code">{r.code}</span>
                    <span className="card-error">⚠️ brak danych</span>
                  </div>
                ) : (
                  <div key={r.code} className="rate-row">
                    <span className="rate-code">{r.code}</span>
                    <span className="rate-value">{r.mid.toFixed(4)} PLN</span>
                    <span
                      className={`rate-change ${
                        (r.change ?? 0) > 0 ? "up" : (r.change ?? 0) < 0 ? "down" : "flat"
                      }`}
                    >
                      {(r.change ?? 0) > 0 ? "↑" : (r.change ?? 0) < 0 ? "↓" : "→"}{" "}
                      {Math.abs(r.change ?? 0).toFixed(4)}
                    </span>
                  </div>
                ),
              )}
              <div className="rates-source">
                Kurs z: {firstRateDate(data.rates)} (NBP, tabela A)
              </div>
            </div>
          ) : null}
        </section>

        {/* --- Nadchodzące święta --- */}
        <section className="card card-holidays fade-in">
          <div className="card-head">
            <span className="card-title">📅 Nadchodzące święta</span>
          </div>
          {!data ? (
            <Skeleton lines={4} />
          ) : hasError(data.holidays) ? (
            <p className="card-error">⚠️ {data.holidays.error}</p>
          ) : (
            <div className="holidays-body">
              <ul className="holiday-list">
                {data.holidays.upcoming.map((h) => (
                  <li key={h.date} className="holiday-item">
                    <span className="holiday-date">{shortDate(h.date)}</span>
                    <span className="holiday-name">{h.name}</span>
                  </li>
                ))}
              </ul>
              {data.holidays.nextInDays !== null && (
                <div className="holiday-next">
                  Następne za: <b>{data.holidays.nextInDays} dni</b>
                </div>
              )}
            </div>
          )}
        </section>

        {/* --- Szybkie akcje --- */}
        <section className="card card-actions fade-in">
          <div className="card-head">
            <span className="card-title">🤖 Szybkie akcje</span>
          </div>
          <div className="actions-grid">
            {ACTIONS.map((a) => (
              <Link key={a.label} href={a.href} className="action-btn">
                <span className="action-icon">{a.icon}</span>
                {a.label}
              </Link>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function firstRateDate(rates: Rate[]): string {
  const withDate = rates.find((r) => r.date);
  return withDate?.date ?? "—";
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 6) return "🌙 Dobrej nocy!";
  if (h < 12) return "🌅 Dzień dobry!";
  if (h < 18) return "☀️ Miłego dnia!";
  return "🌆 Dobry wieczór!";
}

// Pulsujący placeholder na czas ładowania danych.
function Skeleton({ lines }: { lines: number }) {
  return (
    <div className="skeleton-wrap">
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skeleton-line" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}
