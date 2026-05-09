---
phase: 05-admin-catalog
reviewed: 2026-05-09T00:00:00Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - src/app/admin/CatalogTable.tsx
  - src/app/admin/page.tsx
  - src/app/api/parts/[id]/archive/route.ts
  - src/app/api/parts/[id]/archive/route.test.ts
  - src/app/api/parts/[id]/retry/route.ts
  - src/app/api/parts/[id]/retry/route.test.ts
  - src/app/api/parts/[id]/route.ts
  - src/app/api/parts/[id]/route.test.ts
  - src/app/api/parts/route.ts
  - src/app/api/parts/route.test.ts
  - src/app/layout.tsx
  - tests/admin-catalog.spec.ts
findings:
  critical: 4
  warning: 6
  info: 4
  total: 14
status: issues_found
---

# Phase 05: Code Review Report

**Reviewed:** 2026-05-09
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

Die Phase-5-Implementierung umfasst die Admin-Katalog-Seite mit Tabellen-Ansicht, Tabs, Suche, Pagination, Edit-Sheet und CRUD-Aktionen sowie die dazugehörigen API-Routen. Die Gesamtstruktur ist solide; Zod-Validierung und parametrisierte Queries sind konsequent eingesetzt. Es wurden jedoch vier kritische Probleme gefunden: fehlende Authentifizierung auf allen API-Routen (die Admin-Seite ist offen erreichbar), ein inkonsistenter Datenstand nach dem Retry-Fehlerfall der zu einer falschen Status-Anzeige im UI führt, ein PATCH-Logikfehler der explizit übergebene `null`-Werte ignoriert, und Thumbnail-URLs die ohne Validierung direkt als `src`-Attribut gerendert werden. Mehrere Warnings betreffen unkontrollierten State, fehlende Fehlerbehandlung an kritischen Stellen sowie ein Memory Leak durch nicht aufgeräumten Debounce-Timer.

---

## Critical Issues

### CR-01: Keine Authentifizierung auf allen API-Routen

**File:** `src/app/api/parts/route.ts:8`, `src/app/api/parts/[id]/route.ts:24`, `src/app/api/parts/[id]/archive/route.ts:13`, `src/app/api/parts/[id]/retry/route.ts:14`
**Issue:** Keine der vier Admin-API-Routen prüft, ob der aufrufende User authentifiziert und autorisiert ist. Jeder, der die URL kennt, kann alle Teile auflisten (GET /api/parts), Metadaten ändern (PATCH), Teile löschen (DELETE), archivieren (POST /archive) oder Retry auslösen (POST /retry) — ohne Session. Das Backend-Rule-Dokument schreibt vor: "Always check authentication: verify user session exists." Laut Security-Rules muss auf jede API-Route ein Auth-Check vor der Verarbeitung.
**Fix:**
```typescript
// Beispiel für GET /api/parts (analoges Muster für alle anderen Routen):
import { createClient } from '@/lib/supabase-server' // Server-Client

export async function GET(): Promise<NextResponse> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // ggf. zusätzlich Rolle prüfen, z. B. session.user.role === 'admin'
  const rows = await db`...`
  return NextResponse.json({ parts: rows })
}
```

---

### CR-02: Inkonsistenter UI-State nach Retry + Worker-Fehler (falscher Optimistic-Rollback fehlt)

**File:** `src/app/api/parts/[id]/retry/route.ts:42-62`, `src/app/admin/CatalogTable.tsx:337-350`
**Issue:** Die Retry-Route schreibt `status = 'pending'` in die DB, bevor der Worker aufgerufen wird (gewolltes Design, Assumption A4). Schlägt danach der Worker-Call fehl, gibt die Route 502 zurück — aber der DB-Status ist jetzt bereits `pending`. Im Frontend (`handleRetry`, CatalogTable.tsx:337) wird bei einem Fehler-Response des Fetch-Calls auf den Originalstatus `failed` zurückgerollt. Das Frontend-State und der DB-State divergieren damit dauerhaft: DB zeigt `pending`, UI zeigt `failed`. Ein späterer Page-Reload würde `pending` anzeigen, der Retry-Button fehlt dann aber, weil er nur bei `failed` eingeblendet wird (Zeile 526). Das Bauteil hängt in einem nicht wiederherstellbaren State, aus dem heraus kein erneuter Retry möglich ist.
**Fix:** Zwei Optionen:
1. (Einfach) Den Optimistic-Rollback im Frontend bei 502 nicht durchführen — stattdessen den tatsächlichen DB-State nach 502 anzeigen (`pending`) und dem Nutzer mitteilen, dass der Worker nicht erreichbar war:
```typescript
// CatalogTable.tsx handleRetry
const handleRetry = async (id: string) => {
  const original = parts.find(p => p.id === id)
  if (!original) return
  setParts(prev =>
    prev.map(p => (p.id === id ? { ...p, status: 'pending' } : p))
  )
  try {
    const res = await fetch(`/api/parts/${id}/retry`, { method: 'POST' })
    if (!res.ok) {
      // Kein Rollback zu 'failed' — DB ist bereits 'pending'
      toast.error('Worker nicht erreichbar. Status ist jetzt "Ausstehend".')
    }
  } catch {
    toast.error('Netzwerkfehler. Bitte Seite neu laden.')
  }
}
```
2. (Besser) Die Retry-Route soll den DB-Status nur dann auf `pending` setzen, wenn der Worker-Call erfolgreich war; andernfalls auf `failed` zurückrollen.

