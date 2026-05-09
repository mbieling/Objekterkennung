# Phase 8: Results UI — Pattern Map

**Mapped:** 2026-05-09
**Files analyzed:** 6
**Analogs found:** 5 / 6 (slider.tsx: kein Analog — muss installiert werden)

---

## File Classification

| Neue / Geänderte Datei | Rolle | Data Flow | Nächster Analog | Match-Qualität |
|------------------------|-------|-----------|-----------------|----------------|
| `src/app/search/SearchResultCard.tsx` | component | request-response | `src/app/admin/CatalogTable.tsx` | exact (Thumbnail + Badge pattern) |
| `src/app/search/SearchResults.tsx` | component | request-response | `src/app/search/CameraCapture.tsx` | role-match (Client Component, useState, cn()) |
| `src/app/search/CameraCapture.tsx` | component (modify) | request-response | — | Selbst-Referenz: State-Machine erweitern |
| `src/app/search/SearchResultCard.test.tsx` | test | — | `src/app/search/CameraCapture.test.tsx` | exact (Vitest + RTL, fetch-Mock, waitFor) |
| `tests/phase-08-results-ui.spec.ts` | test (e2e) | — | `tests/phase-07-camera-ui.spec.ts` | exact (Playwright, page.route Mock, locator-Pattern) |
| `tests/phase-07-camera-ui.spec.ts` | test (e2e, modify) | — | — | Selbst-Referenz: locator('pre') ersetzen |
| `src/components/ui/slider.tsx` | ui-primitive | — | keiner vorhanden | kein Analog — via CLI installieren |

---

## Pattern Assignments

### `src/app/search/SearchResultCard.tsx` (component, request-response)

**Analog:** `src/app/admin/CatalogTable.tsx`

**Imports-Pattern** (Zeilen 1–12):
```typescript
'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
```

**Thumbnail-Lazy-Load-Pattern** (CatalogTable.tsx Zeilen 186–203):
```typescript
// thumbnailUrls aus Deps entfernen um Endlosschleife zu vermeiden
// eslint-disable-next-line react-hooks/exhaustive-deps

// Einzelkarten-Variante (pro id — nicht Batch):
const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)

useEffect(() => {
  fetch(`/api/parts/${id}/thumbnail`)
    .then(r => (r.ok ? r.json() : null))
    .then(data => {
      if (data?.url) setThumbnailUrl(data.url)
    })
    .catch(() => {
      // Kein Fehler-Toast — Skeleton bleibt sichtbar
    })
}, [id])  // ACHTUNG: nur [id] im Deps-Array, nicht thumbnailUrl → kein Endlosloop
```

**Badge-Farbkodierung via cn()** (Analog: CatalogTable.tsx Zeilen 104–133, StatusBadge):
```typescript
// CatalogTable.tsx Zeile 104–133 zeigt direktes className-Override-Muster:
// <Badge className="text-green-700 bg-green-50 border-green-200 hover:bg-green-50">

// Phase 8: semantische Match-%-Variante (D-04):
const matchPercent = Math.round(similarity * 100)
const badgeClass = cn(
  similarity >= 0.8
    ? 'bg-green-500 text-white hover:bg-green-500'
    : similarity >= 0.6
    ? 'bg-amber-500 text-white hover:bg-amber-500'
    : 'bg-red-500 text-white hover:bg-red-500'
)
// hover:bg-* Override nötig — shadcn Badge-Default hat eigenen Hover-State
```

**Karten-JSX-Struktur** (Analog aus 08-RESEARCH.md Pattern 1, verifiziert gegen CatalogTable.tsx):
```typescript
return (
  <Link
    href={`/parts/${id}`}
    className="block"
    aria-label={`Bauteil ${name} anzeigen, Ähnlichkeit ${matchPercent}%`}
  >
    <Card className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
      <div className="flex gap-3 p-3">
        {/* Thumbnail-Bereich: 64×64px quadratisch */}
        <div className="relative w-16 h-16 shrink-0 rounded-md overflow-hidden bg-muted">
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt={`${name} Thumbnail`}
              className="w-full h-full object-cover"
              onError={() => setThumbnailUrl(null)}
            />
          ) : (
            <Skeleton className="w-full h-full" />
          )}
        </div>
        {/* Text-Bereich */}
        <div className="flex flex-col justify-between flex-1 min-w-0 py-0.5">
          <p className="text-sm font-medium leading-tight truncate">{name}</p>
          {/* Badge rechts unten (D-05) */}
          <div className="flex justify-end">
            <Badge className={badgeClass}>{matchPercent}%</Badge>
          </div>
        </div>
      </div>
    </Card>
  </Link>
)
```

