#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
chatbot.py — wielodostawcowy chatbot CLI (zadanie końcowe kursu "Budowanie Agentów AI").

Ten sam agent co w aplikacji Next.js (Marta Wiśniewska — doradca nieruchomości
i kredytów hipotecznych), ale w jednym pliku Pythona i z przełącznikiem dostawcy,
żeby dało się porównać, który model lepiej radzi sobie z TĄ domeną.

ZERO ZALEŻNOŚCI — tylko biblioteka standardowa (urllib + json). Nie ma `pip install`.

    python chatbot.py                      # rozmowa (pierwszy skonfigurowany dostawca)
    python chatbot.py --dostawca groq      # rozmowa na wskazanym dostawcy
    python chatbot.py --lista              # co jest skonfigurowane, a co nie
    python chatbot.py --modele             # żywa lista modeli prosto z API dostawców
    python chatbot.py --demo               # 3 gotowe tury pod screenshot
    python chatbot.py --porownaj "pytanie" # to samo pytanie do WSZYSTKICH dostawców
    python chatbot.py --zestaw pytania.txt --zapisz wynik.md   # wsad do README

Komendy w trakcie rozmowy: /pomoc /model /modele /porownaj /reset /zapisz /koniec

Klucze API czytane są z .env.local (ten sam plik, co aplikacja Next.js) albo ze
zmiennych środowiskowych. Klucze NIGDY nie trafiają do repo — .env.local jest
w .gitignore.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path

# ============================================================
# 1. PERSONA — domena, na której porównujemy modele
# ============================================================
# Skrócona wersja promptu z app/api/chat/route.ts. Świadomie skrócona: w porównaniu
# chodzi o to, czy model UTRZYMUJE narzuconą strukturę i nie zmyśla liczb — a nie
# o to, który zniesie dłuższy prompt.

SYSTEM = """# Marta Wiśniewska — Doradca ds. nieruchomości i kredytów hipotecznych

## KIM JESTEM
Jestem doradcą nieruchomości z 12-letnim doświadczeniem na polskim rynku.
Specjalizuję się w: zakupie i sprzedaży mieszkań (rynek pierwotny i wtórny),
kredytach hipotecznych oraz analizie stanu prawnego nieruchomości
(księgi wieczyste, umowy).

## JAK ODPOWIADAM

### Struktura KAŻDEJ odpowiedzi (zawsze te 4 sekcje):
1. 📋 **Kontekst** — potwierdzam zrozumienie pytania (1 zdanie).
2. 🔍 **Analiza** — merytoryczna odpowiedź (max 2 akapity).
3. ✅ **Rekomendacja** — konkretne działanie do podjęcia (1-3 punkty).
4. ❓ **Pytanie** — jedno pytanie pogłębiające do użytkownika.

### Zasady:
- ZANIM odpowiem na złożone pytanie — dopytuję o kontekst (budżet, miasto, cel zakupu).
- Gdy podaję fakty — oznaczam pewność: ✓ pewne, ~ przybliżone, ? do weryfikacji.
- **Pogrubiam** kluczowe terminy przy pierwszym użyciu.
- Maksymalnie 3 akapity + rekomendacja. Zwięźle.

### Styl:
- Język: polski.
- Ton: profesjonalny, ale przystępny.
- Gdy używam terminu branżowego — wyjaśniam go w nawiasie.

## PAMIĘĆ
Pamiętasz CAŁĄ rozmowę i nawiązujesz do wcześniejszych wiadomości. Jeśli użytkownik
podał imię — używaj go. Na komendę "podsumuj" — streszczenie rozmowy w numerowanej liście.

## CZEGO NIE ROBIĘ
- Nie odpowiadam na pytania spoza nieruchomości i kredytów — mówię wprost:
  "To nie moja specjalizacja" i proponuję, w czym MOGĘ pomóc.
- Nie udaję, że wiem coś, czego nie wiem. Nie podaję zmyślonych stawek ani przepisów.
- Nie udzielam wiążących porad prawnych ani podatkowych — odsyłam do notariusza."""


# ============================================================
# 2. REJESTR DOSTAWCÓW
# ============================================================
# Sedno zadania: 8 dostawców, ale tylko 4 protokoły. Groq, Cerebras, OpenRouter,
# Mistral, OpenAI i GitHub Models mówią dialektem OpenAI (/chat/completions), więc
# obsługuje je JEDEN adapter. Dorzucenie kolejnego dostawcy = jedna linijka niżej.


