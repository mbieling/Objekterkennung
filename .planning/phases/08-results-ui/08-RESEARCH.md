# Phase 8: Results UI — Research

**Recherchiert:** 2026-05-09
**Domain:** React/Next.js Client-Komponenten, shadcn/ui Slider, lokale State-Filterung
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (aus CONTEXT.md)

### Locked Decisions

- **D-01:** 1 Spalte auf Mobile (375px). Desktop: 1 Spalte bleibt (max-w-md Container zu schmal für 2 Spalten).
- **D-02:** Karteninhalt: Thumbnail + Name + Match-%. Part-Nummer und Projekt kommen in Phase 9 (Part-Detail).
- **D-03:** Karten sind anklickbar — Next.js `<Link href="/parts/[id]">`. Phase 9 erstellt Zielseite; 404 als Placeholder akzeptiert.
- **D-04:** Farbige Badge + Prozentzahl via shadcn `<Badge>`. Schwellwerte: ≥80% grün, 60–79% amber, <60% rot.
- **D-05:** Badge-Position: rechts unten auf der Karte (nach Name-Text, nicht über Thumbnail).
- **D-06:** Threshold-Slider — shadcn Slider installieren. Range 0.0–1.0, Step 0.05. Display-Default 0.5. Wert daneben als "%".
- **D-07:** Client-seitige Filterung — POST /api/search einmalig mit `threshold=0&limit=50`, Slider filtert lokal.
- **D-08:** Limit-Select — shadcn `<Select>`, Optionen: 10/20/50. Default: 10. Limit-Wechsel triggert neue API-Anfrage.
- **D-09:** Controls-Zeile direkt über dem Grid: `[Ähnlichkeit: Slider 50%] [Ergebnisse: Select]`.
- **D-10:** Kein Treffer über Threshold: "Keine ähnlichen Teile gefunden." + Hinweis auf Slider-Anpassung.
- **D-11:** Neue Suche: alte Ergebnisse bleiben sichtbar bis neue Suche abgeschlossen ist (Spinner-Overlay).

### Claude's Discretion

- Thumbnail-Skeleton-Placeholder vs. direktes `<img>` mit `onError`-Fallback: Claude entscheidet (laut UI-SPEC: Skeleton + onError-Fallback — identisch mit CatalogTable.tsx).
- Responsive Grid auf Desktop: 1 Spalte bleibt (max-w-md zu schmal für 2 Spalten — UI-SPEC-Entscheidung).
- Genaue Tailwind-Klassen für Badge-Farben: direkte className statt shadcn-Varianten (laut UI-SPEC).

### Deferred Ideas (OUT OF SCOPE)

- Part-Detail-Seite (Phase 9).
- Erweiterte Metadaten auf Karte (Part-Nummer, Projekt, Status).
- Vergleichsmodus (mehrere Treffer nebeneinander).
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Beschreibung | Research Support |
|----|-------------|------------------|
| SEARCH-03 | System liefert gerankete Treffer mit Match-Prozentwert und Thumbnails | SearchResponse.results (similarity Float 0–1) liegt vor; Thumbnail via GET /api/parts/[id]/thumbnail. Badge-Farbkodierung per cn() + Tailwind. |
| SEARCH-04 | Nutzer kann den Ähnlichkeitsschwellwert konfigurieren | shadcn Slider (installieren), lokale Filterung mit `results.filter(r => r.similarity >= displayThreshold)`. |
| SEARCH-05 | Nutzer kann die Anzahl der angezeigten Treffer konfigurieren | shadcn Select (vorhanden), Limit-Wechsel triggert neue API-Anfrage mit gewähltem Limit. |
</phase_requirements>

---

## Summary

Phase 8 ist eine rein frontend-seitige Phase ohne neue API-Routen oder Datenbankmigrationen. Der `result`-State in `CameraCapture.tsx` zeigt derzeit einen `<pre>`-JSON-Placeholder (Phase-7-D-10). Diese Phase ersetzt diesen Placeholder durch zwei neue Client-Komponenten (`SearchResultCard.tsx` und `SearchResults.tsx`), die aus der vorhandenen `SearchResponse`-State-Variable lesen.

