// ============================================================
// Warsztat 2 (Lekcja 05): Klient Supabase
// ------------------------------------------------------------
// Jeden współdzielony klient dla całej aplikacji. Czyta klucze
// z .env.local (NEXT_PUBLIC_* są dostępne po stronie przeglądarki).
// ============================================================

import { createClient } from "@supabase/supabase-js";
// Klient service_role — TYLKO do zapisów serwerowych bez sesji (W3).
// Import jest bezpieczny w bundlu klienta: klient admin tworzy się dopiero
// przy wywołaniu getSupabaseAdmin(), a te wołamy wyłącznie server-side.
import { getSupabaseAdmin } from "./supabaseAdmin";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ---- Typy pomocnicze ---------------------------------------
export type ChatRole = "user" | "assistant";

export type DbConversation = {
  id: string;
  created_at: string;
  title: string | null;
  updated_at: string;
  user_id: string | null; // W3: właściciel rozmowy (auth.uid())
};

export type DbMessage = {
  id: string;
  created_at: string;
  conversation_id: string;
  role: ChatRole;
  content: string;
};

export type DbProfile = {
  id: string;
  created_at: string;
  name: string | null;
  preferences: Record<string, string>;
};

// ---- Funkcje pomocnicze (data access) ----------------------

// Skraca pierwszą wiadomość do tytułu rozmowy (max 50 znaków).
export function makeTitle(firstMessage: string): string {
  const clean = firstMessage.trim().replace(/\s+/g, " ");
  if (clean.length <= 50) return clean;
  return clean.slice(0, 47).trimEnd() + "...";
}

// Tworzy nową rozmowę dla danego użytkownika i zwraca jej id (albo null przy błędzie).
export async function createConversation(
  title: string,
  userId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("conversations")
    .insert({ title, user_id: userId })
    .select("id")
    .single();

  if (error) {
    console.error("createConversation:", error.message);
    return null;
  }
  return data.id;
}

// Zapisuje jedną wiadomość i odświeża updated_at rozmowy.
export async function saveMessage(
  conversationId: string,
  role: ChatRole,
  content: string
): Promise<void> {
  const { error } = await supabase.from("messages").insert({
    conversation_id: conversationId,
    role,
    content,
  });
  if (error) {
    console.error("saveMessage:", error.message);
    return;
  }
  await touchConversation(conversationId);
}

// Aktualizuje updated_at rozmowy (kolejność na liście = ostatnia aktywność).
export async function touchConversation(conversationId: string): Promise<void> {
  const { error } = await supabase
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);
  if (error) console.error("touchConversation:", error.message);
}

// Pobiera ostatnią aktywną rozmowę TEGO użytkownika (albo null jeśli brak).
export async function loadLatestConversation(
  userId: string
): Promise<DbConversation | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("loadLatestConversation:", error.message);
    return null;
  }
  return data as DbConversation | null;
}

// Pobiera jedną rozmowę po ID — tylko jeśli należy do tego użytkownika (albo null).
export async function loadConversation(
  id: string,
  userId: string
): Promise<DbConversation | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.error("loadConversation:", error.message);
    return null;
  }
  return data as DbConversation | null;
}

// Rozmowa wzbogacona o metadane do listy /history.
export type ConversationMeta = DbConversation & {
  messageCount: number;
  lastMessage: string | null;
};

// Pobiera wszystkie rozmowy (najnowsze u góry) wraz z liczbą wiadomości
// i podglądem ostatniej wiadomości — do strony /history (W4).
export async function loadConversationsWithMeta(
  userId: string
): Promise<ConversationMeta[]> {
  const { data: convos, error } = await supabase
    .from("conversations")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("loadConversationsWithMeta:", error.message);
    return [];
  }
  const list = (convos ?? []) as DbConversation[];
  if (list.length === 0) return [];

  const ids = list.map((c) => c.id);
  const { data: msgs, error: msgErr } = await supabase
    .from("messages")
    .select("conversation_id, content, created_at")
    .in("conversation_id", ids)
    .order("created_at", { ascending: true });

  if (msgErr) console.error("loadConversationsWithMeta(messages):", msgErr.message);

  // Zbierz licznik i ostatnią wiadomość dla każdej rozmowy.
  const meta = new Map<string, { count: number; last: string | null }>();
  for (const m of (msgs ?? []) as { conversation_id: string; content: string }[]) {
    const e = meta.get(m.conversation_id) ?? { count: 0, last: null };
    e.count += 1;
    e.last = m.content; // sortowane rosnąco -> ostatnia iteracja = najnowsza
    meta.set(m.conversation_id, e);
  }

  return list.map((c) => ({
    ...c,
    messageCount: meta.get(c.id)?.count ?? 0,
    lastMessage: meta.get(c.id)?.last ?? null,
  }));
}

