-- ============================================================
-- Warsztat 1 (Lekcja 05): Schemat bazy dla agenta "moj-agent"
-- ------------------------------------------------------------
-- Jak użyć:
--   1. Otwórz Supabase Dashboard -> SQL Editor -> "New query"
--   2. Wklej CAŁĄ zawartość tego pliku
--   3. Kliknij "Run"
--   4. Sprawdź Table Editor -> powinny być 3 tabele (0 rows)
--
-- To robi dokładnie to samo co ręczne klikanie z kroków 4-6,
-- tylko szybciej. RLS zostaje WYŁĄCZONE (tak jak w warsztacie -
-- włączymy je w Lekcji 07).
-- ============================================================

-- 1. Tabela conversations (lista rozmów) --------------------
create table if not exists public.conversations (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null    default now(),
  title      text,
  updated_at timestamptz not null    default now()
);

-- 2. Tabela messages (wiadomości w rozmowach) ---------------
create table if not exists public.messages (
  id              uuid        primary key default gen_random_uuid(),
  created_at      timestamptz not null    default now(),
  conversation_id uuid        references public.conversations (id) on delete cascade,
  role            text,       -- 'user' lub 'assistant'
  content         text
);

-- indeks przyspieszający pobieranie wiadomości danej rozmowy
create index if not exists messages_conversation_id_idx
  on public.messages (conversation_id);

-- 3. Tabela user_profiles (profil użytkownika) --------------
create table if not exists public.user_profiles (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null    default now(),
  name        text,
  preferences jsonb       not null    default '{}'::jsonb
);

-- RLS wyłączone na tym etapie (zgodnie z warsztatem) --------
alter table public.conversations  disable row level security;
alter table public.messages       disable row level security;
alter table public.user_profiles  disable row level security;

-- ============================================================
-- Lekcja 06, Warsztat 1+2: Baza wiedzy (RAG / pgvector)
-- ------------------------------------------------------------
-- Włącz pgvector, tabelę `documents` (fragmenty + embeddingi 768D)
-- oraz funkcję wyszukiwania po podobieństwie `match_documents`.
-- ============================================================

-- 1. Rozszerzenie pgvector
create extension if not exists vector;

-- 2. Tabela documents (fragmenty dokumentów + wektory) ------
create table if not exists public.documents (
  id         uuid        primary key default gen_random_uuid(),
  created_at timestamptz not null    default now(),
  title      text,               -- nazwa dokumentu (np. "Cennik 2026")
  content    text,               -- fragment tekstu (chunk)
  embedding  vector(768),        -- wektor znaczeniowy (Gemini text-embedding-004)
  metadata   jsonb       not null default '{}'::jsonb
);

alter table public.documents disable row level security;

-- 3. Funkcja wyszukiwania najbliższych fragmentów ----------
create or replace function match_documents(
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
    -- rzutowanie na jsonb: żywa kolumna metadata bywa typu json (ustawiona
    -- ręcznie w W1), a funkcja deklaruje jsonb — bez castu PostgREST zwraca
    -- błąd 400 "Returned type json does not match expected type jsonb".
    documents.metadata::jsonb,
    1 - (documents.embedding <=> query_embedding) as similarity
  from documents
  where 1 - (documents.embedding <=> query_embedding) > match_threshold
  order by documents.embedding <=> query_embedding
  limit match_count;
end;
$$;