---

### `src/app/search/SearchResults.tsx` (component, request-response)

**Analog:** `src/app/search/CameraCapture.tsx`

**Imports-Pattern** (CameraCapture.tsx Zeilen 1–12):
```typescript
'use client'

import { useState } from 'react'
import { Slider } from '@/components/ui/slider'  // nach Installation
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SearchResultCard } from './SearchResultCard'
```

**Select-Verwendungs-Pattern** (CatalogTable.tsx Zeilen 690–709):
```typescript
// shadcn Select mit controlled value + onValueChange:
<Select onValueChange={field.onChange} value={field.value}>
  <FormControl>
    <SelectTrigger>
      <SelectValue />
    </SelectTrigger>
  </FormControl>
  <SelectContent>
    <SelectItem value="pending">Ausstehend</SelectItem>
    <SelectItem value="processing">Wird verarbeitet</SelectItem>
    <SelectItem value="ready">Bereit</SelectItem>
    <SelectItem value="failed">Fehlgeschlagen</SelectItem>
  </SelectContent>
</Select>

// Phase 8 Limit-Select (ohne FormControl, da kein react-hook-form):
<Select
  value={String(displayLimit)}
  onValueChange={(val) => {
    const newLimit = Number(val)
    setDisplayLimit(newLimit)
    onLimitChange(newLimit)  // neue API-Anfrage triggern (D-08)
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
```

**Leer-Zustand-Pattern** (Analog: CatalogTable.tsx Zeilen 428–440):
```typescript
// CatalogTable.tsx:
) : filteredParts.length === 0 ? (
  <p className="text-center py-8 text-muted-foreground">
    Keine Teile gefunden
  </p>
) : (

// Phase 8 (D-10, mit Slider-Hinweis):
{filteredResults.length === 0 && (
  <div role="status" className="text-center py-8">
    <p className="font-medium">Keine ähnlichen Teile gefunden.</p>
    <p className="text-sm text-muted-foreground mt-1">
      Versuche den Ähnlichkeitsschwellwert zu verringern.
    </p>
  </div>
)}
```

**Client-seitige Filterung** (D-07, lokale Array-Filterung wie CatalogTable.tsx Zeilen 207–224):
```typescript
// CatalogTable.tsx Muster (Tab + Suche composable):
const filteredParts = parts
  .filter(p => (activeTab === 'all' ? true : p.status === activeTab))
  .filter(p => { ... })

// Phase 8 (Threshold + Limit):
const filteredResults = searchResult.results
  .filter(r => r.similarity >= displayThreshold)
  .slice(0, displayLimit)
// API liefert bereits sortiert nach similarity DESC — kein zusätzliches .sort() nötig
```

**aria-live-Pattern** (CameraCapture.tsx Zeile 301):
```typescript
// CameraCapture.tsx: aria-live="polite" auf searching-State
<div className="flex flex-col items-center gap-4 py-8" aria-live="polite">

// Phase 8 auf Ergebnis-Container:
<div aria-live="polite" className="flex flex-col gap-3">
  {filteredResults.map(r => (
    <SearchResultCard key={r.id} {...r} />
  ))}
</div>
```

---

### `src/app/search/CameraCapture.tsx` (MODIFY — State-Machine erweitern)

**Selbst-Referenz.** Geänderte Stellen:

**Neue State-Variablen** (nach Zeile 81 einfügen):
```typescript
// Phase 8: Threshold + Limit für SearchResults (D-06, D-08)
const [displayThreshold, setDisplayThreshold] = useState<number>(0.5)
const [displayLimit, setDisplayLimit] = useState<number>(10)
```

**handleSearch-Erweiterung** (Zeile 179 ersetzen — D-07):
```typescript
// VORHER (Zeile 179):
const res = await fetch('/api/search', {
  method: 'POST',
  body: formData,
  signal: controller.signal,
})

// NACHHER (threshold=0, limit=Math.max(50, displayLimit)):
const res = await fetch(
  `/api/search?threshold=0&limit=${Math.max(50, displayLimit)}`,
  {
    method: 'POST',
    body: formData,
    // KEIN Content-Type-Header — Browser setzt Boundary automatisch
    signal: controller.signal,
  }
)
```

