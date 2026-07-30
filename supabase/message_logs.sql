-- ============================================================
-- Lekcja 10, W4: Tabela `message_logs` (log zablokowanych wiadomości)
-- ------------------------------------------------------------
-- Jak użyć:
--   1. Supabase Dashboard -> SQL Editor -> "New query"
--   2. Wklej CAŁĄ zawartość tego pliku
--   3. "Run"
--
-- W2 (lib/defenses.ts) blokował ataki, ale nigdzie ich nie zapisywał — panel
-- z W4 nie miałby czego pokazać. Ta tabela to ślad po każdym zadziałaniu
-- obrony: która warstwa zareagowała, na czym i kiedy.
--
-- Zapisujemy WYŁĄCZNIE zdarzenia obrony (blocked = true), nie każdą wiadomość
-- — normalna rozmowa jest już w tabeli `messages`, a log bezpieczeństwa ma
-- pozostać krótki i czytelny. Kolumna `blocked` istnieje, bo panel filtruje
-- po niej (WHERE blocked = true) i żeby dało się kiedyś dołożyć zdarzenia
-- „podejrzane, ale przepuszczone".
--
-- Zapis idzie z tras serwerowych klientem service_role. Odczyt NIE ma polityki
-- RLS dla `authenticated` — log widzi tylko panel /admin/security przez trasę
-- serwerową (/api/admin/security), która sama sprawdza uprawnienia. Dzięki
-- temu zwykły użytkownik nie wyciągnie sobie cudzych zablokowanych wiadomości
-- z przeglądarki.
-- ============================================================

create table if not exists public.message_logs (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id    uuid,                                   -- kto wysłał (null = brak sesji)
  message    text        not null,                   -- treść, przycięta do 500 znaków
  blocked    boolean     not null default true,      -- czy obrona zablokowała
  reason     text,                                   -- komunikat, który dostał user
  layer      text        not null default 'input',   -- input | output | rate_limit | budget
  endpoint   text        not null default 'unknown'  -- np. "/api/chat"
);

-- Główne zapytanie panelu: ostatnie blokady, najnowsze u góry.
create index if not exists message_logs_blocked_idx
  on public.message_logs (blocked, created_at desc);

-- Alerty per użytkownik (kto próbuje najczęściej).
create index if not exists message_logs_user_idx
  on public.message_logs (user_id, created_at desc);

alter table public.message_logs enable row level security;

-- Idempotencja: gdyby ktoś wcześniej dodał politykę odczytu — kasujemy ją,
-- log ma być dostępny wyłącznie przez service_role.
drop policy if exists "read_own_logs" on public.message_logs;
