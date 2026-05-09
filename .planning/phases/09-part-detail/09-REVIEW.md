---
phase: 9
status: issues_found
critical: 1
warnings: 3
info: 3
reviewed_at: 2026-05-09
depth: standard
files_reviewed: 8
files_reviewed_list:
  - src/app/api/parts/[id]/route.ts
  - src/app/api/parts/[id]/thumbnails/route.ts
  - src/app/api/parts/[id]/download/route.ts
  - src/app/parts/[id]/page.tsx
  - src/app/parts/[id]/PartDetail.tsx
  - src/hooks/usePartDetail.ts
  - src/app/parts/[id]/PartDetail.test.tsx
  - src/hooks/usePartDetail.test.ts
---

# Phase 9 — Code Review: Part Detail

**Reviewed:** 2026-05-09
**Depth:** standard
**Files Reviewed:** 8
**Status:** issues_found

## Summary

Phase 9 implementiert drei neue API-Endpunkte (`GET /api/parts/[id]`, `/thumbnails`, `/download`), eine Server-Component-Wrapper-Seite, eine Client-Component mit Custom-Hook sowie Vitest-Tests. Die UUID-Validierung ist in allen drei neuen API-Handlern korrekt als erste Operation implementiert. Keine `NEXT_PUBLIC_`-Prefixes auf Server-Secrets. Das Presigned-URL-Pattern folgt dem etablierten Muster aus `thumbnail/route.ts`.

Ein kritisches Problem wurde gefunden: Der Download-Handler setzt den `filename`-Wert in `Content-Disposition` innerhalb von doppelten Anführungszeichen, ohne dass nach RFC 5987 Zeilenumbrüche (`\r`, `\n`) und weitere Steuerzeichen aus dem Dateinamen entfernt werden — die aktuelle `sanitizeFilename`-Regex erlaubt den Punkt (`.`) in Namen, der bei einem Namen wie `foo.bar` zu `foo.bar.step` führt, was akzeptabel ist, jedoch fehlt eine explizite Absicherung gegen Newline-Injection im `Content-Disposition`-Header-Wert.

Drei Warnungen betreffen fehlende Fehlerbehandlung (keine Fehlermeldung beim Download-Fehler für den Nutzer, kein `try/catch` um DB-Queries in den neuen API-Handlern) sowie das fehlende Cleanup (kein `AbortController`) im `usePartDetail`-Hook.

---

## Findings

### Critical (Blocker)

#### CR-01: Content-Disposition-Header-Injection durch Newline-Zeichen im Dateinamen

**File:** `src/app/api/parts/[id]/download/route.ts:18-23` und `:70`

**Issue:** Die Funktion `sanitizeFilename` entfernt Sonderzeichen via `[^a-zA-Z0-9_\-\.]` — diese Klasse schließt jedoch Newline-Zeichen (`\n`, `\r`, `\x0d`, `\x0a`) aus, da diese nicht in der ASCII-Printable-Menge liegen und ohnehin entfernt werden. Auf den ersten Blick erscheint die Funktion sicher.

Allerdings: Der Dateiname wird mit **doppelten ASCII-Anführungszeichen** in den Header eingebettet:

```typescript
ResponseContentDisposition: `attachment; filename="${filename}"`,
```

