-- ============================================================
-- Warsztat 3 (Lekcja 07): Izolacja danych per użytkownik
-- ------------------------------------------------------------
-- Uruchom RAZ w Supabase → SQL Editor (klucz anon nie ma praw DDL,
-- dlatego aplikacja tego nie robi automatycznie).
--
-- Co robi:
--   1. Dodaje kolumnę user_id (auth.uid()) do conversations i documents.
--   2. Dodaje indeksy po user_id (szybsze filtrowanie list).
--   3. Czyści stare "sieroty" bez właściciela (dane z L05–L06).
-- ============================================================

-- 1. Kolumny właściciela --------------------------------------
alter table conversations add column if not exists user_id uuid;
alter table documents     add column if not exists user_id uuid;

-- 2. Indeksy (lista rozmów/dokumentów filtruje po user_id) -----
create index if not exists conversations_user_id_idx on conversations (user_id);
create index if not exists documents_user_id_idx      on documents (user_id);

-- 3. Czyszczenie sierot (§4) ----------------------------------
--    Stare rekordy nie mają user_id -> nikt ich nie zobaczy.
--    Kasujemy je, żeby nie zaśmiecały bazy.
--    UWAGA: to operacja nieodwracalna. Jeśli chcesz zachować stare
--    rozmowy dla siebie, najpierw przypisz im swój user_id ręcznie:
--      update conversations set user_id = '<TWOJ-AUTH-UID>' where user_id is null;
--      update documents     set user_id = '<TWOJ-AUTH-UID>' where user_id is null;
--    (auth uid znajdziesz w Supabase → Authentication → Users)

delete from messages
  where conversation_id in (select id from conversations where user_id is null);
delete from conversations where user_id is null;
delete from documents     where user_id is null;

-- ============================================================
-- (Opcjonalnie, zalecane produkcyjnie) Row Level Security
-- ------------------------------------------------------------
-- Aplikacja filtruje po user_id w zapytaniach (W3 §3), co daje izolację
-- logiczną. RLS wymusza ją TWARDO po stronie bazy — nawet gdyby ktoś
-- ominął frontend. Odkomentuj, jeśli chcesz włączyć:
--
-- alter table conversations enable row level security;
-- alter table documents     enable row level security;
-- alter table messages      enable row level security;
--
-- create policy "own conversations" on conversations
--   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- create policy "own documents" on documents
--   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- create policy "own messages" on messages
--   for all using (
--     conversation_id in (select id from conversations where user_id = auth.uid())
--   );
-- ============================================================
