-- ============================================================
-- POPRAWKA: wyszukiwanie w bazie wiedzy zwraca
--   "operator does not exist: extensions.vector <=> extensions.vector"
-- ------------------------------------------------------------
-- Uruchom RAZ w Supabase Dashboard -> SQL Editor -> "New query" -> Run.
-- Nie usuwa żadnych danych ani dokumentów — zmienia tylko ustawienie funkcji.
--
-- SKĄD SIĘ WZIĄŁ BŁĄD
-- Skrypt rls_policies.sql (Lekcja 10, W2) domykał ostrzeżenie Security
-- Advisora "Function Search Path Mutable" w ten sposób:
--
--   alter function public.match_documents(...) set search_path = public, pg_temp;
--
-- Problem: Supabase instaluje pgvector w schemacie `extensions`, nie w
-- `public`. Operator `<=>` (odległość kosinusowa), z którego korzysta ciało
-- funkcji match_documents, należy więc do `extensions`. Przypięcie search_path
-- wyłącznie do `public, pg_temp` sprawiło, że operator przestał być widoczny
-- wewnątrz funkcji — mimo że sam typ `vector` nadal się rozwiązuje (siedzi
-- w sygnaturze funkcji zapisany po OID). Stąd mylący komunikat: Postgres
-- wypisuje pełne nazwy typów `extensions.vector`, twierdząc jednocześnie,
-- że operatora między nimi nie ma.
--
-- ROZWIĄZANIE
-- Dopisujemy `extensions` do search_path. Ostrzeżenie Security Advisora
-- pozostaje zamknięte, bo reguła wymaga tylko tego, żeby search_path był
-- USTAWIONY NA STAŁE — nie żeby był maksymalnie wąski.
-- ============================================================

alter function public.match_documents(vector, double precision, integer)
  set search_path = public, extensions, pg_temp;

-- Odśwież cache PostgREST.
notify pgrst, 'reload schema';

-- ============================================================
-- WERYFIKACJA (opcjonalnie, uruchom osobno po powyższym)
-- ------------------------------------------------------------
-- 1. Sprawdź, że search_path funkcji zawiera już `extensions`:
--
-- select proname, proconfig
-- from pg_proc
-- where proname = 'match_documents';
--
--    Oczekiwane: {"search_path=public, extensions, pg_temp"}
--
-- 2. Sprawdź, że wyszukiwanie znowu działa (bierze pierwszy lepszy wektor
--    z bazy i szuka do niego podobnych — powinno zwrócić wiersze, nie błąd):
--
-- select title, similarity
-- from match_documents((select embedding from documents limit 1), 0.1, 3);
-- ============================================================