Das doppelte Anführungszeichen (`"`) wird von der Regex `[^a-zA-Z0-9_\-\.]` entfernt — korrekt. Jedoch fehlt ein Escaping von `\` (Backslash). Ein Name mit einem Backslash wie `C:\path` würde nach Sanitisierung zu `Cpath` (`.` bleibt, `:` und `\` werden entfernt) — das ist korrekt entfernt.

**Echter Fund:** Die Regex erlaubt den **Punkt** (`.`) explizit. Wenn der Bauteil-Name in der DB selbst den String `foo.bar` enthält, entsteht `foo.bar.step`. Das ist inhaltlich unkritisch. **Aber:** Der Name kommt unkontrolliert aus der Datenbank. Die Funktion `sanitizeFilename` erwartet einen `string`, führt aber **keinerlei Typprüfung** durch. Wenn `rows[0].name` durch einen DB-Bug `null` oder `undefined` ist (trotz NOT-NULL-Constraint möglich bei Schema-Migration-Fehlern), wirft `sanitizeFilename(null)` einen unbehandelten `TypeError: Cannot read properties of null (reading 'replace')`, der als unbehandelter 500-Fehler nach außen propagiert. Der umgebende `try/catch` bei Zeile 64 fängt nur den `getSignedUrl`-Fehler, **nicht** den Fehler bei der Filename-Konstruktion in Zeile 52.

```typescript
// Zeile 51-53 — KEIN try/catch um sanitizeFilename:
const filename = `${sanitizeFilename(rows[0].name)}.step`
const key = `${id}/original.step`
```

**Fix:**
```typescript
const rawName: unknown = rows[0].name
const filename = `${sanitizeFilename(typeof rawName === 'string' && rawName.length > 0 ? rawName : 'bauteil')}.step`
```

Oder alternativ die gesamte Filename-Konstruktion in den bestehenden `try/catch`-Block verschieben:

```typescript
let url: string
let filename: string
try {
  filename = `${sanitizeFilename(rows[0].name ?? 'bauteil')}.step`
  url = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET_STEPS,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${filename}"`,
      ResponseContentType: 'application/octet-stream',
    }),
    { expiresIn: 300 }
  )
} catch {
  return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 })
}
```

---

### Warnings

#### WR-01: Keine DB-Fehlerbehandlung in den neuen API-Handlern — unkontrollierter 500-Fehler

**Files:**
- `src/app/api/parts/[id]/route.ts:30-33` (GET-Handler)
- `src/app/api/parts/[id]/thumbnails/route.ts:31-34`
- `src/app/api/parts/[id]/download/route.ts:42-44`

**Issue:** Alle drei neuen GET-Handler führen DB-Queries aus, ohne diese in `try/catch` zu kapseln. Ein DB-Verbindungsfehler oder ein Query-Timeout wirft eine unbehandelte Exception, die Next.js als generischen 500-Response ohne strukturierten JSON-Body ausgibt. Dies ist inkonsistent mit dem Fehlerformat der anderen Endpunkte (`{ error: "..." }`), erschwert Client-seitige Fehlerbehandlung und kann stack traces in Logs leaken.

Das etablierte Muster in `thumbnail/route.ts` hat dasselbe Problem — es ist ein bekanntes Projektdefizit, das aber nicht als Rechtfertigung gilt, es weiterzuführen.

**Fix:** DB-Queries in `try/catch` kapseln:

```typescript
// GET /api/parts/[id] — Zeile 30:
let rows: Awaited<ReturnType<typeof db>>
try {
  rows = await db`
    SELECT id, name, part_number, project, status, thumbnail_count, created_at
    FROM parts WHERE id = ${id} LIMIT 1
  `
} catch {
  return NextResponse.json({ error: 'Database error' }, { status: 500 })
}
```

Gleiches Muster für `/thumbnails` und `/download`.

---

#### WR-02: Stille Fehler beim Download — keine Nutzer-Rückmeldung bei API-Fehler

**File:** `src/app/parts/[id]/PartDetail.tsx:58-59`

**Issue:** `handleDownload` gibt bei einem nicht-okayem API-Response (`res.ok === false`) mit `return` ab — ohne dem Nutzer zu signalisieren, dass der Download fehlgeschlagen ist. Der Button kehrt durch `finally` wieder in den aktivierten Zustand zurück, aber es erscheint keine Fehlermeldung. Gleiches gilt für Netzwerkfehler (fetch wirft), da kein `catch`-Block vorhanden ist — ein Netzwerkfehler propagiert als unbehandelte Promise-Rejection.

```typescript
async function handleDownload() {
  if (!part || part.status !== 'ready') return
  setIsDownloading(true)
  try {
    const res = await fetch(`/api/parts/${id}/download`)
    if (!res.ok) return  // <-- stiller Fehler, kein Feedback
    const { url } = await res.json()
    window.location.href = url
  } finally {
    setIsDownloading(false)
  }
}
```

**Fix:** `downloadError`-State hinzufügen und bei `!res.ok` sowie im `catch` setzen:

```typescript
const [downloadError, setDownloadError] = useState<string | null>(null)