Das Kerntechnologie-Muster ist bereits im Projekt etabliert: Der Thumbnail-Lazy-Load-Flow aus `CatalogTable.tsx` (fetch → JSON → `{ url }` → `<img src>`) wird direkt auf die Trefferkarten übertragen. Die Badge-Farbkodierung via `cn()` und direkten Tailwind-Klassen folgt dem bereits verwendeten `StatusBadge`-Muster aus Phase 5. Der shadcn Slider ist die einzige externe Abhängigkeit, die noch installiert werden muss.

Die wichtigste Architekturentscheidung (D-07) ist die Client-seitige Filterung: Die API wird einmalig mit `threshold=0&limit=50` aufgerufen; der Slider arbeitet danach rein lokal auf dem gecachten `searchResult`. Nur der Limit-Select (D-08) triggert eine neue API-Anfrage, da er bestimmt, wie viele Kandidaten überhaupt geladen werden.

**Primäre Empfehlung:** Extrahiere die neue UI in zwei dedizierte Dateien (`SearchResults.tsx` als Controller + `SearchResultCard.tsx` als Darstellungskomponente). `CameraCapture.tsx` importiert `SearchResults` im `result`-State-Block und übergibt `searchResult`, `displayThreshold`, `displayLimit` sowie die entsprechenden Setter als Props. So bleibt die State-Machine in `CameraCapture.tsx` unverändert.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Ergebnis-Rendering (Grid, Karten) | Browser / Client | — | Rein UI-seitige Darstellung des gecachten API-Response |
| Threshold-Filterung | Browser / Client | — | Lokale Array-Filterung auf bestehendem State (D-07) |
| Limit-gesteuerte API-Anfrage | Browser / Client | API / Backend | Client initiiert, bestehende POST /api/search verarbeitet |
| Thumbnail-Loading | Browser / Client | API / Backend | Client fetcht GET /api/parts/[id]/thumbnail per part-ID |
| Navigation zu Part-Detail | Browser / Client | — | Next.js Link-Komponente; Zielseite kommt Phase 9 |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| shadcn/ui Slider | aktuell (via CLI) | Threshold-Regler | Projekt-Konvention: shadcn first; Radix-Primitive, zugänglich | [VERIFIED: UI-SPEC + components.json] |
| shadcn/ui Badge | installiert | Match-% Anzeige | Bereits im Projekt vorhanden (CatalogTable.tsx) | [VERIFIED: src/components/ui/badge.tsx] |
| shadcn/ui Card | installiert | Trefferkarten-Wrapper | Bereits im Projekt vorhanden (CameraCapture.tsx) | [VERIFIED: src/components/ui/card.tsx] |
| shadcn/ui Select | installiert | Limit-Dropdown | Bereits im Projekt vorhanden (CatalogTable.tsx) | [VERIFIED: src/components/ui/select.tsx] |
| shadcn/ui Skeleton | installiert | Thumbnail-Placeholder | Bereits im Projekt vorhanden (CameraCapture.tsx) | [VERIFIED: src/components/ui/skeleton.tsx] |
| Next.js Link | Next.js 16 built-in | Karten-Navigation | App Router Standard | [VERIFIED: Codebase] |
| cn() aus @/lib/utils | vorhanden | Bedingte Tailwind-Klassen (Badge-Farben) | Bereits im gesamten Projekt verwendet | [VERIFIED: Codebase] |
| lucide-react | vorhanden | Icons (RotateCcw, Loader2) | Bereits in CameraCapture.tsx importiert | [VERIFIED: CameraCapture.tsx] |

### Installation (einmalig)

```bash
npx shadcn@latest add slider --yes
```

Slider ist der einzige fehlende Block. Alle anderen Komponenten sind installiert. [VERIFIED: `ls src/components/ui/` — slider.tsx nicht vorhanden]

---

## Architecture Patterns

### System Architecture Diagram

