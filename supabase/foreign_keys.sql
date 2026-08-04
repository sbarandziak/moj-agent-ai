-- ============================================================
-- Klucze obce do auth.users — dopięcie tabel do właściciela
-- ------------------------------------------------------------
-- Jak użyć:
--   1. Supabase Dashboard -> SQL Editor -> "New query"
--   2. Uruchom SEKCJĘ 0 i przeczytaj wynik (ile jest sierot)
--   3. Wklej całą resztę (SEKCJE 1-4) i "Run"
--   4. Table Editor / Database -> Schema Visualizer: między tabelami
--      a auth.users pojawią się linie relacji
--
-- PO CO TO:
-- Kolumny `user_id` powstały (auth_isolation.sql, Lekcja 07) jako zwykłe
-- uuid — baza NIE wie, że to właściciel. Skutek: skasowanie konta w
-- Supabase Auth zostawia po nim rozmowy, dokumenty i raporty jako wiersze
-- wskazujące na nieistniejącego użytkownika. Klucz obcy z ON DELETE
-- załatwia to po stronie bazy, bez kiwnięcia palcem w kodzie aplikacji.
--
-- Wyjątek: `messages.conversation_id` klucz obcy MA od początku
-- (schema.sql) — ten skrypt go nie dotyka.
--
-- DWIE REGUŁY KASOWANIA, świadomie różne:
--   ON DELETE CASCADE  -> treści użytkownika (rozmowy, dokumenty, raporty,
--                         profil). Nie ma właściciela = nie ma po co trzymać.
--   ON DELETE SET NULL -> log zużycia i log bezpieczeństwa. Wiersz zostaje
--                         (statystyki kosztów i historia blokad nie mogą
--                         zniknąć razem z kontem), traci tylko właściciela.
--   Jeśli wolisz, żeby po skasowanym koncie nie było ŻADNEGO śladu,
--   zamień w sekcji 2 `set null` na `cascade` przy api_usage i message_logs.
-- ============================================================


-- ============================================================
-- SEKCJA 0 — DIAGNOSTYKA (uruchom osobno, nic nie zmienia)
-- ------------------------------------------------------------
-- Sierota = wiersz z user_id, którego nie ma już w auth.users.
-- Dopóki takie wiersze istnieją, klucz obcy się NIE doda.
-- ============================================================

select 'conversations' as tabela, count(*) as sieroty from public.conversations t
  where t.user_id is not null and not exists (select 1 from auth.users u where u.id = t.user_id)
union all
select 'documents',  count(*) from public.documents t
  where t.user_id is not null and not exists (select 1 from auth.users u where u.id = t.user_id)
union all
select 'reports',    count(*) from public.reports t
  where t.user_id is not null and not exists (select 1 from auth.users u where u.id = t.user_id)
union all
select 'briefings',  count(*) from public.briefings t
  where t.user_id is not null and not exists (select 1 from auth.users u where u.id = t.user_id)
union all
select 'api_usage',  count(*) from public.api_usage t
  where t.user_id is not null and not exists (select 1 from auth.users u where u.id = t.user_id)
union all
select 'message_logs', count(*) from public.message_logs t
  where t.user_id is not null and not exists (select 1 from auth.users u where u.id = t.user_id)
union all
select 'user_profiles', count(*) from public.user_profiles t
  where not exists (select 1 from auth.users u where u.id = t.id);


-- ============================================================
-- SEKCJA 1 — SPRZĄTANIE SIEROT
-- ------------------------------------------------------------
-- UWAGA: to jedyne miejsce w tym pliku, które KASUJE dane.
-- Stan na 2026-08-04 (sprawdzony na żywej bazie): 3 profile,
-- 1 wiersz api_usage i 1 wiersz message_logs. Profile to pamiątka
-- sprzed Lekcji 07, gdy tożsamość siedziała w localStorage jako losowy
-- UUID — aplikacja i tak ich nie widzi, bo szuka po auth uid.
--
-- Nie chcesz nic kasować? Zakomentuj CAŁĄ sekcję 1 i w sekcji 2 dopisz
-- `not valid` na końcu każdego `add constraint`. Klucz zacznie wtedy
-- pilnować nowych wierszy i kasować kaskadowo, a stare śmieci zostawi
-- w spokoju (możesz je sprzątnąć później i uruchomić
-- `alter table ... validate constraint ...`).
-- ============================================================

-- Treści bez właściciela — usuwamy (wiadomości znikną kaskadą z schema.sql).
delete from public.conversations t
  where t.user_id is not null and not exists (select 1 from auth.users u where u.id = t.user_id);
delete from public.documents t
  where t.user_id is not null and not exists (select 1 from auth.users u where u.id = t.user_id);
delete from public.reports t
  where t.user_id is not null and not exists (select 1 from auth.users u where u.id = t.user_id);
delete from public.user_profiles t
  where not exists (select 1 from auth.users u where u.id = t.id);

-- Logi i briefingi — zostawiamy wiersz, zdejmujemy właściciela.
update public.briefings t set user_id = null
  where t.user_id is not null and not exists (select 1 from auth.users u where u.id = t.user_id);
update public.api_usage t set user_id = null
  where t.user_id is not null and not exists (select 1 from auth.users u where u.id = t.user_id);
