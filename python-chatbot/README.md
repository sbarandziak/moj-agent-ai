# Chatbot wielodostawcowy — porównanie modeli na domenie „nieruchomości i kredyty hipoteczne"

Zadanie końcowe kursu „Budowanie Agentów AI". Ten sam agent, co w aplikacji Next.js
(**Marta Wiśniewska** — doradca nieruchomości), przeniesiony do jednego pliku Pythona
z przełącznikiem dostawcy — po to, żeby dało się sprawdzić, **który model naprawdę
radzi sobie z tą domeną**, a nie tylko „ładnie gada".

```
python-chatbot/
  chatbot.py       ← chatbot (5 dostawców, 0 zależności)
  pytania.txt      ← zestaw testowy do porównania
  porownanie.md    ← surowe wyniki: 25 odpowiedzi (5 pytań × 5 modeli)
  README.md        ← ten plik
```

---

## Uruchomienie

Nie ma `pip install` — plik korzysta wyłącznie z biblioteki standardowej Pythona
(`urllib` + `json`). Klucze czyta z `../.env.local`, czyli z tego samego pliku,
z którego korzysta aplikacja Next.js.

```bash
cd python-chatbot

python chatbot.py                  # rozmowa
python chatbot.py --lista          # kto jest skonfigurowany
python chatbot.py --modele         # żywa lista modeli prosto z API dostawców
python chatbot.py --demo           # 3 gotowe tury (pod screenshot)
python chatbot.py --dostawca groq  # rozmowa na konkretnym dostawcy

python chatbot.py --zestaw pytania.txt --zapisz porownanie.md   # pełne porównanie
```

W trakcie rozmowy: `/pomoc` `/model` `/modele` `/porownaj` `/reset` `/zapisz` `/koniec`

---

## Dostawcy — 5 modeli, 3 firmy, 4 protokoły

Zadanie wymagało minimum 3 dostawców. Testowane były **3 niezależne firmy**
(Google, Groq, Cohere) i **5 modeli**, wszystkie na **darmowych tierach**.

| Dostawca (`--dostawca`) | Model | Firma | Protokół | Koszt testu |
|---|---|---|---|---|
| `google` | `gemini-3.1-flash-lite` | Google | Gemini API | 🆓 |
| `google-pro` | `gemini-3.1-pro-preview` | Google | Gemini API | 🆓 |
| `groq` | `llama-3.3-70b-versatile` | Groq (model Meta) | dialekt OpenAI | 🆓 |
| `groq-oss` | `openai/gpt-oss-120b` | Groq (model OpenAI) | dialekt OpenAI | 🆓 |
| `cohere` | `command-a-03-2025` | Cohere | Cohere v2 | 🆓 |

W rejestrze czekają jeszcze skonfigurowane, ale nieaktywowane (brak klucza):
Cerebras, OpenRouter, Mistral, OpenAI i Anthropic.

### Dlaczego 9 pozycji w rejestrze obsługuje tylko 4 funkcje

Najważniejsza obserwacja architektoniczna z tego zadania: **większość dostawców nie ma
własnego API — mają cudze**. Groq, Cerebras, OpenRouter, Mistral i OpenAI mówią
dokładnie tym samym protokołem (`POST /chat/completions`), więc obsługuje je jeden
adapter. Osobnego kodu wymagają tylko Google, Anthropic i Cohere.

```
_openai()     → Groq, Groq-OSS, Cerebras, OpenRouter, Mistral, OpenAI   (6 pozycji)
_google()     → Gemini Flash-Lite, Gemini Pro                           (2 pozycje)
_cohere()     → Cohere                                                  (1 pozycja)
_anthropic()  → Claude                                                  (1 pozycja)
```

Praktyczny wniosek: dorzucenie kolejnego dostawcy to najczęściej **jedna linijka**
w słowniku `DOSTAWCY`, a nie nowa integracja.

---

## Metodyka porównania

Pięć pytań, każde celujące w **inną** słabość modelu — bo „które lepiej gada"
nie jest odpowiedzią na nic. Pytania w [pytania.txt](pytania.txt).