```
Nutzer-Interaktion
       |
       v
CameraCapture.tsx (phase=result)
  |  searchResult: SearchResponse   <-- gecacht von POST /api/search (threshold=0, limit=50)
  |  displayThreshold: number       <-- Slider-Wert (lokal)
  |  displayLimit: number           <-- Select-Wert (steuert neue API-Anfragen)
  |
  +---> SearchResults.tsx
          |
          |-- Controls-Zeile
          |     |-- <Slider> (displayThreshold, onValueChange)
          |     +-- <Select> (displayLimit, onChange → neue API-Anfrage)
          |
          |-- Gefilterte Liste
          |     searchResult.results
          |       .filter(r => r.similarity >= displayThreshold)
          |       .slice(0, displayLimit)
          |
          +---> SearchResultCard.tsx (pro Treffer)
                  |-- <Link href="/parts/{id}">
                  |-- <Card>
                  |     |-- Thumbnail (fetch /api/parts/{id}/thumbnail → url)
                  |     |-- Name (truncate)
                  |     +-- Match-%-Badge (farbkodiert via cn())
                  +--
```

### Recommended Project Structure

```
src/app/search/
├── CameraCapture.tsx        # bestehend — result-State erweitern (displayThreshold, displayLimit)
├── SearchResults.tsx        # NEU — Controller mit Controls-Zeile + gefiltertem Grid
├── SearchResultCard.tsx     # NEU — Einzelkarte (Thumbnail + Name + Badge)
├── CameraCapture.test.tsx   # erweitern — SEARCH-03/04/05 Tests
└── page.tsx                 # unverändert — Server Component Wrapper
```

### Pattern 1: Thumbnail-Lazy-Load in Karten

Bewährtes Muster aus `CatalogTable.tsx`, adaptiert für Einzelkarten:

```typescript
// Source: src/app/admin/CatalogTable.tsx (Zeilen 186-203) — verifiziert
function SearchResultCard({ id, name, similarity }: { id: string; name: string; similarity: number }) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [thumbError, setThumbError] = useState(false)

  useEffect(() => {
    fetch(`/api/parts/${id}/thumbnail`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data?.url) setThumbnailUrl(data.url) })
      .catch(() => setThumbError(true))
  }, [id])

  const matchPercent = Math.round(similarity * 100)
  const badgeClass = similarity >= 0.8
    ? 'bg-green-500 text-white hover:bg-green-500'
    : similarity >= 0.6
    ? 'bg-amber-500 text-white hover:bg-amber-500'
    : 'bg-red-500 text-white hover:bg-red-500'

  return (
    <Link
      href={`/parts/${id}`}
      className="block"
      aria-label={`Bauteil ${name} anzeigen, Ähnlichkeit ${matchPercent}%`}
    >
      <Card className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex gap-3 p-3">
          <div className="relative w-16 h-16 shrink-0 rounded-md overflow-hidden bg-muted">
            {thumbnailUrl && !thumbError ? (
              <img
                src={thumbnailUrl}
                alt={`${name} Thumbnail`}
                className="w-full h-full object-cover"
                onError={() => setThumbError(true)}
              />
            ) : (
              <Skeleton className="w-full h-full" />
            )}
          </div>
          <div className="flex flex-col justify-between flex-1 min-w-0 py-0.5">
            <p className="text-sm font-medium leading-tight truncate">{name}</p>
            <div className="flex justify-end">
              <Badge className={badgeClass}>{matchPercent}%</Badge>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  )
}
```
[VERIFIED: Codebase — CatalogTable.tsx Thumbnail-Pattern identisch]

### Pattern 2: handleSearch-Erweiterung in CameraCapture.tsx

Die bestehende `handleSearch`-Funktion muss den API-Call mit `threshold=0` und `limit=Math.max(50, displayLimit)` aufrufen:

```typescript
// Erweiterung in CameraCapture.tsx handleSearch (D-07, D-08)
// threshold=0 damit alle Kandidaten geholt werden; lokale Filterung per Slider
const res = await fetch(
  `/api/search?threshold=0&limit=${Math.max(50, displayLimit)}`,
  { method: 'POST', body: formData, signal: controller.signal }
)
```
[VERIFIED: Codebase — POST /api/search akzeptiert threshold + limit als Query-Params (route.ts Zeilen 34-47)]

### Pattern 3: Slider (shadcn/ui)

