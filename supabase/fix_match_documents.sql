-- ============================================================
-- POPRAWKA (Lekcja 06, W3): funkcja match_documents
-- ------------------------------------------------------------
-- Uruchom RAZ w Supabase Dashboard -> SQL Editor -> "New query" -> Run.
--
-- Dlaczego: kolumna `documents.metadata` w Twojej bazie została utworzona
-- jako typ `json` (ręcznie w W1), a funkcja match_documents deklaruje `jsonb`.
-- Bez rzutowania `::jsonb` narzędzie searchKnowledge dostaje z Supabase błąd:
--   400 "Returned type json does not match expected type jsonb in column 4".
-- Ten skrypt najpierw KASUJE starą funkcję (żeby nie zostały zdublowane
-- wersje), potem tworzy poprawną z castem i odświeża cache PostgREST.
-- Nie usuwa żadnych danych z tabeli documents.
-- ============================================================

-- 1. Usuń każdą istniejącą wersję funkcji (dowolne domyślne argumenty).
drop function if exists match_documents(vector, float, int);
drop function if exists match_documents(vector, double precision, integer);

-- 2. Utwórz poprawną funkcję (metadata rzutowane na jsonb).
create function match_documents(
  query_embedding vector(768),
  match_threshold float default 0.7,
  match_count int default 5
)
returns table (
  id uuid,
  title text,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    documents.id,
    documents.title,
    documents.content,
    documents.metadata::jsonb,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- 3. Poproś PostgREST o przeładowanie schematu (od razu widzi nową funkcję).
notify pgrst, 'reload schema';

-- ============================================================
-- 4. (opcjonalnie) SPRAWDŹ w tym samym oknie, że działa — bez aplikacji.
--    Uruchom po powyższym. Jeśli zwróci wiersze LUB pustą tabelę BEZ błędu
--    "structure of query does not match..." -> poprawka zadziałała.
-- ============================================================
-- select id, title, similarity
-- from match_documents((select embedding from documents limit 1), 0.1, 3);