**result-State ersetzen** (Zeilen 307–328 ersetzen — D-10 Placeholder raus):
```typescript
// VORHER (Zeilen 307–328): <pre>-JSON-Placeholder

// NACHHER:
{phase === 'result' && searchResult && (
  <div className="flex flex-col gap-4">
    <SearchResults
      searchResult={searchResult}
      displayThreshold={displayThreshold}
      displayLimit={displayLimit}
      onThresholdChange={setDisplayThreshold}
      onLimitChange={(newLimit) => {
        setDisplayLimit(newLimit)
        // neue API-Anfrage mit neuem Limit (D-08)
        handleSearchWithLimit(newLimit)
      }}
    />
    <Button variant="outline" className="w-full" onClick={handleRetry}>
      <RotateCcw className="mr-2 h-4 w-4" />
      Neu aufnehmen
    </Button>
  </div>
)}
```

**searching-State für D-11 (Spinner-Overlay bei Re-Suche)** (Zeilen 299–305 ersetzen):
```typescript
// VORHER: reiner Spinner

// NACHHER: Grid + Overlay wenn bereits Ergebnisse vorhanden (D-11):
{phase === 'searching' && (
  searchResult ? (
    // Re-Suche: Grid bleibt sichtbar, Spinner-Overlay darüber
    <div className="flex flex-col gap-4">
      <div className="relative">
        <div className="absolute inset-0 bg-background/70 flex items-center justify-center rounded-lg z-10">
          <Loader2 className="animate-spin h-8 w-8" aria-label="Neue Suche läuft" />
        </div>
        <SearchResults
          searchResult={searchResult}
          displayThreshold={displayThreshold}
          displayLimit={displayLimit}
          onThresholdChange={setDisplayThreshold}
          onLimitChange={() => {}}  // während Suche deaktiviert
        />
      </div>
    </div>
  ) : (
    // Erste Suche: reiner Spinner
    <div className="flex flex-col items-center gap-4 py-8" aria-live="polite">
      <Loader2 className="animate-spin h-8 w-8" aria-label="Suche läuft" />
      <p className="text-sm text-muted-foreground">Suche läuft...</p>
    </div>
  )
)}
```

---

### `src/app/search/SearchResultCard.test.tsx` (NEW unit test)

**Analog:** `src/app/search/CameraCapture.test.tsx`

**Test-Datei-Struktur** (CameraCapture.test.tsx Zeilen 1–67):
```typescript
// src/app/search/SearchResultCard.test.tsx
// Phase 8 — Unit Tests für SearchResultCard (SEARCH-03)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SearchResultCard } from './SearchResultCard'

// fetch-Mock für /api/parts/[id]/thumbnail
global.fetch = vi.fn()

describe('Phase 8: SearchResultCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('SEARCH-03: zeigt Skeleton während Thumbnail lädt', () => { ... })
  it('SEARCH-03: Badge grün (bg-green-500) bei similarity >= 0.80', async () => { ... })
  it('SEARCH-03: Badge amber (bg-amber-500) bei similarity 0.60–0.79', async () => { ... })
  it('SEARCH-03: Badge rot (bg-red-500) bei similarity < 0.60', async () => { ... })
  it('SEARCH-03: Link href="/parts/{id}" korrekt gesetzt', () => { ... })
  it('SEARCH-03: Name wird mit truncate dargestellt', () => { ... })
})
```

**fetch-Mock-Pattern für Thumbnail** (CameraCapture.test.tsx Zeilen 49, 135):
```typescript
// fetch pending hält Skeleton sichtbar:
vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))

// fetch mit Thumbnail-URL:
vi.mocked(global.fetch).mockResolvedValue({
  ok: true,
  json: async () => ({ url: 'https://example.com/thumb.png' }),
} as Response)
```

---

### `tests/phase-08-results-ui.spec.ts` (NEW e2e test)

**Analog:** `tests/phase-07-camera-ui.spec.ts`