| # | Pytanie sprawdza | Dlaczego akurat to |
|---|---|---|
| 1 | wiedzę lokalną i odporność na konfabulację | Rekomendacja S KNF to realny dokument — słaby model wymyśli pewnym tonem progi i daty |
| 2 | dopytywanie o kontekst | persona każe najpierw pytać o budżet/miasto/cel, a nie sypać ogólnikami |
| 3 | liczenie | 120 000 / 650 000 = 18,46% — model liczy czy zgaduje „około 20%"? |
| 4 | granice kompetencji prawnych | persona zakazuje wiążących porad prawnych |
| 5 | trzymanie się roli | pytanie spoza domeny — poprawna reakcja to odmowa |

Warunki identyczne dla wszystkich: ten sam system prompt, `temperature = 0.7`,
budżet 1000 tokenów na odpowiedź, każdy model dostaje pytanie w świeżym kontekście.
Ocena ręczna w skali 0–2 (2 = bez zarzutu, 1 = drobne wady, 0 = błąd merytoryczny
lub złamanie roli).

> ⚠️ **To nie jest benchmark.** Jeden przebieg, 5 pytań, jeden oceniający, temperatura
> 0.7 — czyli wyniki nie są w pełni powtarzalne. To sonda, która ma wystarczyć do
> decyzji „którego modelu użyć w tej aplikacji", i do tego wystarcza, bo różnice
> okazały się bardzo duże. Do twardych wniosków trzeba by kilku przebiegów i drugiego
> oceniającego.

### Pułapka, która o mało nie wypaczyła wyniku

Pierwszy przebieg pokazał, że **Gemini Pro urywa się w połowie zdania** po ~40 tokenach.
Wyglądało to na kompromitację modelu. W rzeczywistości to był mój błąd konfiguracji:

```
usageMetadata: { "candidatesTokenCount": 40, "thoughtsTokenCount": 956 }
finishReason: "MAX_TOKENS"
```

Gemini 3 Pro **wlicza tokeny rozumowania do `maxOutputTokens`**. Przy limicie 1000
zużywał 956 na myślenie i nie zostawało nic na odpowiedź. Modele myślące dostały więc
osobny zapas (`ZAPAS_NA_MYSLENIE = 2500`) i ten sam budżet na samą odpowiedź co reszta.
Kod od tej pory raportuje tokeny myślenia i oznacza ucięte odpowiedzi (`⚠`), żeby taki
błąd nie przeszedł niezauważony drugi raz.

---

## Wyniki

| Model | 1. Wiedza | 2. Kontekst | 3. Liczenie | 4. Prawo | 5. Rola | **Suma** |
|---|:--:|:--:|:--:|:--:|:--:|:--:|
| **Gemini 3.1 Flash-Lite** | 2 | 2 | 2 | 2 | 2 | **10 / 10** |
| **Gemini 3.1 Pro** | 2 | 2 | 1 | 2 | 2 | **9 / 10** |
| **Cohere Command A** | 1 | 2 | 2 | 0 | 1 | **6 / 10** |
| **Llama 3.3 70B** (Groq) | 0 | 1 | 2 | 0 | 0 | **3 / 10** |
| **GPT-OSS 120B** (Groq) | 0 | 0 | 0 | 1 | 2 | **3 / 10** |

Wydajność (średnia z 5 pytań):

| Model | Czas | Tokeny odpowiedzi | Tokeny myślenia |
|---|--:|--:|--:|
| Llama 3.3 70B | **1,3 s** | 314 | — |
| GPT-OSS 120B | 1,7 s | 609 | — |
| Gemini 3.1 Flash-Lite | 1,9 s | 351 | — |
| Cohere Command A | 8,8 s | 286 | — |
| Gemini 3.1 Pro | 13,1 s | 391 | 1181 |

---

## Co konkretnie poszło nie tak

### GPT-OSS 120B — konfabuluje i oznacza to jako pewne

