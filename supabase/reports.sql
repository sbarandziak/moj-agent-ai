-- ============================================================
-- Lekcja 08, W2: Tabela `reports` (zapisane raporty agenta)
-- ------------------------------------------------------------
-- Jak użyć:
--   1. Supabase Dashboard -> SQL Editor -> "New query"
--   2. Wklej CAŁĄ zawartość tego pliku
--   3. "Run"
--
-- RLS od razu WŁĄCZONE + polityka "own_reports" (tak jak w L07 W3):
-- użytkownik widzi i zapisuje wyłącznie swoje raporty.
-- Zapis idzie z przeglądarki klientem `anon` Z SESJĄ, więc auth.uid()
-- jest ustawione i polityka przepuszcza wiersz.
-- ============================================================

create table if not exists public.reports (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null    default now(),
  user_id    uuid        not null,   -- właściciel = auth.uid()
  topic      text        not null,   -- temat podany przez użytkownika
  content    text        not null    -- gotowy raport (markdown)
);

-- Lista raportów użytkownika, najnowsze u góry.
create index if not exists reports_user_created_idx
  on public.reports (user_id, created_at desc);

alter table public.reports enable row level security;

-- Idempotencja: można puszczać plik wielokrotnie.
drop policy if exists "own_reports" on public.reports;

create policy "own_reports" on public.reports
  for all
  to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);
