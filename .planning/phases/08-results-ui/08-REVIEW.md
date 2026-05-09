---
phase: 08-results-ui
reviewed: 2026-05-09T00:00:00Z
depth: standard
files_reviewed: 9
files_reviewed_list:
  - src/app/search/SearchResultCard.tsx
  - src/app/search/SearchResults.tsx
  - src/app/search/CameraCapture.tsx
  - src/app/search/SearchResultCard.test.tsx
  - src/app/search/SearchResults.test.tsx
  - src/app/search/CameraCapture.test.tsx
  - src/test/setup.ts
  - tests/phase-08-results-ui.spec.ts
  - tests/phase-07-camera-ui.spec.ts
findings:
  critical: 2
  warning: 5
  info: 3
  total: 10
status: issues_found
---

# Phase 08: Code Review Report

**Reviewed:** 2026-05-09T00:00:00Z
**Depth:** standard
**Files Reviewed:** 9
**Status:** issues_found

## Summary

Reviewed wurden drei React-Komponenten (SearchResultCard, SearchResults, CameraCapture), ihre Unit-Tests und zwei Playwright-E2E-Suiten. Die grundlegende Architektur und State-Machine-Logik sind solide. Zwei kritische Bugs wurden gefunden: ein logischer Fehler in der URL-Parameter-Berechnung und eine Speicherleck-Gefahr beim Previewurl-Cleanup. Fünf Warnungen betreffen Robustheit und korrekte Fehlerbehandlung. Drei Info-Einträge dokumentieren Duplikation und Testlücken.

---

## Critical Issues

### CR-01: `Math.max(50, displayLimit)` — API erhält immer mindestens 50 Ergebnisse, Limit-Parameter ohne Wirkung

**File:** `src/app/search/CameraCapture.tsx:183` und `:218`