```typescript
// Source: shadcn/ui Slider Dokumentation [ASSUMED — noch nicht via Context7 verifiziert]
// Standard shadcn Slider API (Radix-Primitive)
<Slider
  min={0}
  max={1}
  step={0.05}
  value={[displayThreshold]}
  onValueChange={([val]) => setDisplayThreshold(val)}
  aria-label="Ähnlichkeitsschwellwert"
  aria-valuetext={`${Math.round(displayThreshold * 100)}%`}
  className="w-32"
/>
```

### Pattern 4: Spinner-Overlay bei Re-Suche (D-11)

```typescript
// result-State mit searching-Overlay (D-11)
{phase === 'result' && (
  <div className="flex flex-col gap-4">
    <div className="relative">
      {phase_is_searching && (
        <div className="absolute inset-0 bg-background/70 flex items-center justify-center rounded-lg z-10">
          <Loader2 className="animate-spin h-8 w-8" aria-label="Neue Suche läuft" />
        </div>
      )}
      <SearchResults ... />
    </div>
    <Button variant="outline" onClick={handleRetry}>
      <RotateCcw className="mr-2 h-4 w-4" />
      Neu aufnehmen
    </Button>
  </div>
)}
```

Hinweis: Da die State-Machine in CameraCapture.tsx `phase` bei neuer Suche auf `'searching'` setzt, müssen die alten Ergebnisse im `phase === 'searching'`-Block sichtbar bleiben — oder die Logik muss angepasst werden (Overlay über dem result-State statt State-Wechsel). Laut D-11 bleibt das Grid sichtbar bis zur neuen Antwort.

**Konkrete Umsetzung:** Im `result`-Block auf `searchResult !== null` prüfen. Im `searching`-Block prüfen ob `searchResult !== null` — wenn ja, Grid mit Overlay zeigen statt nur Spinner. Dies ist eine leichte Erweiterung der bestehenden State-Machine ohne neuen State-Typ.

### Anti-Patterns to Avoid

- **N+1 Thumbnail-Fetches beim Mount:** Alle Karten werden gleichzeitig gerendert und fetchen parallel ihre Thumbnails. Das ist kein N+1-Problem im Backend-Sinn (kein DB-Loop), aber bei 50 Karten entstehen 50 parallele Requests. Absicht und akzeptabel für Phase 8 (max 50 Ergebnisse, Presigned-URL-Cache). Keine Batch-API nötig.
- **Slider-Wert als Dezimal im UI anzeigen:** Immer `Math.round(val * 100)` anzeigen, nie den Float direkt.
- **Limit-Select als rein lokaler Filter:** Limit-Änderung triggert neue API-Anfrage (D-08), nicht nur lokales Slice. Das verhindert, dass Nutzer bei Default-Limit=10 auf 50 wechselt und plötzlich mehr Treffer sieht, die nie geladen wurden.
- **Content-Type-Header bei POST /api/search setzen:** Kein `Content-Type`-Header im fetch-Call (Browser setzt Boundary automatisch für multipart/form-data). Bereits in CameraCapture.tsx korrekt umgesetzt — in der Erweiterung beibehalten.

---

## Don't Hand-Roll

| Problem | Nicht selbst bauen | Stattdessen verwenden | Warum |
|---------|-------------------|----------------------|-------|
| Range-Slider | Eigener `<input type="range">` mit Styling | shadcn/ui Slider (Radix Primitive) | Accessibility (ARIA), Keyboard-Navigation, Focus-Ring — alles fertig |
| Dropdown-Auswahl | Eigenes Select-Element | shadcn/ui Select | Konsistenz mit CatalogTable.tsx; bereits im Projekt |
| Farb-Badge | Eigene Badge-Komponente | shadcn/ui Badge mit cn() | Bereits installiert; konsistent mit Admin-Katalog |
| Lazy Image Loading | IntersectionObserver | Direktes fetch im useEffect (wie CatalogTable.tsx) | Corpus ist klein (max 50 Karten); Overhead nicht nötig |
| Navigations-Link | `<a href>` | Next.js `<Link>` | Client-seitiges Routing, Prefetching, kein Full-Page-Reload |