Najgorszy wynik, i to w sposób najbardziej niebezpieczny dla doradcy finansowego.
Persona każe oznaczać pewność (`✓ pewne`, `~ przybliżone`, `? do weryfikacji`) — model
posłusznie oznacza, tyle że **stawia ✓ przy rzeczach zmyślonych**:

- *„programy rządowe (np. **Mieszkanie dla Młodych**, **Rodzina 500+ w wersji
  mieszkaniowej**)"* — MdM zakończono w 2018 r., a „500+ w wersji mieszkaniowej"
  nigdy nie istniało.
- *„gwarancji **Banku Gwarancji Kredytów (BGK)**"* — BGK to Bank Gospodarstwa Krajowego.
- *„niektóre dopuszczają 15% przy dodatkowym ubezpieczeniu **NNW** i/lub polisie
  **CMR**"* — NNW to ubezpieczenie od następstw nieszczęśliwych wypadków, a CMR to
  międzynarodowy list przewozowy w transporcie drogowym. Ani jedno, ani drugie nie ma
  związku z wkładem własnym.
- *„stopy procentowe na poziomie **7-8%** ✓"*, w kolejnym przebiegu *„~5-6%"* —
  ta sama pytanie, dwie różne liczby, obie podane pewnym tonem.

To jest dokładnie ten rodzaj błędu, którego w doradztwie kredytowym nie wolno popełnić:
brzmi kompetentnie, ma strukturę, oznaczenia pewności — i jest nieprawdą.

### Llama 3.3 70B — najszybszy, ale wypada z roli

Jedyny model, który **całkowicie zignorował granice persony**. Na pytanie o stolicę
Australii — zamiast „to nie moja specjalizacja" — dostajemy wykład:

> „Stolicą Australii jest Canberra... miasto zaplanowane, wybrane jako stolica w 1908
> roku, aby rozwiązać spór między Sydney a Melbourne... **Rekomendacja**: Jeśli planujesz
> podróż do Australii, Canberra może być ciekawym miejscem do odwiedzenia."