// Usuwa rozmowę wraz z jej wiadomościami — tylko jeśli należy do użytkownika (W4 §3, W3).
export async function deleteConversation(
  id: string,
  userId: string
): Promise<boolean> {
  // Nie kasuj cudzej rozmowy: sprawdź właściciela zanim usuniesz wiadomości.
  const owned = await loadConversation(id, userId);
  if (!owned) {
    console.error("deleteConversation: rozmowa nie należy do użytkownika");
    return false;
  }
  // Wiadomości i tak znikają przez ON DELETE CASCADE, ale kasujemy jawnie
  // (zgodnie z opisem warsztatu) — działa też, gdyby cascade był wyłączony.
  await supabase.from("messages").delete().eq("conversation_id", id);
  const { error } = await supabase
    .from("conversations")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) {
    console.error("deleteConversation:", error.message);
    return false;
  }
  return true;
}

// Pobiera wszystkie wiadomości danej rozmowy (chronologicznie).
export async function loadMessages(conversationId: string): Promise<DbMessage[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("loadMessages:", error.message);
    return [];
  }
  return (data ?? []) as DbMessage[];
}

// ============================================================
// Warsztat 3: Profil użytkownika (personalizacja)
// ============================================================

// Pobiera profil po ID (albo null, jeśli nie istnieje).
export async function loadProfile(userId: string): Promise<DbProfile | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("loadProfile:", error.message);
    return null;
  }
  return data as DbProfile | null;
}

// Tworzy pusty profil o zadanym ID (imię = NULL, preferencje = {}).
export async function createProfile(userId: string): Promise<DbProfile | null> {
  const { data, error } = await supabase
    .from("user_profiles")
    .insert({ id: userId })
    .select("*")
    .single();

  if (error) {
    console.error("createProfile:", error.message);
    return null;
  }
  return data as DbProfile;
}

// Pobiera profil, a jeśli go nie ma — zakłada nowy. Zawsze zwraca profil (lub null przy błędzie bazy).
export async function getOrCreateProfile(userId: string): Promise<DbProfile | null> {
  const existing = await loadProfile(userId);
  if (existing) return existing;
  return createProfile(userId);
}

// Zapisuje imię użytkownika (narzędzie saveUserName).
// Wołane server-side z /api/chat (bez sesji) — używamy klienta admin,
// bo klient `anon` zostałby zablokowany przez RLS (W3).
export async function updateUserName(userId: string, name: string): Promise<boolean> {
  const { error } = await getSupabaseAdmin()
    .from("user_profiles")
    .update({ name })
    .eq("id", userId);
  if (error) {
    console.error("updateUserName:", error.message);
    return false;
  }
  return true;
}

// Dopisuje jedną preferencję do JSONB (nie nadpisuje pozostałych).
// Server-side (bez sesji): i odczyt, i zapis idą klientem admin — inaczej
// pod RLS odczyt zwróciłby null i skasowałby dotychczasowe preferencje.
export async function updateUserPreference(
  userId: string,
  key: string,
  value: string
): Promise<boolean> {
  const admin = getSupabaseAdmin();
  const { data: profile } = await admin
    .from("user_profiles")
    .select("preferences")
    .eq("id", userId)
    .maybeSingle();
  const current = (profile?.preferences ?? {}) as Record<string, string>;
  const merged = { ...current, [key]: value };
  const { error } = await admin
    .from("user_profiles")
    .update({ preferences: merged })
    .eq("id", userId);
  if (error) {
    console.error("updateUserPreference:", error.message);
    return false;
  }
  return true;
}