---

## Common Pitfalls

### Pitfall 1: Thumbnail-URL-Expiry (60 Sekunden)

**Was geht schief:** Die Presigned-URL von `GET /api/parts/[id]/thumbnail` läuft nach 60 Sekunden ab. Wenn ein Nutzer lange auf der Result-Seite bleibt und dann auf ein Thumbnail klickt oder es erneut lädt, schlägt die URL fehl.
**Warum es passiert:** `getSignedUrl` in `thumbnail/route.ts` setzt `expiresIn: 60`.
**Wie vermeiden:** Für Phase 8 akzeptabel — die Ergebnisse werden direkt nach der Suche angezeigt, die URL ist innerhalb der 60s gültig. Kein Caching der URL im State nötig. Phase 10 (Hardening) kann dies ggf. erhöhen.
**Warnsignal:** Thumbnail zeigt Broken-Image-Icon nach langer Seiten-Verweildauer.

### Pitfall 2: State-Machine-Konflikt beim Spinner-Overlay (D-11)

**Was geht schief:** Beim Klick auf "Neu aufnehmen" während im `result`-State wechselt die State-Machine zu `idle`. Der `searching`-State zeigt normalerweise keinen result-Grid. Wenn der Nutzer eine zweite Suche aus dem `captured`-State startet, wechselt Phase zu `searching` — und das Grid verschwindet.
**Warum es passiert:** Der aktuelle `searching`-Block in CameraCapture.tsx rendert nur einen Spinner (kein Grid).
**Wie vermeiden:** Im `searching`-Block prüfen ob `searchResult !== null`. Wenn ja: Grid mit Overlay anzeigen (Phase-7-D-11-Semantik). Nur bei erster Suche (searchResult === null) wird der reine Spinner angezeigt. [VERIFIED: CameraCapture.tsx Zeilen 300-305]

### Pitfall 3: Similarity-Float aus Neon als String

**Was geht schief:** Neon gibt berechnete Float-Ausdrücke (`1 - (embedding <=> ...)`) manchmal als Decimal-String zurück statt als JS-Number.
**Warum es passiert:** Neon PostgreSQL serialisiert `NUMERIC`-ähnliche berechnete Spalten als String.
**Wie vermeiden:** Die API-Route (`route.ts` Zeile 153) hat bereits `parseFloat(String(row.similarity))` — der Client empfängt korrekte JS-Numbers. Kein zusätzlicher Fix nötig. [VERIFIED: src/app/api/search/route.ts Zeile 153]

### Pitfall 4: Thumbnail-Endless-Loop (wie CatalogTable.tsx)

**Was geht schief:** Wenn `thumbnailUrl` im useEffect-Deps-Array steht, triggert jedes State-Update einen neuen Fetch.
**Warum es passiert:** `setThumbnailUrl` löst Re-Render aus → Effect läuft erneut → Endlosschleife.
**Wie vermeiden:** Thumbnail-URL nur einmalig pro `id` fetchen. Deps-Array: `[id]` — kein `thumbnailUrl`. Entspricht dem kommentiertem Muster in CatalogTable.tsx (Zeile 202). [VERIFIED: CatalogTable.tsx Zeilen 186-203]

### Pitfall 5: Phase-7-E2E-Test bricht nach Phase 8

**Was geht schief:** `tests/phase-07-camera-ui.spec.ts` prüft auf `page.locator('pre')` (JSON-Placeholder). Phase 8 entfernt dieses `<pre>`-Element.
**Warum es passiert:** Der D-10-Test aus Phase 7 erwartet explizit das JSON im `<pre>`-Block.
**Wie vermeiden:** Den Phase-7-E2E-Test anpassen — statt `locator('pre')` auf die neue Results-UI prüfen (z.B. Match-%-Badge, Karten-Text). Dies ist ein expliziter Task in den Planungswellen. [VERIFIED: tests/phase-07-camera-ui.spec.ts Zeilen 45-46, 113-115]

---

## Code Examples

### Controls-Zeile (D-09, UI-SPEC)