async function handleDownload() {
  if (!part || part.status !== 'ready') return
  setIsDownloading(true)
  setDownloadError(null)
  try {
    const res = await fetch(`/api/parts/${id}/download`)
    if (!res.ok) {
      setDownloadError('Download fehlgeschlagen. Bitte erneut versuchen.')
      return
    }
    const { url } = await res.json()
    window.location.href = url
  } catch {
    setDownloadError('Netzwerkfehler. Bitte Verbindung prüfen.')
  } finally {
    setIsDownloading(false)
  }
}
```

Im JSX unterhalb des Download-Buttons:

```tsx
{downloadError && (
  <p className="text-xs text-center text-destructive mt-2">{downloadError}</p>
)}
```

---

#### WR-03: Fehlender AbortController in usePartDetail — Race Condition bei schneller Navigation

**File:** `src/hooks/usePartDetail.ts:30-58`

**Issue:** Der `useEffect`-Cleanup-Handler (`return () => {...}`) fehlt vollständig. Wenn `id` sich ändert (z.B. hypothetische Wiederverwendung der Komponente oder zukünftige Navigation ohne vollständige Unmount), können die alten `Promise.all`-Resolves nach dem neuen Fetch-Start feuern und `setPart`/`setThumbnailUrls` mit veralteten Daten überschreiben.

In der aktuellen Implementierung ist `id` durch das Next.js App Router Routing faktisch unveränderlich pro Mount (jede Route erzeugt eine neue Instanz). Das Risiko ist daher gering. Wenn jedoch die Komponente in Zukunft wiederverwendet wird (z.B. als Seitenleisten-Vorschau oder in einer Modal-basierten Navigation), entsteht ein echter Bug.

Außerdem: Ein Netzwerkfehler im `thumbnails`-Fetch wird in Zeile 46 still abgefangen (`r.ok ? r.json() : { urls: [] }`), ohne den `error`-State zu setzen oder den `part`-Fetch abzubrechen. Das ist für Thumbnails akzeptabel (Design: leeres Array ist valider Zustand), aber die Asymmetrie gegenüber dem `part`-Fetch (der rejected) ist undokumentiert.

**Fix:** Cleanup-Funktion mit `AbortController` hinzufügen:

```typescript
useEffect(() => {
  if (!id) return

  const controller = new AbortController()
  const signal = controller.signal

  setIsLoading(true)
  setPart(null)
  setThumbnailUrls([])
  setError(null)

  Promise.all([
    fetch(`/api/parts/${id}`, { signal }).then(r => {
      if (r.status === 404) return Promise.reject(404)
      if (!r.ok) return Promise.reject('error')
      return r.json()
    }),
    fetch(`/api/parts/${id}/thumbnails`, { signal }).then(r =>
      r.ok ? r.json() : { urls: [] }
    ),
  ])
    .then(([partData, thumbData]) => {
      setPart(partData.part)
      setThumbnailUrls(thumbData.urls ?? [])
    })
    .catch(err => {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setError(err === 404 ? 'not_found' : 'error')
    })
    .finally(() => {
      setIsLoading(false)
    })

  return () => controller.abort()
}, [id])
```

---

### Info

#### IN-01: activeIndex wird bei id-Wechsel nicht zurückgesetzt

**File:** `src/app/parts/[id]/PartDetail.tsx:41`

**Issue:** `activeIndex` wird beim Wechsel der `id`-Prop nicht auf `0` zurückgesetzt. `usePartDetail` setzt `thumbnailUrls` auf `[]` beim `id`-Wechsel, aber die PartDetail-Komponente hat keinen entsprechenden Effekt. In der aktuellen Verwendung (neue Komponenten-Instanz pro Route) ist dies kein praktisches Problem, wäre es aber bei In-Place-Navigation.

Der Fallback `thumbnailUrls[activeIndex] ?? thumbnailUrls[0]` in Zeile 120 fängt den transienten Zustand ab (`undefined ?? undefined = undefined` → `src` ist `undefined`), was kurzzeitig ein kaputtes Bild-Tag erzeugt (der `onError`-Handler versteckt es). Kein Crash, aber defensive Programmierung wäre besser.

**Fix:** Wenn `id` sich ändert, `activeIndex` auf `0` setzen:

```typescript
useEffect(() => {
  setActiveIndex(0)
}, [id])
```

---

#### IN-02: Kein Obergrenzenschutz für thumbnail_count in /thumbnails

**File:** `src/app/api/parts/[id]/thumbnails/route.ts:45-64`

**Issue:** `thumbnail_count` wird direkt aus der DB übernommen und als Länge für `Array.from` und `Promise.all` verwendet, ohne eine Obergrenze zu prüfen. Bei einem korrumpierten DB-Eintrag (z.B. `thumbnail_count = 1000` durch einen Bug im Worker) werden 2.000 parallele S3-Calls ausgeführt (1.000× HeadObject + 1.000× getSignedUrl).

Das ist kein externer Angriffsvektor (Wert kommt aus DB, nicht vom Nutzer), aber ein defensiver Check kostet nichts.

**Fix:**
```typescript
const MAX_THUMBNAILS = 8
const count: number = Math.min(rows[0].thumbnail_count, MAX_THUMBNAILS)
```

---

#### IN-03: StatusBadge-Code-Duplikation — kein shared Component

**File:** `src/app/parts/[id]/PartDetail.tsx:13-23`

**Issue:** Der `StatusBadge` ist laut Kommentar "exakt wie in CatalogTable.tsx (direkt kopiert)". Das ist eine bewusste Entscheidung (Kommentar im Code), widerspricht aber dem DRY-Prinzip. Wenn ein neuer Status hinzukommt (z.B. `archived`), muss er an zwei Stellen aktualisiert werden. Die `Part`-Typ-Definition in `usePartDetail.ts` kennt `archived` nicht, während CatalogTable.tsx möglicherweise einen erweiterten Typ verwendet.

**Fix:** `StatusBadge` in eine shared Komponente auslagern:
```
src/components/ui/StatusBadge.tsx   # oder src/components/StatusBadge.tsx
```
Beide Consumer (`CatalogTable.tsx` und `PartDetail.tsx`) importieren daraus.

---

_Reviewed: 2026-05-09_
_Reviewer: Claude Sonnet 4.6 (gsd-code-reviewer)_
_Depth: standard_