**E2E-Datei-Struktur** (phase-07-camera-ui.spec.ts Zeilen 1–47):
```typescript
// tests/phase-08-results-ui.spec.ts
// E2E-Tests für Phase 8 Results UI (SEARCH-03, SEARCH-04, SEARCH-05)

import { test, expect } from '@playwright/test'

// Mock-Ergebnis-Fixture mit 3 Treffern verschiedener Similarity-Werte
const mockSearchResponse = {
  results: [
    { id: 'id-01', name: 'Flanschplatte', part_number: 'FP-001', project: null,
      status: 'ready', similarity: 0.92, created_at: '2026-01-01T00:00:00Z' },
    { id: 'id-02', name: 'Schraubenring', part_number: null, project: 'Motor',
      status: 'ready', similarity: 0.67, created_at: '2026-01-01T00:00:00Z' },
    { id: 'id-03', name: 'Dichtungsring', part_number: 'DR-42', project: null,
      status: 'ready', similarity: 0.45, created_at: '2026-01-01T00:00:00Z' },
  ],
  query: { threshold: 0, limit: 50, results_count: 3 },
}

test.describe('Phase 8: Results UI', () => {
  // Route-Mock als Helper (Muster aus phase-07):
  async function setupSearchMock(page) {
    await page.route('/api/search', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSearchResponse),
      })
    })
    // Thumbnail-Requests auch mocken (sonst 404):
    await page.route('/api/parts/*/thumbnail', async route => {
      await route.fulfill({ status: 404 })
    })
  }

  // Datei-Upload-Helper (identisch mit phase-07):
  async function uploadAndSearch(page) {
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'test-part.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-jpeg-data'),
    })
    await page.getByText('Suchen').click()
  }

  test('SEARCH-03: Ergebnis-Grid sichtbar nach Suche', async ({ page }) => { ... })
  test('SEARCH-03: Badge-Farben korrekt (grün/amber/rot)', async ({ page }) => { ... })
  test('SEARCH-04: Slider-Filterung reduziert angezeigte Karten', async ({ page }) => { ... })
  test('SEARCH-05: Limit-Select-Wechsel triggert neue Suche', async ({ page }) => { ... })
  test('D-10: Leer-Zustand bei hohem Threshold', async ({ page }) => { ... })
  test('D-11: Spinner-Overlay bei Re-Suche, Grid bleibt sichtbar', async ({ page }) => { ... })
})
```

---

### `tests/phase-07-camera-ui.spec.ts` (MODIFY — Breaking Change)

**Analog:** Selbst-Referenz. Zwei Assertions brechen durch Phase 8.

**Zu ändernde Stellen:**

**Zeilen 44–46** (Test "SEARCH-02: Datei-Upload via File-Input"):
```typescript
// VORHER:
await expect(page.locator('pre')).toBeVisible({ timeout: 10_000 })
await expect(page.locator('pre')).toContainText('results_count')

// NACHHER (neue UI): Trefferkarten oder Leer-Zustand prüfen
await expect(page.getByText('Keine ähnlichen Teile gefunden.')).toBeVisible({ timeout: 10_000 })
// ODER bei Treffern:
// await expect(page.locator('[aria-live="polite"]')).toBeVisible({ timeout: 10_000 })
```

**Zeilen 113–115** (Test "D-10: JSON-Ergebnis in pre-Block"):
```typescript
// VORHER:
await expect(page.locator('pre')).toBeVisible({ timeout: 10_000 })
await expect(page.locator('pre')).toContainText('Testbauteil')
await expect(page.locator('pre')).toContainText('"similarity": 0.87')

// NACHHER: Name in Karte sichtbar, Badge mit 87%:
await expect(page.getByText('Testbauteil')).toBeVisible({ timeout: 10_000 })
await expect(page.getByText('87%')).toBeVisible()
// Test-Name umbenennen: "D-10: Ergebnis-Grid nach erfolgreicher Suche"
```

---

### `src/components/ui/slider.tsx` (NEW — via shadcn CLI)

**Kein Analog vorhanden.** `slider.tsx` fehlt in `src/components/ui/` (verifiziert via `ls`).

**Installation:**
```bash
npx shadcn@latest add slider --yes
```

**Nach Installation verifizieren** (Assumption A1 aus RESEARCH.md):
```typescript
// Erwartete Props-Signatur (shadcn Radix Slider):
<Slider
  min={0}
  max={1}
  step={0.05}
  value={[displayThreshold]}           // Array-Interface
  onValueChange={([val]) => setDisplayThreshold(val)}  // Array-Destructuring
  aria-label="Ähnlichkeitsschwellwert"
  aria-valuetext={`${Math.round(displayThreshold * 100)}%`}
  className="w-32"
/>
```

---

## Shared Patterns

### `'use client'` + useState (Client Components)

**Quelle:** `src/app/search/CameraCapture.tsx` Zeile 1, `src/app/admin/CatalogTable.tsx` Zeile 1
**Gilt für:** `SearchResultCard.tsx`, `SearchResults.tsx`
```typescript
'use client'

import { useState, useEffect } from 'react'
```

### `cn()` für bedingte Tailwind-Klassen