```typescript
// Source: 08-UI-SPEC.md — verifiziert
<div className="flex flex-row items-center gap-4 flex-wrap">
  {/* Threshold-Slider */}
  <div className="flex items-center gap-2">
    <span className="text-sm text-muted-foreground">Ähnlichkeit</span>
    <Slider
      min={0} max={1} step={0.05}
      value={[displayThreshold]}
      onValueChange={([val]) => setDisplayThreshold(val)}
      aria-label="Ähnlichkeitsschwellwert"
      aria-valuetext={`${Math.round(displayThreshold * 100)}%`}
      className="w-32"
    />
    <span className="text-sm font-medium w-10 text-right">
      {Math.round(displayThreshold * 100)}%
    </span>
  </div>
  {/* Limit-Select */}
  <div className="flex items-center gap-2">
    <span className="text-sm text-muted-foreground">Ergebnisse</span>
    <Select
      value={String(displayLimit)}
      onValueChange={(val) => {
        const newLimit = Number(val)
        setDisplayLimit(newLimit)
        // Neue API-Anfrage mit neuem Limit (D-08)
        handleSearchWithLimit(newLimit)
      }}
    >
      <SelectTrigger className="w-20">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="10">10</SelectItem>
        <SelectItem value="20">20</SelectItem>
        <SelectItem value="50">50</SelectItem>
      </SelectContent>
    </Select>
  </div>
</div>
```

### Leer-Zustand (D-10)

```typescript
// Source: 08-CONTEXT.md D-10 + 08-UI-SPEC.md Copywriting Contract
{filteredResults.length === 0 && (
  <div role="status" className="text-center py-8">
    <p className="font-medium">Keine ähnlichen Teile gefunden.</p>
    <p className="text-sm text-muted-foreground mt-1">
      Versuche den Ähnlichkeitsschwellwert zu verringern.
    </p>
  </div>
)}
```

### aria-live für Screen-Reader (UI-SPEC)

```typescript
// Source: 08-UI-SPEC.md Accessibility-Sektion
<div
  aria-live="polite"
  className="flex flex-col gap-3"
>
  {filteredResults.map(r => <SearchResultCard key={r.id} {...r} />)}
</div>
```

---

## State of the Art

| Alter Ansatz | Aktueller Ansatz | Wann geändert | Impact |
|--------------|-----------------|---------------|--------|
| `<pre>`-JSON-Placeholder | SearchResults-Komponente mit farbkodiertem Grid | Phase 8 (jetzt) | Kernfunktionalität SEARCH-03/04/05 wird implementiert |

**Deprecated nach Phase 8:**
- `<pre>` JSON-Block in `CameraCapture.tsx` (Zeilen 310-312): wird durch `<SearchResults>` ersetzt.
- Phase-7-E2E-Test Assertions auf `locator('pre')`: müssen auf neue UI umgestellt werden.

---

## Assumptions Log

| # | Claim | Section | Risk bei falschem Claim |
|---|-------|---------|------------------------|
| A1 | shadcn/ui Slider API: `value={[number]}`, `onValueChange={([val]) => ...}` (Array-Interface wie Radix Slider) | Code Examples, Pattern 3 | Falsche Props-Signatur → Runtime-Error beim Slider; Fix: nach Installation `slider.tsx` lesen |
| A2 | Limit-Wechsel auf 20 lädt `limit=Math.max(50, 20)=50` via neue API-Anfrage (D-07 + D-08 kombiniert) | Architecture Patterns | Falls Limit-Select rein lokal filtert, sehen Nutzer bei 10-Result-Cache mit Limit=20 nur max. 10 Treffer; richtige Interpretation laut CONTEXT.md D-08 ist neue API-Anfrage |

**Wenn A1 falsch ist:** Nach `npx shadcn@latest add slider --yes` die erzeugte `slider.tsx` lesen und Props-Interface prüfen.

---

## Open Questions

1. **Spinner-Overlay vs. State-Machine-Erweiterung (D-11)**
   - Was wir wissen: `searching`-State rendert aktuell nur Spinner (kein Grid). `result`-State zeigt den Grid.
   - Was unklar ist: Bei zweiter Suche wechselt Phase zu `searching` — Grid verschwindet sofort. D-11 will Grid sichtbar lassen.
   - Empfehlung: Im `searching`-Block testen ob `searchResult !== null`. Wenn ja: Grid + Overlay statt purer Spinner. Neuer State-Typ nicht nötig.