---

### CR-03: PATCH ignoriert explizit übergebene `null`-Werte (COALESCE-Bug)

**File:** `src/app/api/parts/[id]/route.ts:61-70`
**Issue:** Das SQL-Update verwendet `COALESCE(value, column)`. Wenn ein Client explizit `{ "part_number": null }` sendet, um das Feld zu leeren, führt das PatchSchema diesen Wert als `null` durch. In der Query steht dann `COALESCE(NULL, part_number)` — was den alten Wert beibehält, anstatt ihn zu löschen. Ein Leersetzen von `part_number` oder `project` ist über die PATCH-Route damit unmöglich. Dieser Bug ist besonders relevant, weil das Edit-Sheet im Frontend leere Strings als `null` sendet (`values.part_number || null`, Zeile 289).
**Fix:**
```typescript
// Statt COALESCE: Felder nur dann in SET aufnehmen, wenn sie im Body vorhanden sind.
// Einfachste korrekte Lösung: separate Abfragen oder conditional UPDATE mit Zod-Strip:

// Option A — explizite Fallunterscheidung:
const setParts = []
if (name !== undefined) setParts.push(db`name = ${name}`)
if (part_number !== undefined) setParts.push(db`part_number = ${part_number}`)
if (project !== undefined) setParts.push(db`project = ${project}`)
if (status !== undefined) setParts.push(db`status = ${status}`)
// ... dann SET-Teile zusammenbauen
```
Alternativ: Den PATCH-Endpunkt so umstellen, dass er einen vollständigen Datensatz erwartet (PUT-Semantik), womit COALESCE nicht mehr nötig ist — was dem tatsächlichen Aufrufmuster des Frontends (alle Felder werden immer mitgesendet) entspricht.

---

### CR-04: Thumbnail-URLs werden ungefiltert als `src` eingebunden (Open-Redirect / XSS-Risiko)

**File:** `src/app/admin/CatalogTable.tsx:461-467`, `src/app/admin/CatalogTable.tsx:607-614`
**Issue:** Die Thumbnail-URL wird vom `/api/parts/[id]/thumbnail`-Endpunkt bezogen und ohne jede Validierung direkt als `src`-Attribut des `<img>`-Tags gesetzt (`thumbnailUrls[part.id]`). Falls der Thumbnail-Endpunkt eine vom User kontrollierbare URL zurückliefert (z. B. aus einem unvalidierten DB-Feld), kann ein Angreifer eine externe URL oder ein `javascript:`-Schema injizieren. Im Kontext eines Admin-Panels ist das besonders kritisch.
**Fix:**
```typescript
// Vor dem Setzen der URL validieren, dass sie vom erwarteten S3/Storage-Host stammt:
.then(data => {
  if (data?.url && isAllowedThumbnailUrl(data.url)) {
    setThumbnailUrls(prev => ({ ...prev, [part.id]: data.url }))
  }
})

function isAllowedThumbnailUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    const allowedHosts = [
      process.env.NEXT_PUBLIC_S3_HOSTNAME,       // z. B. 'your-bucket.s3.amazonaws.com'
      process.env.NEXT_PUBLIC_SUPABASE_URL,       // Supabase Storage
    ].filter(Boolean)
    return allowedHosts.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h))
  } catch {
    return false
  }
}
```

---

## Warnings

### WR-01: Kein Error-Handling bei DB-Fehlern in GET /api/parts