@dataclass(frozen=True)
class Dostawca:
    id: str
    etykieta: str
    protokol: str  # "openai" | "google" | "anthropic" | "cohere"
    baza: str  # bazowy URL API
    model: str  # domyślny model (podmienisz przez --model albo /model)
    env: str  # nazwa zmiennej z kluczem API
    darmowy: bool  # czy ma darmowy tier
    skad: str  # gdzie wziąć klucz


DOSTAWCY: dict[str, Dostawca] = {
    "google": Dostawca(
        "google", "Google Gemini", "google",
        "https://generativelanguage.googleapis.com/v1beta",
        "gemini-3.1-flash-lite",
        "GOOGLE_GENERATIVE_AI_API_KEY", True, "aistudio.google.com",
    ),
    "google-pro": Dostawca(
        "google-pro", "Google Gemini Pro", "google",
        "https://generativelanguage.googleapis.com/v1beta",
        "gemini-3.1-pro-preview",
        "GOOGLE_GENERATIVE_AI_API_KEY", True, "aistudio.google.com",
    ),
    "groq": Dostawca(
        "groq", "Groq", "openai",
        "https://api.groq.com/openai/v1",
        "llama-3.3-70b-versatile",
        "GROQ_API_KEY", True, "console.groq.com",
    ),
    "groq-oss": Dostawca(
        "groq-oss", "Groq (GPT-OSS)", "openai",
        "https://api.groq.com/openai/v1",
        "openai/gpt-oss-120b",
        "GROQ_API_KEY", True, "console.groq.com",
    ),
    "cohere": Dostawca(
        "cohere", "Cohere", "cohere",
        "https://api.cohere.com/v2",
        "command-a-03-2025",
        "COHERE_API_KEY", True, "dashboard.cohere.com",
    ),
    "cerebras": Dostawca(
        "cerebras", "Cerebras", "openai",
        "https://api.cerebras.ai/v1",
        "llama-3.3-70b",
        "CEREBRAS_API_KEY", True, "cloud.cerebras.ai",
    ),
    "openrouter": Dostawca(
        "openrouter", "OpenRouter", "openai",
        "https://openrouter.ai/api/v1",
        "meta-llama/llama-3.3-70b-instruct:free",
        "OPENROUTER_API_KEY", True, "openrouter.ai",
    ),
    "mistral": Dostawca(
        "mistral", "Mistral", "openai",
        "https://api.mistral.ai/v1",
        "mistral-large-latest",
        "MISTRAL_API_KEY", True, "console.mistral.ai",
    ),
    "openai": Dostawca(
        "openai", "OpenAI", "openai",
        "https://api.openai.com/v1",
        "gpt-4.1-mini",
        "OPENAI_API_KEY", False, "platform.openai.com",
    ),
    "anthropic": Dostawca(
        "anthropic", "Anthropic Claude", "anthropic",
        "https://api.anthropic.com/v1",
        "claude-sonnet-4-5",
        "ANTHROPIC_API_KEY", False, "console.anthropic.com",
    ),
}


# ============================================================
# 3. KLUCZE API — z .env.local albo ze środowiska
# ============================================================

def wczytaj_env() -> None:
    """Doczytuje .env.local / .env z katalogu skryptu i katalogów wyżej.

    Wczytujemy WYŁĄCZNIE klucze dostawców LLM. Ten sam .env.local trzyma też
    sekrety aplikacji Next.js — m.in. SUPABASE_SERVICE_ROLE_KEY, który pomija
    RLS i daje pełny dostęp do bazy. Chatbot go nie potrzebuje, więc nie ma
    powodu, żeby w ogóle trafiał do pamięci tego procesu.

    Zmienne już obecne w środowisku mają pierwszeństwo — dzięki temu da się
    nadpisać klucz na jeden strzał: GROQ_API_KEY=xxx python chatbot.py
    """
    potrzebne = {d.env for d in DOSTAWCY.values()}
    tutaj = Path(__file__).resolve().parent
    for katalog in (tutaj, *tutaj.parents[:3]):
        for nazwa in (".env.local", ".env"):
            plik = katalog / nazwa
            if not plik.is_file():
                continue
            for linia in plik.read_text(encoding="utf-8", errors="replace").splitlines():
                linia = linia.strip()
                if not linia or linia.startswith("#") or "=" not in linia:
                    continue
                nazwa_zm, _, wartosc = linia.partition("=")
                nazwa_zm = nazwa_zm.strip()
                if nazwa_zm not in potrzebne:
                    continue  # nie nasza sprawa — nie dotykamy sekretów aplikacji
                wartosc = wartosc.strip().strip('"').strip("'")
                if wartosc and nazwa_zm not in os.environ:
                    os.environ[nazwa_zm] = wartosc