2. **Phase-7-E2E-Test-Anpassung**
   - Was wir wissen: `phase-07-camera-ui.spec.ts` prüft auf `locator('pre')` (Zeilen 45, 113).
   - Was unklar ist: Soll der Phase-7-Test umgeschrieben oder als separate Aufgabe in Phase 8 behandelt werden?
   - Empfehlung: In Phase 8 Wave 0 als Test-Stub-Aufgabe aufnehmen — Phase-7-Assertions auf neue UI umstellen.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js + npm | shadcn Slider Installation | verfügbar (Projekt läuft) | — | — |
| shadcn/ui Slider | D-06 Threshold-Slider | nicht installiert | — | kein Fallback (Pflicht) |
| Next.js Link | D-03 Karten-Navigation | verfügbar | Next.js 16 | — |
| GET /api/parts/[id]/thumbnail | D-02 Thumbnail | verfügbar | — | Skeleton permanent sichtbar |
| POST /api/search | D-07/08 Suche | verfügbar | — | — |

**Fehlende Abhängigkeiten ohne Fallback:**
- `slider.tsx` — muss via `npx shadcn@latest add slider --yes` in Wave 0 installiert werden (BLOCKING für Slider-Implementierung)

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 + @testing-library/react 16.3.2 |
| Config file | vitest.config.ts (Projektwurzel) |
| Quick run command | `npm test -- --reporter=verbose src/app/search/CameraCapture.test.tsx` |
| Full suite command | `npm test` |
| E2E Framework | Playwright 1.58.2 |
| E2E run command | `npm run test:e2e -- tests/phase-08-results-ui.spec.ts` |

### Phase Requirements → Test Map

| Req ID | Verhalten | Test-Typ | Automatisierter Befehl | Datei vorhanden? |
|--------|----------|----------|----------------------|-----------------|
| SEARCH-03 | Treffer-Grid mit Thumbnail + Name + Match-% nach erfolgreicher Suche | unit | `npm test -- CameraCapture.test.tsx` | teilweise (erweitern) |
| SEARCH-03 | Badge-Farbe korrekt (grün ≥80%, amber 60–79%, rot <60%) | unit | `npm test -- SearchResultCard.test.tsx` | nein — Wave 0 |
| SEARCH-04 | Slider filtert Ergebnisse lokal (threshold 0.5 → nur Treffer ≥50%) | unit | `npm test -- SearchResults.test.tsx` | nein — Wave 0 |
| SEARCH-05 | Limit-Select-Wechsel triggert neue API-Anfrage | unit | `npm test -- SearchResults.test.tsx` | nein — Wave 0 |
| SEARCH-03 | Ergebnis-Grid sichtbar nach File-Upload-Suche (E2E) | e2e | `npm run test:e2e -- phase-08-results-ui.spec.ts` | nein — Wave 0 |
| SEARCH-04 | Slider-Interaktion im Browser filtert Treffer (E2E) | e2e | `npm run test:e2e -- phase-08-results-ui.spec.ts` | nein — Wave 0 |

### Sampling Rate

- **Pro Task-Commit:** `npm test -- --reporter=verbose src/app/search/`
- **Pro Wave-Merge:** `npm test && npm run test:e2e`
- **Phase Gate:** Full Suite grün vor `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/app/search/SearchResultCard.test.tsx` — SEARCH-03 Badge-Farben, Thumbnail-Skeleton
- [ ] `src/app/search/SearchResults.test.tsx` — SEARCH-04 Slider-Filterung, SEARCH-05 Limit-Select
- [ ] `tests/phase-08-results-ui.spec.ts` — E2E Smoke-Tests (Grid sichtbar, Slider, Limit)
- [ ] `tests/phase-07-camera-ui.spec.ts` anpassen — `locator('pre')` durch neue UI-Selektoren ersetzen (Breaking Change durch Phase 8)
- [ ] Slider installieren: `npx shadcn@latest add slider --yes`

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Anwendbar | Standard-Control |
|---------------|----------|-----------------|
| V5 Input Validation | ja (minimal) | `part.id` via UUID-Format; Link-Ziel ist statisch `/parts/${id}` |
| V2 Authentication | nein | Keine Auth-Logik in dieser Phase |
| V3 Session Management | nein | Kein neuer State, der Sessions betrifft |
| V4 Access Control | nein | Nur GET /thumbnail (existierend, bereits gesichert) |
| V6 Cryptography | nein | Keine Kryptographie-Operationen |