**File:** `src/app/api/parts/route.ts:9-13`
**Issue:** Der `db`-Aufruf ist nicht in einem try/catch gewrapped. Schlägt die DB-Verbindung fehl, wirft Neon eine unbehandelte Exception, die Next.js als 500 ohne strukturierten Fehler-Body zurückgibt. Das Frontend (CatalogTable.tsx:180) hat keinen spezifischen Handler für 5xx — `res.json()` schlägt dann ebenfalls fehl und führt zu einem unbehandelten Promise-Rejection (da `.catch()` dort nur generisch reagiert).
**Fix:**
```typescript
export async function GET(): Promise<NextResponse> {
  try {
    const rows = await db`SELECT ... FROM parts ORDER BY created_at DESC`
    return NextResponse.json({ parts: rows })
  } catch (err) {
    console.error('[GET /api/parts] DB error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
```
Gleiches Muster fehlt in den anderen Routen (`archive/route.ts`, `retry/route.ts`, `[id]/route.ts`).

---

### WR-02: Debounce-Timer wird beim Unmount nicht aufgeräumt (Memory Leak)

**File:** `src/app/admin/CatalogTable.tsx:166`, `src/app/admin/CatalogTable.tsx:243-249`
**Issue:** `debounceRef.current` wird in `handleSearchInput` gesetzt, aber es gibt kein `useEffect`-Cleanup, das den Timer beim Unmount der Komponente löscht. Wird die Komponente unmountet während ein Debounce-Timer läuft (z. B. schnelle Navigation), versucht der Timer setState auf einer nicht mehr gemounteten Komponente aufzurufen — in React 18 kein Hard-Crash, aber ein potenzieller Stale-Closure-Bug und eine React-Warning.
**Fix:**
```typescript
useEffect(() => {
  return () => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
  }
}, [])
```

---

### WR-03: Pagination bricht bei Tab-Wechsel nicht korrekt zurück, wenn currentPage > totalPages

**File:** `src/app/admin/CatalogTable.tsx:238-241`, `src/app/admin/CatalogTable.tsx:220-224`
**Issue:** `handleTabChange` setzt `currentPage` auf 1 zurück — das ist korrekt. Die Suche (`handleSearchInput`) setzt ebenfalls auf 1 zurück. Jedoch: Wenn ein User auf Seite 3 ist und dann einen Suchbegriff eingibt, der nur 5 Ergebnisse liefert (1 Seite), wird `currentPage` korrekt auf 1 gesetzt. Wird der Begriff aber wieder gelöscht, springt `currentPage` **nicht** zurück — das ist korrekt. Das Problem liegt woanders: `paginatedParts` (Zeile 221) berechnet `(currentPage - 1) * ROWS_PER_PAGE` und liefert ggf. ein leeres Array, wenn `currentPage` durch einen direkten `setCurrentPage(page)`-Click in der Pagination (Zeile 567) auf einen Wert gesetzt wird, der bei einem später angewendeten Filter nicht mehr existiert. Die Tabelle zeigt dann **keine Zeilen** obwohl `filteredParts.length > 0` ist — ein unsichtbarer Edge-Case.
**Fix:**
```typescript
// currentPage korrigieren falls sie nach Filteränderung außerhalb des gültigen Bereichs liegt:
const safePage = Math.min(currentPage, totalPages)
const paginatedParts = filteredParts.slice(
  (safePage - 1) * ROWS_PER_PAGE,
  safePage * ROWS_PER_PAGE
)
```

---

### WR-04: `handleArchive` schließt das Edit-Sheet nicht, wenn ein Teil gerade im Sheet archiviert wird

**File:** `src/app/admin/CatalogTable.tsx:306-319`
**Issue:** `handleArchive` wird über das Dropdown ausgelöst. Falls das Edit-Sheet gleichzeitig für dasselbe Teil geöffnet ist (was möglich ist: Dropdown ist unabhängig vom Sheet-State), ändert sich der Status des Teils zu `archived`. Das Formular im Sheet zeigt dann weiterhin den alten Status (`pending`/`ready`/etc.) und erlaubt ein Speichern mit diesem alten Status, was den `archived`-Status überschreiben würde. Die PATCH-Route lässt `status: 'archived'` zwar nicht zu, aber sie lässt `status: 'ready'` zu — und das würde das Archivieren rückgängig machen, ohne dass der User es merkt.
**Fix:**
```typescript
const handleArchive = async (id: string) => {
  const original = parts.find(p => p.id === id)
  if (!original) return
  // Sheet schließen, falls das zu archivierende Teil gerade bearbeitet wird
  if (editPart?.id === id) {
    setSheetOpen(false)
    setEditPart(null)
  }
  // ... restliche Logik
}
```

