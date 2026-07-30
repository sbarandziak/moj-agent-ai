-- ============================================================
-- Lekcja 10, W3: Tabela `api_usage` (budżet tokenów per użytkownik)
-- ------------------------------------------------------------
-- Jak użyć:
--   1. Supabase Dashboard -> SQL Editor -> "New query"
--   2. Wklej CAŁĄ zawartość tego pliku
--   3. "Run"
--
-- Zapis idzie z tras serwerowych (/api/chat, /api/react, /api/cron/morning)
-- klientem service_role (getSupabaseAdmin) — trasy nie mają sesji użytkownika,
-- więc omijają RLS. Odczyt robi klient `anon` Z SESJĄ (panel zużycia w UI),
-- dlatego dajemy politykę SELECT ograniczoną do WŁASNYCH wierszy.
--
-- user_id jest NULLABLE celowo: wywołania systemowe (cron poranny) nie mają
-- właściciela, a i tak chcemy znać ich koszt.
-- ============================================================

create table if not exists public.api_usage (
  id            uuid        primary key default gen_random_uuid(),
  user_id       uuid,                              -- właściciel (null = wywołanie systemowe/cron)
  created_at    timestamptz not null default now(),
  tokens_input  integer     not null default 0,    -- tokeny w pytaniu (prompt)
  tokens_output integer     not null default 0,    -- tokeny w odpowiedzi (completion)
  model         text        not null default 'unknown', -- np. "gemini-3.1-flash-lite"
  endpoint      text        not null default 'unknown'  -- np. "/api/chat", "/api/react"
);

-- Główne zapytanie budżetu: "ile tokenów zużył user X od północy".
create index if not exists api_usage_user_created_idx
  on public.api_usage (user_id, created_at desc);

-- Statystyki globalne (W4: łączne tokeny dziś/tydzień).
create index if not exists api_usage_created_idx
  on public.api_usage (created_at desc);

alter table public.api_usage enable row level security;

-- Idempotencja: plik można puszczać wielokrotnie.
drop policy if exists "read_own_usage" on public.api_usage;

-- Zalogowany widzi TYLKO swoje zużycie. Zapis nie ma polityki INSERT —
-- idzie wyłącznie kluczem service_role (omija RLS), więc nikt nie podrobi
-- sobie licznika z przeglądarki.
create policy "read_own_usage" on public.api_usage
  for select
  to authenticated
  using (auth.uid() = user_id);
