-- ============================================================
-- Lekcja 09, W1: Tabela `briefings` (poranne briefingi agenta)
-- ------------------------------------------------------------
-- Jak użyć:
--   1. Supabase Dashboard -> SQL Editor -> "New query"
--   2. Wklej CAŁĄ zawartość tego pliku
--   3. "Run"
--
-- Zapis idzie z endpointu /api/cron/morning klientem service_role
-- (getSupabaseAdmin) — cron nie ma sesji użytkownika, więc omija RLS.
-- Odczyt (strona /briefings w W4) robimy klientem `anon` Z SESJĄ, dlatego
-- dajemy politykę SELECT dla zalogowanych. Briefing jest wspólny (pogoda,
-- kursy) — nie per-user — więc user_id jest opcjonalny.
-- ============================================================

create table if not exists public.briefings (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null    default now(),
  content    text        not null,   -- pełna treść briefingu (markdown)
  date       date        not null    default current_date, -- data briefingu
  user_id    uuid                    -- opcjonalnie: właściciel (per user)
);

-- Lista briefingów wg daty, najnowsze u góry.
create index if not exists briefings_date_idx
  on public.briefings (date desc, created_at desc);

alter table public.briefings enable row level security;

-- Idempotencja: można puszczać plik wielokrotnie.
drop policy if exists "read_briefings" on public.briefings;

-- Każdy zalogowany użytkownik może czytać briefingi (są wspólne).
-- Zapis nie ma polityki INSERT — idzie wyłącznie service_role (omija RLS).
create policy "read_briefings" on public.briefings
  for select
  to authenticated
  using (true);