**Quelle:** `src/app/admin/CatalogTable.tsx` Zeile 13 (via StatusBadge), `src/components/ui/badge.tsx` Zeile 7
**Gilt für:** `SearchResultCard.tsx` (Badge-Farben), `SearchResults.tsx`
```typescript
import { cn } from '@/lib/utils'

// Badge-Farb-Pattern (direkte className, nicht shadcn-Varianten — UI-SPEC-Entscheidung):
const badgeClass = cn(
  similarity >= 0.8 ? 'bg-green-500 text-white hover:bg-green-500'
  : similarity >= 0.6 ? 'bg-amber-500 text-white hover:bg-amber-500'
  : 'bg-red-500 text-white hover:bg-red-500'
)
```

### Thumbnail-Lazy-Load (useEffect, deps=[id], kein Endlosloop)

**Quelle:** `src/app/admin/CatalogTable.tsx` Zeilen 186–203
**Gilt für:** `SearchResultCard.tsx`
```typescript
useEffect(() => {
  fetch(`/api/parts/${id}/thumbnail`)
    .then(r => (r.ok ? r.json() : null))
    .then(data => { if (data?.url) setThumbnailUrl(data.url) })
    .catch(() => { /* Skeleton bleibt sichtbar */ })
}, [id])  // NUR [id] — thumbnailUrls NICHT im Deps-Array
// eslint-disable-next-line react-hooks/exhaustive-deps  ← NICHT nötig, [id] ist korrekt
```

### fetch ohne Content-Type-Header (multipart/form-data)

**Quelle:** `src/app/search/CameraCapture.tsx` Zeilen 178–183
**Gilt für:** Alle POST /api/search-Aufrufe in `CameraCapture.tsx`
```typescript
const res = await fetch(`/api/search?threshold=0&limit=${Math.max(50, displayLimit)}`, {
  method: 'POST',
  body: formData,
  // KEIN Content-Type-Header — Browser setzt multipart Boundary automatisch
  signal: controller.signal,
})
```

### AbortController-Timeout (30s)

**Quelle:** `src/app/search/CameraCapture.tsx` Zeilen 175–196
**Gilt für:** `CameraCapture.tsx` handleSearch-Erweiterung (Timeout beibehalten)
```typescript
const controller = new AbortController()
const timeoutId = setTimeout(() => controller.abort(), 30_000)
try {
  // fetch ...
} catch (err) {
  const msg = err instanceof DOMException && err.name === 'AbortError'
    ? 'Suche hat zu lange gedauert. Bitte erneut versuchen.'
    : 'Suche fehlgeschlagen. Bitte überprüfe deine Verbindung und versuche es erneut.'
  // ...
} finally {
  clearTimeout(timeoutId)
}
```

### Vitest + RTL Test-Boilerplate

**Quelle:** `src/app/search/CameraCapture.test.tsx` Zeilen 1–67
**Gilt für:** `SearchResultCard.test.tsx`, `SearchResults.test.tsx`
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

global.fetch = vi.fn()
global.URL.createObjectURL = vi.fn().mockReturnValue('blob:fake-url')
global.URL.revokeObjectURL = vi.fn()

describe('Phase 8: ComponentName', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })
  // ...
})
```

### Playwright Route-Mock + File-Upload-Helper

**Quelle:** `tests/phase-07-camera-ui.spec.ts` Zeilen 21–47
**Gilt für:** `tests/phase-08-results-ui.spec.ts`
```typescript
await page.route('/api/search', async route => {
  await route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(mockSearchResponse),
  })
})

const fileInput = page.locator('input[type="file"]')
await fileInput.setInputFiles({
  name: 'test-part.jpg',
  mimeType: 'image/jpeg',
  buffer: Buffer.from('fake-jpeg-data'),
})
await page.getByText('Suchen').click()
```

---

## Kein Analog vorhanden

| Datei | Rolle | Data Flow | Grund |
|-------|-------|-----------|-------|
| `src/components/ui/slider.tsx` | ui-primitive | — | shadcn Slider fehlt im Projekt; via `npx shadcn@latest add slider --yes` installieren. Nach Installation Props-Interface in der erzeugten Datei prüfen (A1 aus RESEARCH.md) |

---

## Metadata

**Analog-Suchbereich:** `src/app/search/`, `src/app/admin/`, `src/components/ui/`, `tests/`
**Gescannte Dateien:** 7 Quelldateien + Testdateien
**Pattern-Extraktionsdatum:** 2026-05-09