Doradca kredytowy poleca wycieczkę do Australii. Do tego wymyślił nieistniejący próg
w Rekomendacji S („wkład nie może być niższy niż 10% dla nieruchomości do 500 000 zł"),
błędnie stwierdził, że **wymeldowanie wymaga zgody lokatora albo sądu** (nie wymaga —
wystarczy tryb administracyjny w gminie) i **ani razu** nie użył wymaganych oznaczeń
pewności. Za to liczy poprawnie i jest najszybszy z całej stawki.

### Cohere Command A — poprawny, ale płytki i nieszczelny

Środek stawki. Merytorycznie ostrożny, trzyma strukturę, dobrze liczy. Dwa zgrzyty:
przy pytaniu prawnym stwierdził, że akt notarialny **sam w sobie uprawnia do
wymeldowania** (upraszcza procedurę administracyjną), a przy pytaniu spoza domeny
powiedział „to nie moja specjalizacja" — **i zaraz potem i tak podał odpowiedź**
(„stolica Australii to Canberra"). Odmowa, która nie odmawia, jest gorsza od braku
odmowy, bo wygląda na działające zabezpieczenie.

### Gemini 3.1 Pro — najbardziej precyzyjny, ale nieopłacalny

Jedyny model, który sam z siebie dopisał *„nie udzielam wiążących porad prawnych,
notariusz zrobi to najlepiej"*, i jedyny, który poprawnie nazwał aktualny program
(**Rodzinny Kredyt Mieszkaniowy** z gwarancją BGK). Rozróżnił też meldunek od wydania
lokalu — niuans, który pozostałe modele zlały w jedno.

Zapłata za to jest jednak nieproporcjonalna: **13,1 s** średnio (do 17 s) i **1181
tokenów myślenia** na odpowiedź, przy 1,9 s Flash-Lite. Punkt stracił na pytaniu
o liczenie — policzył 18,46% poprawnie, ale skomentował, że 120 tys. zł „**z dużym
zapasem** spełnia minimalne wymogi" (przy progu 20% brakuje 10 tys.) i zawyżył koszty
transakcyjne do „~5-8%" (realnie 2-4% na rynku wtórnym).

### Gemini 3.1 Flash-Lite — zwycięzca

Komplet punktów. Poprawna wiedza lokalna z właściwymi oznaczeniami pewności, jako jedyny
podał **pełną i prawidłową procedurę wymeldowania** (tryb administracyjny w gminie, akt
notarialny jako dowód, realny czas trwania) i dorzucił praktyczną radę spoza pytania —
zapis w akcie o karze umownej za brak wymeldowania. Przy liczeniu jako jedyny przypomniał
o kosztach okołotransakcyjnych (PCC, taksa notarialna), których nie wlicza się do wkładu.
Czysta odmowa przy pytaniu spoza domeny.

---

## Werdykt

> **Do tej domeny najlepszy jest `gemini-3.1-flash-lite` — czyli model, którego aplikacja
> już używa jako domyślnego.** Jest jednocześnie najdokładniejszy merytorycznie
> i praktycznie najszybszy (1,9 s).

Trzy wnioski, które z tego wynikają dla aplikacji:

1. **Zostawiamy Flash-Lite jako domyślny.** Test nie dał żadnego powodu do zmiany —
   przeciwnie, potwierdził wybór.
2. **Gemini Pro warto ograniczyć do złożonych analiz**, tak jak jest teraz w
   `app/api/chat/route.ts`. Przy typowym pytaniu doradczym płacimy 7× czas i ~1200
   tokenów myślenia za wynik, który nie jest lepszy.
3. **Modele „ogólnie dobre" nie są dobre w tej domenie.** Llama 3.3 i GPT-OSS to mocne
   modele w benchmarkach ogólnych, a tutaj wypadły najgorzej — bo różnicuje nie ogólna
   inteligencja, tylko **znajomość polskich realiów regulacyjnych** i **posłuszeństwo
   wobec instrukcji**. Modele trenowane głównie na angielskim halucynują polskie przepisy
   pewnym tonem, co dla doradcy kredytowego jest najgorszym możliwym trybem awarii.

### Najważniejsza lekcja: oznaczenia pewności to nie zabezpieczenie

System `✓ / ~ / ?` z promptu miał chronić przed konfabulacją. GPT-OSS pokazał, że
**działa on dokładnie tak dobrze, jak dobrze skalibrowany jest model** — słaby model
oznaczy zmyśloną informację jako `✓ pewne` i tym samym uwiarygodni fałsz zamiast go
oznaczyć. Prompt nie naprawi modelu. To argument za tym, żeby fakty regulacyjne
w aplikacji brać z RAG-a (lekcja 06), a nie z pamięci modelu.

---

## Screenshot działającej konwersacji

Trzy tury na dowód działania — z pamięcią kontekstu i pilnowaniem granic roli:

```bash
python chatbot.py --demo
```

Co widać na screenshocie:

1. **Tura 1** — „mam na imię Sebastian, Kraków, budżet 650 tys." → agent wita po imieniu,
   podaje realia krakowskiego rynku dla tej kwoty.
2. **Tura 2** — „mam 120 tys. wkładu, wystarczy?" → agent **pamięta budżet z tury 1**,
   liczy sam z siebie kwotę kredytu 530 tys. zł i wylicza wkład na ~18-19%.
3. **Tura 3** — „jaka jest stolica Australii?" → odmowa („to nie moja specjalizacja")
   **i powrót do wątku z Krakowa** — czyli pamięć działa nawet przy próbie zmiany tematu.

Plik ze screenshotem: `screenshot-rozmowa.png` (w tym katalogu).

---

## Odtworzenie wyników

```bash
python chatbot.py --zestaw pytania.txt --zapisz porownanie.md
```

Surowe odpowiedzi wszystkich modeli z przebiegu opisanego wyżej leżą
w [porownanie.md](porownanie.md) — 25 odpowiedzi z czasami i zużyciem tokenów.
Przy `temperature = 0.7` kolejny przebieg da inne sformułowania; różnice między
modelami okazały się jednak na tyle duże, że utrzymują się między przebiegami
(oba wykonane przebiegi dały ten sam ranking).