---

### WR-05: `handleDeleteConfirm` schließt das Edit-Sheet nicht bei geöffnetem Sheet

**File:** `src/app/admin/CatalogTable.tsx:321-335`
**Issue:** Analoges Problem zu WR-04: Wenn `deleteTarget` das aktuell im Sheet bearbeitete Teil ist, wird das Sheet nach dem Löschen nicht geschlossen. `editPart` zeigt noch auf ein gelöschtes Objekt. Alle Aktionen im Sheet (Speichern) würden dann Fetch-Calls auf ein nicht mehr existierendes Teil auslösen, die mit 404 scheitern.
**Fix:**
```typescript
const handleDeleteConfirm = async () => {
  if (!deleteTarget) return
  const { id } = deleteTarget
  if (editPart?.id === id) {
    setSheetOpen(false)
    setEditPart(null)
  }
  // ... restliche Logik
}
```

---

### WR-06: Fehlende Fehlerbehandlung für nicht-JSON-Responses des Thumbnail-Endpunkts

**File:** `src/app/admin/CatalogTable.tsx:190-198`
**Issue:** Die Thumbnail-Fetch-Logik prüft `r.ok` und gibt bei Fehler `null` zurück — das ist korrekt. Jedoch: Falls `r.ok` true ist, aber der Body kein gültiges JSON ist (z. B. leererer Body, HTML-Fehlerseite durch CDN), wirft `r.json()` eine Exception. Diese wird vom äußeren `.catch()` abgefangen, aber da `setThumbnailUrls` nicht aufgerufen wird, bleibt der Skeleton für dieses Teil permanent sichtbar — ohne jede Rückmeldung an den User. Für ein Admin-UI mit Debug-Kontext wäre ein Logging sinnvoll.
**Fix:**
```typescript
.then(r => (r.ok ? r.json().catch(() => null) : null))
```

---

## Info

### IN-01: `lang="en"` im Root-Layout für ein deutschsprachiges Produkt

**File:** `src/app/layout.tsx:17`
**Issue:** Das `<html>`-Tag hat `lang="en"`, obwohl die komplette UI auf Deutsch ist. Das ist für Screenreader, Suchmaschinen und Browser-Rechtschreibprüfung falsch.
**Fix:**
```html
<html lang="de">
```

---

### IN-02: Seitenname im Root-Layout noch Template-Platzhalter

**File:** `src/app/layout.tsx:6-8`
**Issue:** `title: "AI Coding Starter Kit"` und `description: "Built with AI Agent Team System"` sind noch die Template-Defaults, nicht der Projektname "Bauteil-Finder".
**Fix:**
```typescript
export const metadata: Metadata = {
  title: 'Bauteil-Finder',
  description: 'STEP-Dateien hochladen und geometrisch ähnliche Bauteile finden.',
}
```

---

### IN-03: Suche durchsucht `project`-Feld nicht

**File:** `src/app/admin/CatalogTable.tsx:209-215`
**Issue:** Die Suchfilterung prüft nur `name` und `part_number`. Das `project`-Feld wird nicht durchsucht, obwohl es in der Tabelle angezeigt wird und ein naheliegendes Suchkriterium für Ingenieure ist.
**Fix:**
```typescript
return (
  p.name.toLowerCase().includes(q) ||
  (p.part_number ?? '').toLowerCase().includes(q) ||
  (p.project ?? '').toLowerCase().includes(q)
)
```

---

### IN-04: E2E-Test ADMIN-01 (Suchfeld-Test) ist immer grün — Assertion ohne echten Prüfwert

**File:** `tests/admin-catalog.spec.ts:51-53`
**Issue:** Der Suchfeld-Test endet mit `|| true`, was bedeutet: Die letzte Bedingung macht die gesamte `eitherVisible`-Variable immer `true`. Der Test kann damit niemals fehlschlagen, selbst wenn das Suchfeld funktionslos ist. Er gibt ein falsches Sicherheitsgefühl.
**Fix:** Bedingung `|| true` entfernen und stattdessen einen konkreten Assert formulieren:
```typescript
// Wenn die Suche keine Ergebnisse liefert, muss einer der zwei Zustände sichtbar sein:
await expect(emptyState.or(noPartsState)).toBeVisible()
```

---

_Reviewed: 2026-05-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
