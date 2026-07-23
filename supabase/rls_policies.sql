-- ============================================================
-- Lekcja 07, W3: Polityki RLS (izolacja danych per użytkownik)
-- ------------------------------------------------------------
-- Kontekst: RLS jest już WŁĄCZONE na 4 tabelach (Security Advisor
-- pokazuje "RLS Enabled No Policy"). Bez polityk RLS blokuje WSZYSTKO
-- dla zwykłego użytkownika — apka nie odczyta nawet własnych danych.
-- Ten plik dodaje polityki, które mówią: "widzisz i zmieniasz TYLKO
-- swoje wiersze (auth.uid() = user_id)".
--
-- Jak użyć:
--   1. Supabase Dashboard -> SQL Editor -> "New query"
--   2. Wklej CAŁĄ zawartość tego pliku
--   3. "Run"
--   4. Security Advisor -> Refresh -> "RLS Enabled No Policy" znika
--
-- WAŻNE (patrz README niżej): trasy serwerowe (/api/upload-knowledge
-- oraz zapis imienia/preferencji z /api/chat) używają klucza `anon`
-- BEZ sesji, więc te polityki je ZABLOKUJĄ. Trzeba je przełączyć na
-- klucz `service_role`. To osobna zmiana w kodzie (lib/supabaseAdmin.ts).
-- ============================================================

-- Idempotencja: usuń polityki, jeśli już istnieją (można puszczać wielokrotnie).
drop policy if exists "own_conversations" on public.conversations;
drop policy if exists "own_messages"      on public.messages;
drop policy if exists "own_documents"     on public.documents;
drop policy if exists "own_profile"       on public.user_profiles;

-- 1. conversations: właściciel = auth.uid() ------------------
create policy "own_conversations" on public.conversations
  for all
  to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. documents: właściciel = auth.uid() ----------------------
create policy "own_documents" on public.documents
  for all
  to authenticated
  using      (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 3. messages: brak własnej kolumny user_id — dziedziczy
--    własność po rozmowie (conversation_id należy do usera).
create policy "own_messages" on public.messages
  for all
  to authenticated
  using (
    conversation_id in (
      select id from public.conversations where user_id = auth.uid()
    )
  )
  with check (
    conversation_id in (
      select id from public.conversations where user_id = auth.uid()
    )
  );

-- 4. user_profiles: id rekordu = auth.uid() (tak zakłada apka)
create policy "own_profile" on public.user_profiles
  for all
  to authenticated
  using      (auth.uid() = id)
  with check (auth.uid() = id);

-- ============================================================
-- Warning (Security Advisor): "Function Search Path Mutable"
-- ------------------------------------------------------------
-- match_documents ma zmienny search_path — potencjalny wektor ataku.
-- Ustawiamy go na stałe. Nie zmienia logiki funkcji.
-- ============================================================
alter function public.match_documents(vector, double precision, integer)
  set search_path = public, pg_temp;

-- ============================================================
-- Warning: "Leaked Password Protection Disabled" — NIE robi się w SQL.
-- Dashboard -> Authentication -> Providers/Policies -> włącz
-- "Leaked password protection" (sprawdza hasła w bazie HaveIBeenPwned).
-- ============================================================