### Known Threat Patterns

| Pattern | STRIDE | Standard-Mitigation |
|---------|--------|---------------------|
| Open Redirect via part.id in Link | Tampering | UUIDs aus API-Response sind vom Server validiert; `/parts/${id}` — kein User-Input direkt im Pfad. [VERIFIED: API-Response kommt von validierter DB-Abfrage] |
| XSS via part.name in Karte | Tampering | React escapet JSX automatisch; kein `dangerouslySetInnerHTML` |

---

## Projektspezifische Constraints (aus CLAUDE.md)

| Direktive | Impact auf Phase 8 |
|-----------|-------------------|
| `shadcn/ui first` — NIEMALS eigene Versionen installierter Komponenten erstellen | Slider via CLI installieren, kein eigener Range-Input |
| Keine `NEXT_PUBLIC_`-Variablen für Server-Secrets | Nicht relevant — Phase 8 hat keine neuen Env-Vars |
| `use client` + useState für interaktive Komponenten | SearchResults.tsx + SearchResultCard.tsx sind Client Components |
| UUID-Validierung auf alle API-Route-Params | Nicht relevant — Phase 8 hat keine neuen API-Routen |
| `cn()` aus `@/lib/utils` für bedingte Tailwind-Klassen | Badge-Farben via cn() implementieren |
| Unit-Tests co-located neben Source-Dateien | SearchResultCard.test.tsx neben SearchResultCard.tsx |
| E2E-Tests in `tests/` | phase-08-results-ui.spec.ts |

---

## Sources

### Primary (HIGH confidence)

- `src/app/search/CameraCapture.tsx` — State-Machine, SearchResponse-Interface, handleSearch-Funktion [VERIFIED]
- `src/app/admin/CatalogTable.tsx` — Thumbnail-Lazy-Load-Pattern, StatusBadge-Muster [VERIFIED]
- `src/app/api/search/route.ts` — API-Signatur (threshold, limit als Query-Params), Response-Shape [VERIFIED]
- `src/app/api/parts/[id]/thumbnail/route.ts` — Thumbnail-Endpoint, Presigned-URL 60s [VERIFIED]
- `.planning/phases/08-results-ui/08-CONTEXT.md` — Alle Entscheidungen D-01 bis D-11 [VERIFIED]
- `.planning/phases/08-results-ui/08-UI-SPEC.md` — Komponenten-Anatomie, Spacing, Farben, Copywriting [VERIFIED]
- `src/components/ui/` — Installierte Komponenten (badge, card, skeleton, select, slider fehlt) [VERIFIED]
- `tests/phase-07-camera-ui.spec.ts` — Breaking-Change-Assertions die in Phase 8 angepasst werden müssen [VERIFIED]

### Tertiary (LOW confidence)

- shadcn/ui Slider Props-Interface (value=Array, onValueChange) [ASSUMED — A1]

---

## Metadata

**Confidence-Aufschlüsselung:**
- Standard Stack: HIGH — alle Komponenten im Codebase verifiziert; nur Slider-Installation noch ausstehend
- Architecture: HIGH — Muster direkt aus bestehendem Code abgeleitet (CatalogTable.tsx, CameraCapture.tsx)
- Pitfalls: HIGH — aus bestehendem Code verifiziert (Similarity-Float-Parsing, Thumbnail-Loop, E2E-Breaking-Change)
- Slider Props: LOW — Training-Knowledge, Verifikation nach Installation empfohlen

**Research date:** 2026-05-09
**Valid until:** 2026-06-09 (shadcn-Komponenten stabil; Next.js 16 stabil)