// ============================================================
// Warsztat 2 (Lekcja 06): Baza wiedzy (RAG) — tabela documents
// ============================================================

export type DbDocument = {
  id: string;
  created_at: string;
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  user_id: string | null; // W3: właściciel dokumentu (auth.uid())
};

// Jeden dokument zgrupowany po tytule (do listy na stronie /upload).
export type DocumentGroup = {
  title: string;
  chunks: number;
  createdAt: string; // data dodania pierwszego fragmentu
};

// Pobiera zapisane dokumenty pogrupowane po tytule (najnowsze u góry).
// Nie ściągamy wektorów (embedding) — są ogromne i niepotrzebne na liście.
export async function loadDocumentGroups(
  userId: string
): Promise<DocumentGroup[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("title, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("loadDocumentGroups:", error.message);
    return [];
  }

  const rows = (data ?? []) as { title: string; created_at: string }[];
  const groups = new Map<string, { chunks: number; createdAt: string }>();
  for (const r of rows) {
    const g = groups.get(r.title);
    if (g) g.chunks += 1;
    else groups.set(r.title, { chunks: 1, createdAt: r.created_at });
  }

  return Array.from(groups.entries())
    .map(([title, g]) => ({ title, chunks: g.chunks, createdAt: g.createdAt }))
    // najnowsze dokumenty na górze
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// Usuwa WSZYSTKIE fragmenty dokumentu o danym tytule — tylko właściciela.
export async function deleteDocument(
  title: string,
  userId: string
): Promise<boolean> {
  const { error } = await supabase
    .from("documents")
    .delete()
    .eq("title", title)
    .eq("user_id", userId);
  if (error) {
    console.error("deleteDocument:", error.message);
    return false;
  }
  return true;
}

// Jeden fragment dokumentu (do podglądu na /knowledge — bez wektora).
export type DbChunk = {
  id: string;
  content: string;
  created_at: string;
  metadata: Record<string, unknown>;
};

// Pobiera wszystkie fragmenty jednego dokumentu (po tytule), posortowane
// wg chunk_index z metadata (a gdy go brak — wg czasu dodania). W4 §5.
export async function loadDocumentChunks(
  title: string,
  userId: string
): Promise<DbChunk[]> {
  const { data, error } = await supabase
    .from("documents")
    .select("id, content, created_at, metadata")
    .eq("title", title)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("loadDocumentChunks:", error.message);
    return [];
  }

  const rows = (data ?? []) as DbChunk[];
  return rows.sort((a, b) => {
    const ai = Number((a.metadata as { chunk_index?: number })?.chunk_index ?? 0);
    const bi = Number((b.metadata as { chunk_index?: number })?.chunk_index ?? 0);
    return ai - bi;
  });
}

// ============================================================
// Warsztat 2 (Lekcja 08): Zapisane raporty — tabela reports
// ============================================================

export type DbReport = {
  id: string;
  created_at: string;
  user_id: string;
  topic: string;
  content: string;
};

// Zapisuje gotowy raport użytkownika. Zwraca id albo null przy błędzie
// (np. gdy nie puszczono jeszcze supabase/reports.sql).
export async function saveReport(
  userId: string,
  topic: string,
  content: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("reports")
    .insert({ user_id: userId, topic, content })
    .select("id")
    .single();

  if (error) {
    console.error("saveReport:", error.message);
    return null;
  }
  return data.id;
}

// Pobiera zapisane raporty użytkownika (najnowsze u góry).
export async function loadReports(userId: string): Promise<DbReport[]> {
  const { data, error } = await supabase
    .from("reports")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("loadReports:", error.message);
    return [];
  }
  return (data ?? []) as DbReport[];
}

// Usuwa raport — tylko własny.
export async function deleteReport(id: string, userId: string): Promise<boolean> {
  const { error } = await supabase
    .from("reports")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);
  if (error) {
    console.error("deleteReport:", error.message);
    return false;
  }
  return true;
}