**Issue:** Der API-Aufruf verwendet `Math.max(50, displayLimit)` bzw. `Math.max(50, newLimit)` als `limit`-Query-Parameter. Da `displayLimit` initial `10` ist und die erlaubten Optionen 10, 20 und 50 sind, sendet die API-Anfrage für Werte unter 50 immer `limit=50`. Die Intention laut Kommentar ist, lokal zu filtern und von der API einen ausreichend großen Puffer zu erhalten — jedoch ist der hartcodierte Mindestwert von 50 hier korrekt, **aber** er steht im Widerspruch zum Kommentar in `handleSearchWithLimit` (Zeile 207: „D-08: Limit-Wechsel triggert neue API-Anfrage"). Wenn der Nutzer auf `50` wechselt, liefert die API `max(50, 50) = 50`; wenn er auf `20` wechselt, liefert die API ebenfalls `50`. Das heißt, ein Wechsel von `10 → 20` triggert zwar eine neue API-Anfrage (korrekt laut D-08), die Antwort ist aber inhaltlich identisch mit der ersten — die neue Suche ist überflüssig. **Zugleich funktioniert das Limit-Select korrekt für die lokale Anzeige** (`.slice(0, displayLimit)` in SearchResults), weshalb das Feature aus Nutzersicht arbeitet. Der Bug liegt darin, dass bei `newLimit > 50` (z.B. falls die Optionen in Zukunft erweitert werden) die API das falsche Limit bekommt. Gravierender: Der Wert `50` ist eine Magic Number, die still die Absicht einer dynamischen Puffer-Strategie sabotiert. Für den Stand `limit ∈ {10, 20, 50}` ist das Verhalten korrekt, aber fragil.

**Tatsächlicher BLOCKER-Defekt:** In `handleSearch` (Zeile 183) wird `Math.max(50, displayLimit)` verwendet — wenn aber `displayLimit` größer als `50` wäre (erweiterbare Optionen), käme `displayLimit` zum Einsatz; für den aktuellen Wertebereich ist das Verhalten funktional, aber die Logik ist falsch formuliert. Die korrekte Intention ist: „Lade immer alle 50, filtere lokal." Dann sollte es schlicht `limit=50` heißen, ohne `Math.max`. Die aktuelle Formulierung täuscht eine Dynamik vor, die nicht existiert.

**Fix:**
```typescript
// In handleSearch (Zeile 183) und handleSearchWithLimit (Zeile 218):
// Statt: Math.max(50, displayLimit) / Math.max(50, newLimit)
// Klar und explizit:
const API_LIMIT = 50 // Immer den vollen Puffer laden, lokal filtern
`/api/search?threshold=0&limit=${API_LIMIT}`
```

---

### CR-02: Object-URL-Leak bei Thumbnail-Fehler (onError-Handler setzt `thumbnailUrl` auf `null`, aber Object-URLs werden nie revoked)

**File:** `src/app/search/SearchResultCard.tsx:59`

**Issue:** Der `onError`-Handler des `<img>`-Elements setzt `thumbnailUrl` auf `null` (Zeile 59). Wenn `thumbnailUrl` jedoch keine Object-URL (blob:) war, sondern eine externe HTTP-URL (wie `https://example.com/thumb.png` vom Thumbnail-API), entsteht kein Leak — der API gibt immer Remote-URLs zurück (laut Test-Mock in `SearchResultCard.test.tsx:82`). **Jedoch gibt es keine `revoke`-Logik für den Fall, dass `thumbnailUrl` eine `blob:`-URL wäre**, und keinen Cleanup beim Unmounten der Komponente. Sollte die Thumbnail-API jemals eine `blob:`-URL liefern oder sich die Datenstrategie ändern, entsteht ein Object-URL-Leak. Schwerwiegender: Der `useEffect`-Cleanup fehlt vollständig — läuft der Thumbnail-Fetch noch, während die Karte unmounted wird (z.B. durch Threshold-Slider), aktualisiert der `then`-Handler State auf einer bereits unmounted Komponente. In React 18 mit Strict Mode führt das zu einer Warnung; mit laufenden fetch-Promises kann es zu unerwarteten Zustandsänderungen kommen (React 18 batching macht es seltener sichtbar, aber nicht unmöglich).

**Fix:**
```typescript
useEffect(() => {
  let cancelled = false
  fetch(`/api/parts/${id}/thumbnail`)
    .then(r => (r.ok ? r.json() : null))
    .then(data => {
      if (!cancelled && data?.url) setThumbnailUrl(data.url)
    })
    .catch(() => {})
  return () => { cancelled = true }
}, [id])
```

---

## Warnings

### WR-01: `previewUrl` im Cleanup-Effect nicht aktuell (Stale Closure)

**File:** `src/app/search/CameraCapture.tsx:108–117`

**Issue:** Der Cleanup-Effect (Zeile 108–117) hat ein leeres Dependency-Array (`[]`) und referenziert `previewUrl` aus dem Closure. Zum Zeitpunkt des Renderings ist `previewUrl` `null`; beim Unmount ist `previewUrl` möglicherweise gesetzt. Der Effect liest jedoch den Wert zum Erstellungszeitpunkt (`null`), nicht zum Zeitpunkt des Unmounts. Damit wird `URL.revokeObjectURL(previewUrl)` niemals mit einer echten URL aufgerufen. Dies ist ein klassischer Stale-Closure-Bug in React: Der Cleanup gibt `null` zurück statt der tatsächlichen URL. Das `// eslint-disable-next-line react-hooks/exhaustive-deps` kaschiert dieses Problem.

**Fix:** `previewUrl` nicht als Closure im Effect referenzieren — stattdessen einen `ref` verwenden:
```typescript
const previewUrlRef = useRef<string | null>(null)
// Bei setPreviewUrl auch previewUrlRef.current setzen:
// previewUrlRef.current = url
// Im Cleanup-Effect:
if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
```
Alternativ `handleRetry` und `handleCapture` explizit für Revoke verantwortlich machen (was die aktuelle `handleRetry`-Implementierung bereits korrekt tut — aber nur wenn `handleRetry` aufgerufen wird).

---

### WR-02: Doppelte Implementierung von `handleSearch` und `handleSearchWithLimit` — Divergenz-Risiko

**File:** `src/app/search/CameraCapture.tsx:173–233`

**Issue:** `handleSearch` (Zeilen 173–204) und `handleSearchWithLimit` (Zeilen 207–233) sind nahezu identisch — 30 Zeilen duplizierter Code mit eigenem AbortController, Timeout und identischer Fehlerbehandlung. Der einzige Unterschied ist der `limit`-Parameter. Diese Duplikation ist kein reines Stilproblem: Wenn ein Bug in einem der Handlers gefixt wird (z.B. die `Math.max`-Logik aus CR-01), muss er an zwei Stellen gefixt werden. Tatsächlich sind die beiden Implementierungen bereits leicht inkonsistent: `handleSearch` setzt `displayLimit` nicht, `handleSearchWithLimit` hingegen schon (via `onLimitChange` im Aufrufer). Bei einer zukünftigen Änderung der Fehlerbehandlung wird die Duplikation fast sicher zu Inkonsistenz führen.

**Fix:**
```typescript
async function doSearch(limit: number) {
  if (!capturedBlob) return
  setPhase('searching')
  setErrorMessage(null)
  const formData = new FormData()
  formData.append('image', capturedBlob, 'capture.jpg')
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(`/api/search?threshold=0&limit=${limit}`, {
      method: 'POST', body: formData, signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    setSearchResult(await res.json())
    setPhase('result')
  } catch (err) {
    setErrorMessage(
      err instanceof DOMException && err.name === 'AbortError'
        ? 'Suche hat zu lange gedauert. Bitte erneut versuchen.'
        : 'Suche fehlgeschlagen. Bitte überprüfe deine Verbindung und versuche es erneut.'
    )
    setPhase('error')
  } finally {
    clearTimeout(timeoutId)
  }
}
// handleSearch ruft dann: doSearch(50)
// handleSearchWithLimit(newLimit): doSearch(50) (oder Math.max-Logik)
```

---

### WR-03: `part_number` fehlt in `SearchResultCard`-Props bei Test-Rendering

**File:** `src/app/search/SearchResultCard.test.tsx:19`, `:29`, `:37`, `:46`, `:54`, `:63`, `:74`

**Issue:** Die meisten Tests rendern `<SearchResultCard>` ohne den `part_number`-Prop (der Typ ist `string | null`). Das TypeScript-Interface definiert `part_number` als `string | null` — ohne Default — also ist der Prop **required**. Da TypeScript den Prop nicht optional (`part_number?: ...`) deklariert, schlägt TypeScript-Kompilierung fehlt. Die Tests rufen die Komponente ohne `part_number` auf, was einen TypeScript-Typfehler produziert. In Tests mit `vi.fn()` wird das nicht zur Laufzeit sichtbar (JavaScript ist dynamisch typisiert), aber es ist ein Typ-Kontrakt-Bruch, der beim Bauen mit `tsc --strict` fehlschlägt.

**Fix:** Entweder `part_number` in allen Testaufrufen explizit übergeben:
```tsx
<SearchResultCard id="test-id" name="Teil" part_number={null} similarity={0.75} />
```
Oder den Props-Typ anpassen:
```typescript
interface SearchResultCardProps {
  part_number?: string | null  // optional mit undefined als Default
}
```

---

### WR-04: Fehlende Validierung der `similarity`-Werte aus der API

**File:** `src/app/search/SearchResultCard.tsx:31`

**Issue:** `matchPercent = Math.round(similarity * 100)` wird ohne Bereichsprüfung berechnet. Wenn die API einen `similarity`-Wert außerhalb von `[0, 1]` liefert (z.B. `1.05` durch Float-Rundungsfehler in pgvector, oder `-0.02` durch numerische Instabilität), zeigt die Badge einen ungültigen Prozentwert (z.B. `105%` oder `-2%`). Die Farblogik würde ebenfalls falsch reagieren: `similarity >= 0.8` trifft auch für `1.05` zu (grün, korrekt), aber `similarity < 0.6` trifft für `-0.02` zu (rot, korrekt) — die Farbe wäre zufällig noch korrekt, aber `badgeClass` hätte potenziell `bg-red-500` für Werte, die eigentlich ungültig sind.

**Fix:**
```typescript
const clampedSimilarity = Math.max(0, Math.min(1, similarity))
const matchPercent = Math.round(clampedSimilarity * 100)
// badgeClass ebenfalls mit clampedSimilarity berechnen
```

---

### WR-05: `onLimitChange` im `searching`-State ist eine Leerfunction — Nutzerinteraktion ignoriert

**File:** `src/app/search/CameraCapture.tsx:349`

**Issue:** Wenn `phase === 'searching'` und ein `searchResult` bereits vorhanden ist (Re-Suche), wird `SearchResults` mit `onLimitChange={() => {}}` gerendert (Zeile 349). Der Nutzer kann in diesem Zustand den Limit-Select bedienen, erhält aber keinen Fehler und es passiert nichts. Das ist eine stille Fehlfunktion: Die UI reagiert nicht auf eine scheinbar aktive Kontrolle. Besser wäre, die Controls während einer laufenden Suche zu deaktivieren (`disabled`), um falsche Erwartungen zu verhindern.

**Fix:** `SearchResults` sollte einen optionalen `disabled`-Prop für die Controls erhalten, oder die Controls im `searching`-State explizit deaktivieren:
```tsx
// In SearchResults: Slider und Select mit disabled={isSearching}
// In CameraCapture beim Re-Suche-Overlay:
onLimitChange={handleSearchWithLimit}  // nicht die Leerfunction
```
Alternativ: Die gesamte `SearchResults`-Ausgabe im Overlay nicht interaktiv machen (`pointer-events-none` auf dem Overlay-Container statt nur auf dem inneren Div).

---

## Info

### IN-01: `SearchResultItem`-Interface in zwei Dateien dupliziert

**File:** `src/app/search/SearchResults.tsx:17–25` und `src/app/search/CameraCapture.tsx:28–42`

**Issue:** Das `SearchResultItem`/`SearchResponse`-Interface ist in `CameraCapture.tsx` und `SearchResults.tsx` separat definiert. Der Kommentar in `SearchResults.tsx` (Zeile 16: „kein Cross-Import um Zirkel zu vermeiden") erklärt die Absicht, aber die Typen könnten in eine gemeinsame `src/app/search/types.ts` ausgelagert werden, ohne einen Zirkel zu erzeugen — da weder `CameraCapture` noch `SearchResults` voneinander abhängen, würden beide nur von `types.ts` abhängen.

**Fix:** Gemeinsame Typdatei erstellen:
```typescript
// src/app/search/types.ts
export interface SearchResultItem { ... }
export interface SearchResponse { ... }
```

---

### IN-02: `SearchResults.test.tsx` — Test-ID `SEARCH-03` gehört zu `SearchResultCard`

**File:** `src/app/search/SearchResults.test.tsx:124`

**Issue:** Zeile 124 enthält `it('SEARCH-03: Ergebnis-Liste ist nach similarity DESC sortiert...')`. Die Anforderungs-ID `SEARCH-03` bezieht sich laut Phase-8-Dokumentation auf `SearchResultCard` (Einzelkarte), nicht auf `SearchResults` (Controller). Der Test testet jedoch die Reihenfolge in `SearchResults`. Das ist keine falsche Logik, aber eine falsch zugeordnete Anforderungs-ID, die bei Traceability-Checks irreführend ist.

**Fix:** Anforderungs-ID korrigieren: Entweder `SEARCH-04` (wenn die Sortierreihenfolge zur Filteranforderung gehört) oder eine eigene ID `SEARCH-03b` verwenden.

---

### IN-03: `setTimeout` in `SearchResultCard.test.tsx` als Synchronisierungsmechanismus

**File:** `src/app/search/SearchResultCard.test.tsx:101`

**Issue:** Zeile 101 verwendet `await new Promise(r => setTimeout(r, 50))` um auf einen asynchronen Zustand zu warten. Das ist ein anti-pattern in Tests: Ein fester Timeout macht Tests fragiler (auf langsamen CI-Systemen kann 50ms zu kurz sein) und unnötig langsam (auf schnellen Systemen wartet es trotzdem 50ms). `waitFor` von Testing Library wäre korrekt und robust.

**Fix:**
```typescript
// Statt:
await new Promise(r => setTimeout(r, 50))
expect(container.querySelector('img')).toBeNull()

// Besser:
await waitFor(() => {
  expect(container.querySelector('img')).toBeNull()
  expect(container.querySelector('.animate-pulse')).toBeTruthy()
})
```

---

_Reviewed: 2026-05-09T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