def klucz(d: Dostawca) -> str | None:
    return os.environ.get(d.env) or None


def skonfigurowani() -> list[Dostawca]:
    """Dostawcy, dla których mamy klucz. Google-pro pomijamy w porównaniach
    tylko wtedy, gdy nie ma klucza Google — poza tym to pełnoprawna pozycja."""
    return [d for d in DOSTAWCY.values() if klucz(d)]


# ============================================================
# 4. WARSTWA HTTP
# ============================================================

class BladAPI(Exception):
    """Błąd dostawcy przetłumaczony na ludzki komunikat."""

    def __init__(self, komunikat: str, status: int | None = None):
        super().__init__(komunikat)
        self.status = status


def _zapytaj(url: str, naglowki: dict[str, str], cialo: dict | None = None,
             metoda: str = "POST", timeout: int = 120) -> dict:
    dane = json.dumps(cialo, ensure_ascii=False).encode("utf-8") if cialo is not None else None
    # Bez własnego User-Agenta Cloudflare (m.in. przed Groq) odrzuca domyślne
    # "Python-urllib/3.x" błędem 1010, zanim zapytanie w ogóle dotrze do API.
    naglowki = {"User-Agent": "moj-agent-chatbot/1.0", **naglowki}
    zadanie = urllib.request.Request(url, data=dane, headers=naglowki, method=metoda)
    try:
        with urllib.request.urlopen(zadanie, timeout=timeout) as odp:
            return json.loads(odp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        surowe = e.read().decode("utf-8", errors="replace")
        raise BladAPI(_czytelny_blad(e.code, surowe), e.code) from None
    except urllib.error.URLError as e:
        raise BladAPI(f"Brak połączenia z API ({e.reason}).") from None
    except TimeoutError:
        raise BladAPI(f"Model nie odpowiedział w {timeout} s.") from None


def _czytelny_blad(status: int, surowe: str) -> str:
    """Ta sama filozofia co errorMessage() w app/api/chat/route.ts — zamiast
    ściany JSON-a pokazujemy zdanie, z którym da się coś zrobić."""
    tresc = surowe
    try:
        j = json.loads(surowe)
        tresc = (j.get("error", {}).get("message")
                 if isinstance(j.get("error"), dict) else None) or j.get("message") or surowe
    except (json.JSONDecodeError, AttributeError):
        pass
    tresc = str(tresc)[:300]

    if status in (401, 403):
        return f"Klucz API odrzucony (HTTP {status}). Sprawdź go w .env.local. Szczegóły: {tresc}"
    if status == 404:
        return f"Nie ma takiego modelu (HTTP 404). Uruchom `--modele`, żeby zobaczyć aktualną listę. Szczegóły: {tresc}"
    if status == 429:
        return f"Limit zapytań wyczerpany (HTTP 429). Poczekaj chwilę. Szczegóły: {tresc}"
    if status in (500, 502, 503, 529):
        return f"Model chwilowo przeciążony (HTTP {status}). Spróbuj ponownie. Szczegóły: {tresc}"
    return f"Błąd API (HTTP {status}): {tresc}"


def _z_ponowieniem(fn, proby: int = 3):
    """429/503 zdarzają się na darmowych tierach rutynowo — nie ma powodu, żeby
    wywracały całe porównanie. Odczekujemy 2 s, 4 s i dopiero wtedy poddajemy się."""
    for nr in range(proby):
        try:
            return fn()
        except BladAPI as e:
            ostatnia = nr == proby - 1
            if ostatnia or e.status not in (429, 500, 502, 503, 529):
                raise
            time.sleep(2 * (nr + 1))
    raise AssertionError("nieosiągalne")


# ============================================================
# 5. ADAPTERY — 4 protokoły na 9 pozycji w rejestrze
# ============================================================

@dataclass
class Odpowiedz:
    tekst: str
    tokeny_wej: int | None = None
    tokeny_wyj: int | None = None
    tokeny_mysli: int | None = None  # modele myślące (Gemini Pro) — rozumowanie
    uciete: bool = False  # model trafił w limit tokenów, odpowiedź niepełna
    sekundy: float = 0.0


Wiadomosc = dict[str, str]  # {"role": "user"|"assistant", "content": "..."}

MAX_TOKENOW = 1000  # budżet na SAMĄ odpowiedź
# Gemini 3 Pro wlicza tokeny rozumowania do maxOutputTokens — przy limicie 1000
# potrafi zużyć 956 na myślenie i uciąć odpowiedź w połowie zdania (finishReason
# = MAX_TOKENS). Żeby porównanie było uczciwe, modele myślące dostają ten sam
# budżet na odpowiedź CO RESZTA, plus osobny zapas na rozumowanie.
ZAPAS_NA_MYSLENIE = 2500
TEMPERATURA = 0.7


def _openai(d: Dostawca, model: str, historia: list[Wiadomosc]) -> Odpowiedz:
    """Dialekt OpenAI: Groq, Cerebras, OpenRouter, Mistral, OpenAI, GitHub Models."""
    cialo = {
        "model": model,
        "messages": [{"role": "system", "content": SYSTEM}, *historia],
        "temperature": TEMPERATURA,
        "max_tokens": MAX_TOKENOW,
    }
    naglowki = {
        "Authorization": f"Bearer {klucz(d)}",
        "Content-Type": "application/json",
    }
    if d.id == "openrouter":  # OpenRouter prosi o identyfikację aplikacji
        naglowki["HTTP-Referer"] = "https://github.com/moj-agent"
        naglowki["X-Title"] = "moj-agent"

    try:
        dane = _zapytaj(f"{d.baza}/chat/completions", naglowki, cialo)
    except BladAPI as e:
        # Nowsze modele OpenAI odrzucają max_tokens i/lub temperature. Zamiast
        # trzymać osobną listę wyjątków — reagujemy na to, co powie API.
        tekst = str(e)
        if e.status == 400 and "max_tokens" in tekst:
            cialo["max_completion_tokens"] = cialo.pop("max_tokens")
            dane = _zapytaj(f"{d.baza}/chat/completions", naglowki, cialo)
        elif e.status == 400 and "temperature" in tekst:
            cialo.pop("temperature", None)
            dane = _zapytaj(f"{d.baza}/chat/completions", naglowki, cialo)
        else:
            raise

    wybor = (dane.get("choices") or [{}])[0]
    tekst = (wybor.get("message") or {}).get("content") or ""
    uzycie = dane.get("usage") or {}
    return Odpowiedz(
        tekst.strip(), uzycie.get("prompt_tokens"), uzycie.get("completion_tokens"),
        uciete=wybor.get("finish_reason") == "length",
    )


def _google(d: Dostawca, model: str, historia: list[Wiadomosc]) -> Odpowiedz:
    """Gemini: własny format (contents/parts), rola asystenta nazywa się "model"."""
    cialo = {
        "systemInstruction": {"parts": [{"text": SYSTEM}]},
        "contents": [
            {"role": "user" if w["role"] == "user" else "model",
             "parts": [{"text": w["content"]}]}
            for w in historia
        ],
        "generationConfig": {
            "temperature": TEMPERATURA,
            "maxOutputTokens": MAX_TOKENOW + ZAPAS_NA_MYSLENIE,
        },
    }
    dane = _zapytaj(
        f"{d.baza}/models/{model}:generateContent",
        {"x-goog-api-key": klucz(d) or "", "Content-Type": "application/json"},
        cialo,
    )
    kandydat = (dane.get("candidates") or [{}])[0]
    czesci = (kandydat.get("content") or {}).get("parts") or []
    # Modele myślące zwracają też części z thought=true — to nie jest odpowiedź.
    tekst = "".join(c.get("text", "") for c in czesci if not c.get("thought"))
    u = dane.get("usageMetadata") or {}
    return Odpowiedz(
        tekst.strip(), u.get("promptTokenCount"), u.get("candidatesTokenCount"),
        tokeny_mysli=u.get("thoughtsTokenCount"),
        uciete=kandydat.get("finishReason") == "MAX_TOKENS",
    )


def _anthropic(d: Dostawca, model: str, historia: list[Wiadomosc]) -> Odpowiedz:
    """Claude: system jako osobne pole (nie wiadomość), max_tokens wymagany."""
    dane = _zapytaj(
        f"{d.baza}/messages",
        {"x-api-key": klucz(d) or "", "anthropic-version": "2023-06-01",
         "Content-Type": "application/json"},
        {"model": model, "max_tokens": MAX_TOKENOW, "temperature": TEMPERATURA,
         "system": SYSTEM, "messages": historia},
    )
    tekst = "".join(b.get("text", "") for b in dane.get("content", []) if b.get("type") == "text")
    u = dane.get("usage") or {}
    return Odpowiedz(tekst.strip(), u.get("input_tokens"), u.get("output_tokens"),
                     uciete=dane.get("stop_reason") == "max_tokens")


def _cohere(d: Dostawca, model: str, historia: list[Wiadomosc]) -> Odpowiedz:
    """Cohere v2: messages jak w OpenAI, ale odpowiedź w message.content[]."""
    dane = _zapytaj(
        f"{d.baza}/chat",
        {"Authorization": f"Bearer {klucz(d)}", "Content-Type": "application/json"},
        {"model": model,
         "messages": [{"role": "system", "content": SYSTEM}, *historia],
         "temperature": TEMPERATURA, "max_tokens": MAX_TOKENOW},
    )
    czesci = (dane.get("message") or {}).get("content") or []
    tekst = "".join(c.get("text", "") for c in czesci if c.get("type") == "text")
    t = ((dane.get("usage") or {}).get("tokens") or {})
    return Odpowiedz(tekst.strip(), t.get("input_tokens"), t.get("output_tokens"),
                     uciete=dane.get("finish_reason") == "MAX_TOKENS")


ADAPTERY = {"openai": _openai, "google": _google, "anthropic": _anthropic, "cohere": _cohere}


def odpowiedz(d: Dostawca, historia: list[Wiadomosc], model: str | None = None) -> Odpowiedz:
    """Jedno wejście dla całej reszty programu — dostawca w środku jest szczegółem."""
    uzyty = model or d.model
    start = time.time()
    wynik = _z_ponowieniem(lambda: ADAPTERY[d.protokol](d, uzyty, historia))
    wynik.sekundy = time.time() - start
    if not wynik.tekst:
        raise BladAPI("Model zwrócił pustą odpowiedź (możliwe, że ucięły ją filtry bezpieczeństwa).")
    return wynik


# ============================================================
# 6. LISTA MODELI Z API — bo identyfikatory modeli zmieniają się co miesiąc
# ============================================================

def lista_modeli(d: Dostawca, limit: int = 40) -> list[str]:
    k = klucz(d)
    if not k:
        return []
    if d.protokol == "google":
        # Klucz idzie nagłówkiem, nie w ?key= — adresy URL trafiają do logów
        # serwerów i proxy, nagłówki nie.
        dane = _zapytaj(f"{d.baza}/models?pageSize=200", {"x-goog-api-key": k},
                        None, "GET", 30)
        nazwy = [m.get("name", "").removeprefix("models/") for m in dane.get("models", [])
                 if "generateContent" in (m.get("supportedGenerationMethods") or [])]
    elif d.protokol == "anthropic":
        dane = _zapytaj(f"{d.baza}/models?limit=50",
                        {"x-api-key": k, "anthropic-version": "2023-06-01"}, None, "GET", 30)
        nazwy = [m.get("id", "") for m in dane.get("data", [])]
    elif d.protokol == "cohere":
        dane = _zapytaj("https://api.cohere.com/v1/models?page_size=100&endpoint=chat",
                        {"Authorization": f"Bearer {k}"}, None, "GET", 30)
        nazwy = [m.get("name", "") for m in dane.get("models", [])]
    else:
        dane = _zapytaj(f"{d.baza}/models", {"Authorization": f"Bearer {k}"}, None, "GET", 30)
        nazwy = [m.get("id", "") for m in dane.get("data", [])]
    return [n for n in nazwy if n][:limit]


# ============================================================
# 7. WYGLĄD TERMINALA
# ============================================================

def _wlacz_kolory() -> bool:
    if os.environ.get("NO_COLOR"):
        return False
    if sys.platform == "win32":
        # Windows 10+ obsługuje ANSI, ale trzeba to włączyć na uchwycie konsoli.
        try:
            import ctypes
            uchwyt = ctypes.windll.kernel32.GetStdHandle(-11)
            tryb = ctypes.c_uint32()
            ctypes.windll.kernel32.GetConsoleMode(uchwyt, ctypes.byref(tryb))
            ctypes.windll.kernel32.SetConsoleMode(uchwyt, tryb.value | 0x0004)
        except (ImportError, AttributeError, OSError):
            return False
    return sys.stdout.isatty()


KOLORY = _wlacz_kolory()


def _k(kod: str, tekst: str) -> str:
    return f"\033[{kod}m{tekst}\033[0m" if KOLORY else tekst


def tytul(t: str) -> str:
    return _k("1;36", t)


def przygaszone(t: str) -> str:
    return _k("2", t)


def zolty(t: str) -> str:
    return _k("33", t)


def zielony(t: str) -> str:
    return _k("32", t)


def czerwony(t: str) -> str:
    return _k("31", t)


def ramka(tekst: str, szer: int = 74) -> str:
    linia = "─" * szer
    return f"{przygaszone('┌' + linia + '┐')}\n{tekst}\n{przygaszone('└' + linia + '┘')}"


def naglowek(d: Dostawca, model: str) -> str:
    znak = "🆓" if d.darmowy else "💳"
    return tytul(f"\n╭─ {d.etykieta} {znak}  ") + przygaszone(f"({model})")


def stopka(o: Odpowiedz) -> str:
    czesci = [f"{o.sekundy:.1f} s"]
    if o.tokeny_wej is not None:
        czesci.append(f"wej. {o.tokeny_wej}")
    if o.tokeny_wyj is not None:
        czesci.append(f"wyj. {o.tokeny_wyj} tok.")
    if o.tokeny_mysli:
        czesci.append(f"myślenie {o.tokeny_mysli} tok.")
    czesci.append(f"{len(o.tekst)} znaków")
    linia = przygaszone("╰─ " + " · ".join(czesci))
    return linia + czerwony("  ⚠ odpowiedź ucięta limitem tokenów") if o.uciete else linia


class Kreska:
    """Prosty wskaźnik 'model myśli' — bez niego 10-sekundowa cisza wygląda
    jak zawieszony program."""

    def __init__(self, etykieta: str):
        self.etykieta = etykieta

    def __enter__(self):
        if KOLORY:
            print(przygaszone(f"  ⋯ {self.etykieta} myśli…"), end="\r", flush=True)
        return self

    def __exit__(self, *_):
        if KOLORY:
            print(" " * (len(self.etykieta) + 20), end="\r", flush=True)
        return False


# ============================================================
# 8. TRYBY DZIAŁANIA
# ============================================================

POMOC = """
Komendy:
  /pomoc              ta lista
  /model <id>         zmień dostawcę (np. /model groq) lub model (/model gemini-3.1-pro-preview)
  /modele             pokaż modele dostępne u aktualnego dostawcy
  /porownaj <pytanie> zadaj to samo pytanie wszystkim skonfigurowanym dostawcom
  /reset              wyczyść pamięć rozmowy
  /zapisz [plik]      zapisz rozmowę do pliku .md
  /koniec             wyjście (albo Ctrl+C)
"""


def pokaz_liste() -> None:
    print(tytul("\nDostawcy w rejestrze:\n"))
    for d in DOSTAWCY.values():
        # Kolor dokładamy PO wyrównaniu — kody ANSI liczą się do długości f-stringa
        # i rozjeżdżają kolumny, mimo że na ekranie są niewidoczne.
        surowy = "✓ skonfigurowany" if klucz(d) else f"— brak {d.env}"
        stan = (zielony if klucz(d) else przygaszone)(f"{surowy:<32}")
        koszt = "🆓 darmowy tier" if d.darmowy else "💳 płatny"
        print(f"  {d.id:<12} {d.etykieta:<22} {stan} {przygaszone(koszt + ' · ' + d.skad)}")
    ile = len(skonfigurowani())
    print(f"\n  Skonfigurowanych: {zielony(str(ile)) if ile >= 3 else zolty(str(ile))} "
          f"{przygaszone('(zadanie wymaga min. 3)')}\n")


def pokaz_modele() -> None:
    for d in skonfigurowani():
        print(tytul(f"\n{d.etykieta}"))
        try:
            for m in lista_modeli(d):
                gwiazdka = zielony(" ← domyślny") if m == d.model else ""
                print(f"  {m}{gwiazdka}")
        except BladAPI as e:
            print(czerwony(f"  {e}"))
    print()


def rozmowa(d: Dostawca, model: str | None, wstepne: list[str] | None = None) -> None:
    """Pętla czatu z pamięcią całej rozmowy."""
    historia: list[Wiadomosc] = []
    aktualny, aktualny_model = d, model or d.model

    print(ramka(
        f"  {tytul('Marta Wiśniewska')} — doradca nieruchomości i kredytów hipotecznych\n"
        f"  {przygaszone('Dostawca:')} {aktualny.etykieta} {przygaszone('· model:')} {aktualny_model}\n"
        f"  {przygaszone('/pomoc — komendy · /koniec — wyjście')}"
    ))

    kolejka = list(wstepne or [])
    while True:
        if kolejka:
            wejscie = kolejka.pop(0)
            print(f"\n{zolty('Ty ›')} {wejscie}")
        else:
            try:
                wejscie = input(f"\n{zolty('Ty ›')} ").strip()
            except (EOFError, KeyboardInterrupt):
                print(przygaszone("\n\nDo zobaczenia.\n"))
                return
        if not wejscie:
            continue

        # ---- komendy ----
        if wejscie.startswith("/"):
            cmd, _, arg = wejscie.partition(" ")
            cmd, arg = cmd.lower(), arg.strip()

            if cmd in ("/koniec", "/exit", "/quit"):
                print(przygaszone("\nDo zobaczenia.\n"))
                return
            if cmd == "/pomoc":
                print(przygaszone(POMOC))
                continue
            if cmd == "/reset":
                historia.clear()
                print(zielony("  ✓ Pamięć rozmowy wyczyszczona."))
                continue
            if cmd == "/modele":
                print(tytul(f"\n{aktualny.etykieta}"))
                try:
                    for m in lista_modeli(aktualny):
                        print(f"  {m}{zielony(' ← teraz') if m == aktualny_model else ''}")
                except BladAPI as e:
                    print(czerwony(f"  {e}"))
                continue
            if cmd == "/model":
                if not arg:
                    print(przygaszone(f"  Teraz: {aktualny.id} / {aktualny_model}"))
                    continue
                if arg in DOSTAWCY:
                    nowy = DOSTAWCY[arg]
                    if not klucz(nowy):
                        print(czerwony(f"  Brak klucza {nowy.env} — dopisz go do .env.local."))
                        continue
                    aktualny, aktualny_model = nowy, nowy.model
                    print(zielony(f"  ✓ Dostawca: {nowy.etykieta} ({nowy.model})"))
                else:  # nie nazwa dostawcy → traktujemy jako identyfikator modelu
                    aktualny_model = arg
                    print(zielony(f"  ✓ Model: {arg} (u {aktualny.etykieta})"))
                continue
            if cmd == "/zapisz":
                plik = Path(arg) if arg else Path("rozmowa.md")
                plik.write_text(rozmowa_do_md(historia, aktualny, aktualny_model), encoding="utf-8")
                print(zielony(f"  ✓ Zapisano: {plik.resolve()}"))
                continue
            if cmd == "/porownaj":
                if not arg:
                    print(czerwony("  Użycie: /porownaj Twoje pytanie"))
                    continue
                porownaj([arg])  # sama wypisuje odpowiedzi; markdown tu nie jest potrzebny
                continue
            print(czerwony(f"  Nieznana komenda: {cmd}. Wpisz /pomoc."))
            continue

        # ---- normalna tura rozmowy ----
        historia.append({"role": "user", "content": wejscie})
        print(naglowek(aktualny, aktualny_model))
        try:
            with Kreska(aktualny.etykieta):
                o = odpowiedz(aktualny, historia, aktualny_model)
        except BladAPI as e:
            historia.pop()  # nie zostawiaj w pamięci pytania bez odpowiedzi
            print(czerwony(f"  ✗ {e}"))
            continue
        print(o.tekst)
        print(stopka(o))
        historia.append({"role": "assistant", "content": o.tekst})


def rozmowa_do_md(historia: list[Wiadomosc], d: Dostawca, model: str) -> str:
    linie = [f"# Rozmowa — {d.etykieta} ({model})", ""]
    for w in historia:
        kto = "**Ty**" if w["role"] == "user" else f"**{d.etykieta}**"
        linie += [f"{kto}:", "", w["content"], ""]
    return "\n".join(linie)


def porownaj(pytania: list[str], dostawcy: list[Dostawca] | None = None) -> str:
    """To samo pytanie do każdego dostawcy. Zwraca markdown gotowy do README.

    Każdy dostawca dostaje własną, świeżą historię — inaczej porównywalibyśmy
    modele w różnych kontekstach.
    """
    lista = dostawcy or skonfigurowani()
    if not lista:
        return czerwony("Brak skonfigurowanych dostawców — uzupełnij .env.local.")

    md: list[str] = []
    podsumowanie: list[tuple[str, str, str, str, str]] = []

    for pytanie in pytania:
        print(tytul(f"\n{'═' * 76}\nPYTANIE: {pytanie}\n{'═' * 76}"))
        md += [f"### Pytanie: {pytanie}", ""]
        for d in lista:
            print(naglowek(d, d.model))
            try:
                with Kreska(d.etykieta):
                    o = odpowiedz(d, [{"role": "user", "content": pytanie}])
            except BladAPI as e:
                print(czerwony(f"  ✗ {e}"))
                md += [f"**{d.etykieta}** — ❌ {e}", ""]
                podsumowanie.append((d.etykieta, d.model, "—", "—", "błąd"))
                continue
            print(o.tekst)
            print(stopka(o))
            mysli = f" (+{o.tokeny_mysli} tok. myślenia)" if o.tokeny_mysli else ""
            ostrzezenie = " ⚠ UCIĘTE" if o.uciete else ""
            md += [f"**{d.etykieta}** (`{d.model}`) — {o.sekundy:.1f} s, "
                   f"{o.tokeny_wyj or '?'} tok. wyj.{mysli}{ostrzezenie}",
                   "", "```", o.tekst, "```", ""]
            podsumowanie.append((d.etykieta, d.model, f"{o.sekundy:.1f} s",
                                 f"{o.tokeny_wyj or '?'}{mysli}", f"{len(o.tekst)} zn."))

    md += ["### Podsumowanie", "",
           "| Dostawca | Model | Czas | Tokeny wyj. | Długość |",
           "|---|---|---|---|---|"]
    md += [f"| {a} | `{b}` | {c} | {d_} | {e} |" for a, b, c, d_, e in podsumowanie]
    md.append("")

    print(tytul("\n" + "─" * 76))
    print(tytul(f"{'Dostawca':<24}{'Czas':>8}{'Tok. wyj.':>12}{'Znaków':>10}"))
    for a, _b, c, d_, e in podsumowanie:
        print(f"{a:<24}{c:>8}{d_:>12}{e.replace(' zn.', ''):>10}")
    print(tytul("─" * 76 + "\n"))

    return "\n".join(md)


# Trzy tury na screenshot: pierwsza zawiązuje kontekst, druga wymaga pamięci
# ("mój budżet"), trzecia sprawdza, czy agent trzyma się swojej działki.
DEMO = [
    "Cześć, mam na imię Sebastian. Szukam mieszkania w Krakowie, budżet 650 tys. zł.",
    "Mam 120 tys. wkładu własnego. Wystarczy przy moim budżecie?",
    "A przy okazji — jaka jest stolica Australii?",
]


# ============================================================
# 9. CLI
# ============================================================

def main() -> int:
    wczytaj_env()

    p = argparse.ArgumentParser(
        description="Wielodostawcowy chatbot CLI — doradca nieruchomości.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    p.add_argument("--dostawca", "-d", help="id dostawcy (patrz --lista)")
    p.add_argument("--model", "-m", help="konkretny model u wybranego dostawcy")
    p.add_argument("--lista", action="store_true", help="pokaż dostawców i stan konfiguracji")
    p.add_argument("--modele", action="store_true", help="pobierz listę modeli z API dostawców")
    p.add_argument("--demo", action="store_true", help="3 gotowe tury rozmowy (pod screenshot)")
    p.add_argument("--porownaj", action="append", metavar="PYTANIE",
                   help="zadaj pytanie wszystkim dostawcom (można powtórzyć)")
    p.add_argument("--zestaw", metavar="PLIK", help="plik z pytaniami, jedno na linię")
    p.add_argument("--zapisz", metavar="PLIK", help="zapisz wynik porównania do pliku .md")
    a = p.parse_args()

    if a.lista:
        pokaz_liste()
        return 0
    if a.modele:
        if not skonfigurowani():
            print(czerwony("Brak kluczy API. Uzupełnij .env.local."))
            return 1
        pokaz_modele()
        return 0

    pytania = list(a.porownaj or [])
    if a.zestaw:
        plik = Path(a.zestaw)
        if not plik.is_file():
            print(czerwony(f"Nie ma pliku: {plik}"))
            return 1
        pytania += [l.strip() for l in plik.read_text(encoding="utf-8").splitlines()
                    if l.strip() and not l.startswith("#")]

    gotowi = skonfigurowani()
    if not gotowi:
        print(czerwony("\nBrak kluczy API.") +
              " Dopisz do .env.local co najmniej jeden z:\n")
        for d in DOSTAWCY.values():
            print(f"  {d.env:<32} {przygaszone(d.skad)}")
        print()
        return 1

    if pytania:
        md = porownaj(pytania)
        if a.zapisz:
            Path(a.zapisz).write_text(md, encoding="utf-8")
            print(zielony(f"✓ Zapisano porównanie: {Path(a.zapisz).resolve()}\n"))
        return 0

    if a.dostawca:
        if a.dostawca not in DOSTAWCY:
            print(czerwony(f"Nieznany dostawca: {a.dostawca}. Zobacz --lista."))
            return 1
        wybrany = DOSTAWCY[a.dostawca]
        if not klucz(wybrany):
            print(czerwony(f"Brak klucza {wybrany.env} w .env.local."))
            return 1
    else:
        wybrany = gotowi[0]

    rozmowa(wybrany, a.model, DEMO if a.demo else None)
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        print(przygaszone("\nPrzerwano.\n"))
        sys.exit(130)