update public.message_logs t set user_id = null
  where t.user_id is not null and not exists (select 1 from auth.users u where u.id = t.user_id);


-- ============================================================
-- SEKCJA 2 — KLUCZE OBCE
-- ------------------------------------------------------------
-- `drop constraint if exists` przed każdym `add` = plik można puszczać
-- wielokrotnie (Postgres nie zna `add constraint if not exists`).
-- Nazwy zgodne z konwencją Postgresa: <tabela>_<kolumna>_fkey.
-- ============================================================

-- Rozmowy: kasujesz konto -> znikają rozmowy, a z nimi (kaskadą z
-- schema.sql) wszystkie wiadomości.
alter table public.conversations drop constraint if exists conversations_user_id_fkey;
alter table public.conversations add constraint conversations_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

-- Dokumenty bazy wiedzy (fragmenty + embeddingi).
alter table public.documents drop constraint if exists documents_user_id_fkey;
alter table public.documents add constraint documents_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

-- Zapisane raporty.
alter table public.reports drop constraint if exists reports_user_id_fkey;
alter table public.reports add constraint reports_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete cascade;

-- Profil (imię, preferencje). Tu kluczem jest samo `id` = auth uid,
-- nie osobna kolumna user_id.
alter table public.user_profiles drop constraint if exists user_profiles_id_fkey;
alter table public.user_profiles add constraint user_profiles_id_fkey
  foreign key (id) references auth.users (id) on delete cascade;

-- Briefingi: user_id jest opcjonalny (poranny cron nie ma właściciela),
-- więc po skasowaniu konta briefing zostaje jako systemowy.
alter table public.briefings drop constraint if exists briefings_user_id_fkey;
alter table public.briefings add constraint briefings_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

-- Zużycie tokenów: wiersz zostaje, bo koszt został poniesiony naprawdę
-- i ma się liczyć w statystykach na /admin/dashboard.
alter table public.api_usage drop constraint if exists api_usage_user_id_fkey;
alter table public.api_usage add constraint api_usage_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

-- Log bezpieczeństwa: ślad po ataku ma przetrwać skasowanie konta.
alter table public.message_logs drop constraint if exists message_logs_user_id_fkey;
alter table public.message_logs add constraint message_logs_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;


-- ============================================================
-- SEKCJA 3 — INDEKSY POD KASKADĘ
-- ------------------------------------------------------------
-- Klucz obcy NIE tworzy indeksu na kolumnie wskazującej. Bez niego każde
-- skasowanie użytkownika skanuje całe tabele w poszukiwaniu jego wierszy.
-- Część indeksów już jest (auth_isolation.sql, api_usage.sql,
-- message_logs.sql, reports.sql) — `if not exists` to znosi.
-- ============================================================

create index if not exists conversations_user_id_idx on public.conversations (user_id);
create index if not exists documents_user_id_idx     on public.documents (user_id);
create index if not exists reports_user_id_idx       on public.reports (user_id);
create index if not exists briefings_user_id_idx     on public.briefings (user_id);
create index if not exists api_usage_user_idx        on public.api_usage (user_id);
create index if not exists message_logs_user_id_idx  on public.message_logs (user_id);
-- user_profiles.id jest kluczem głównym, więc indeks ma z definicji.


-- ============================================================
-- SEKCJA 4 — WERYFIKACJA
-- ------------------------------------------------------------
-- Powinno wyjść 8 wierszy: 7 nowych kluczy + messages_conversation_id_fkey,
-- który istniał od schema.sql.
--
-- PYTAMY KATALOG pg_constraint, A NIE information_schema — i to nie jest
-- kaprys. Widoki information_schema pokazują tylko obiekty, do których
-- bieżąca rola ma uprawnienia, a tabela auth.users należy do roli
-- supabase_auth_admin. Zapytanie przez information_schema.
-- constraint_column_usage wycina więc WSZYSTKIE klucze wskazujące na
-- auth.users i zwraca jeden wiersz (messages -> conversations), przez co
-- wygląda, jakby skrypt nie zadziałał. pg_constraint nie filtruje po
-- uprawnieniach i pokazuje prawdę.
--
-- Test niezależny od zapytań: spróbuj wstawić wiersz ze zmyślonym
-- właścicielem — klucz obcy musi odrzucić go błędem 23503:
--   insert into public.conversations (user_id, title)
--   values ('11111111-2222-3333-4444-555555555555', 'test');
-- ============================================================

select
  con.conrelid::regclass  as tabela,
  att.attname             as kolumna,
  con.confrelid::regclass as wskazuje_na,
  case con.confdeltype
    when 'c' then 'CASCADE'
    when 'n' then 'SET NULL'
    when 'd' then 'SET DEFAULT'
    when 'r' then 'RESTRICT'
    else 'NO ACTION'
  end                     as przy_kasowaniu,
  con.conname             as nazwa,
  con.convalidated        as zwalidowany
from pg_constraint con
join pg_namespace nsp on nsp.oid = con.connamespace
join pg_attribute att
  on att.attrelid = con.conrelid
 -- wszystkie nasze klucze są jednokolumnowe, więc wystarczy pierwsza pozycja
 and att.attnum = con.conkey[1]
where con.contype = 'f'
  and nsp.nspname = 'public'
order by 1, 2;
