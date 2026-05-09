# Phase 9: Part Detail - Research

**Recherchiert:** 2026-05-09
**Domain:** Next.js 16 App Router · AWS S3 Presigned URLs · shadcn/ui
**Konfidenz:** HIGH

---

<user_constraints>
## User Constraints (aus CONTEXT.md)

### Gesperrte Entscheidungen (Locked Decisions)

**Thumbnail-Galerie**
- D-01: Hauptbild + Thumbnail-Leiste (großes Hauptbild + scrollbare horizontale Leiste, 6–8 Views, Klick wechselt Hauptbild)
- D-02: Hauptbild quadratisch — 320×320px Mobile, 480×480px Desktop (≥768px)
- D-03: Alle Presigned URLs in einer API-Anfrage laden (kein Lazy-Loading)
- D-04: Skeleton-Placeholder für Hauptbild und Miniaturen während URLs geladen werden

**STEP-Download**
- D-05: Presigned S3-URL mit `response-content-disposition: attachment; filename="{name}.step"` — Browser lädt direkt von S3 (kein Proxy durch Next.js)
- D-06: Dateiname `{name}.step` — `name`-Wert aus DB, sanitized (Leerzeichen → `_`, Sonderzeichen entfernen)
- D-07: `<Button>` "STEP herunterladen" am Seitenende; disabled mit Hinweis wenn status ≠ 'ready'

**Navigation & Layout**
- D-08: `← Zurück zur Suche` Link im Seiten-Header; `router.back()` wenn History vorhanden, sonst href='/search'
- D-09: Layout-Reihenfolge (oben nach unten): Zurück-Link → Hauptbild → Thumbnail-Leiste → H1-Name → Metadaten-Tabelle → Download-Button
- D-10: Status-Badge wie in Admin-Katalog (ready=grün, processing=blau, pending=secondary, failed=destructive)
- D-11: Nicht-ready-State zeigt immer alle Metadaten; Skeleton bei thumbnail_count=0; Download-Button disabled

**Neue API-Endpoints**
- D-12: `GET /api/parts/[id]` — Gibt `id, name, part_number, project, status, thumbnail_count, created_at` zurück
- D-13: `GET /api/parts/[id]/thumbnails` — Gibt `{ urls: string[] }`, bis zu `thumbnail_count` Einträge; 60s TTL
- D-14: `GET /api/parts/[id]/download` — Gibt `{ url: string, filename: string }` zurück mit `response-content-disposition`

### Claude's Discretion

- Genaue Tailwind-Klassen für Thumbnail-Leiste (overflow-x-auto, gap, Miniatur-Größe ~64px)
- Ob `usePartDetail`-Custom-Hook die API-Anfragen kapselt oder inline in der Seite
- Formatierung des Upload-Datums (de-DE Locale oder ISO-String)
- Breite der Metadaten-Tabelle (`<dl>` oder `<table>`)

### Deferred Ideas (NICHT IN SCOPE)

Keine — Diskussion blieb vollständig im Phase-9-Scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Beschreibung | Research-Grundlage |
|----|-------------|-------------------|
| DETAIL-01 | Nutzer kann die vollständigen Metadaten eines gefundenen Bauteils einsehen | GET /api/parts/[id] (D-12) + PartDetail Client Component; 5 Felder: name, part_number, project, status, created_at |
| DETAIL-02 | Nutzer kann die Original-STEP-Datei herunterladen | GET /api/parts/[id]/download (D-14) → Presigned URL → window.location.href; Download-Button disabled wenn status≠ready |
</phase_requirements>

---

## Summary

Phase 9 schließt die v1-Core-Search-Experience ab, indem die `/parts/[id]`-Detailseite implementiert wird — das Ziel der `Link href="/parts/${id}"` aus Phase 8s SearchResultCard. Die Phase umfasst drei neue API-Endpoints, eine Server-Component-Wrapper-Seite, eine Client-Component mit Custom-Hook sowie eine Thumbnail-Galerie mit Presigned-URL-Loading.

Der technische Kern ist gut etabliert: Das Presigned-URL-Pattern aus `/api/parts/[id]/thumbnail/route.ts` wird direkt auf zwei neue Endpoints übertragen (`/thumbnails` für alle Views, `/download` für STEP mit Content-Disposition). Die UI-Komponenten (Badge, Skeleton, Button) sind alle installiert und aus CatalogTable.tsx bekannte Muster können direkt wiederverwendet werden.

Das UI-Design-Contract (09-UI-SPEC.md) ist bereits vollständig spezifiziert und approved — alle Tailwind-Klassen, Komponenten-Hierarchie, Interaktionszustände und Texte sind festgelegt. Die Research-Phase fokussiert daher auf Code-Patterns, Pitfalls und Testarchitektur.

**Primäre Empfehlung:** Exakt das bestehende thumbnail/route.ts-Pattern für beide neuen S3-Endpoints kopieren und anpassen — nicht neu erfinden.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Metadaten laden (name, status, etc.) | API / Backend (GET /api/parts/[id]) | — | DB-Query ist server-only; client holt via fetch |
| Thumbnail-URLs laden | API / Backend (GET /api/parts/[id]/thumbnails) | Browser (fetch + useState) | Presigned URLs werden server-seitig generiert; Client hält State |
| Download-URL generieren | API / Backend (GET /api/parts/[id]/download) | Browser (window.location.href) | Content-Disposition und Signing sind server-only |
| Galerie-Interaktion (activeIndex) | Browser / Client | — | useState in Client Component — kein Server-Round-Trip |
| Navigation (router.back) | Browser / Client | — | useRouter ist client-seitig |
| Status-Badge | Browser / Client | — | Reine UI-Logik, keine Server-Abhängigkeit |
| UUID-Validierung | API / Backend | — | Sicherheitsanforderung: vor jeder S3-Key-Konstruktion |

---

## Standard Stack

### Core (bereits installiert — kein npm install erforderlich)

| Library | Version | Purpose | Warum Standard |
|---------|---------|---------|----------------|
| Next.js App Router | 16.x | Routing, Server Components, dynamic params | Projektstandard |
| `@aws-sdk/client-s3` | Installiert (Phase 3) | GetObjectCommand, HeadObjectCommand | Bereits in thumbnail/route.ts aktiv |
| `@aws-sdk/s3-request-presigner` | Installiert (Phase 3) | `getSignedUrl()` | Bewährtes Muster im Projekt |
| `zod` | Installiert | UUID-Validierung (ParamsSchema) | Security-Requirement T-04-08 |
| shadcn/ui Badge | Installiert (Phase 4/5) | Status-Badge | CLAUDE.md: shadcn/ui first |
| shadcn/ui Skeleton | Installiert (Phase 4) | Thumbnail-Placeholder | D-04 |
| shadcn/ui Button | Installiert (Phase 4) | Download-Button | D-07 |
| Lucide React | Installiert (Phase 5) | ArrowLeft, Download Icons | CatalogTable.tsx-Abhängigkeit |
| `next/navigation` useRouter | Eingebaut | router.back() für D-08 | Next.js 16 Client-Hook |

[VERIFIED: Codebase grep — alle Packages aktiv in bestehenden Dateien]

**Installation:** Kein neues `npm install` erforderlich — alle Packages sind bereits als Projektabhängigkeiten vorhanden.

---

## Architecture Patterns

### System Architecture Diagram

```
Browser (Client)
  │
  ├─ GET /parts/[id]
  │    └─ page.tsx (Server Component)
  │         └─ <PartDetail id={id} /> (Client Component, "use client")
  │              │
  │              ├─ usePartDetail(id) — Custom Hook
  │              │    ├─ fetch GET /api/parts/[id]          → { id, name, ... }
  │              │    └─ fetch GET /api/parts/[id]/thumbnails → { urls: string[] }
  │              │
  │              ├─ useState(activeIndex)
  │              ├─ <BackLink>          (router.back | href=/search)
  │              ├─ <MainImage>         (img src=urls[activeIndex] | Skeleton)
  │              ├─ <ThumbnailStrip>    (buttons mit ring-primary für active)
  │              ├─ <h1>{name}</h1>
  │              ├─ <dl> Metadaten      (<StatusBadge>, formatDate)
  │              └─ <DownloadButton>    (onClick → fetch /api/parts/[id]/download → window.location.href)
  │
  └─ Browser Download
       └─ GET [presigned S3 URL] (direkt zu AWS S3, kein Next.js-Proxy)
            └─ Content-Disposition: attachment; filename="{sanitized_name}.step"
```

```
API Layer (Server-only)
  │
  ├─ GET /api/parts/[id]                  (route.ts — GET wird hinzugefügt)
  │    ├─ ParamsSchema.uuid()              (UUID-Validierung)
  │    ├─ db`SELECT id,name,... FROM parts WHERE id=${id}`
  │    └─ NextResponse.json({ part })
  │
  ├─ GET /api/parts/[id]/thumbnails        (neue route.ts)
  │    ├─ ParamsSchema.uuid()              (UUID-Validierung)
  │    ├─ db`SELECT status,thumbnail_count WHERE id=${id}`
  │    ├─ HeadObjectCommand × thumbnail_count (Race-Condition-Schutz)
  │    ├─ getSignedUrl × thumbnail_count  (60s, GetObjectCommand)
  │    └─ NextResponse.json({ urls })
  │
  └─ GET /api/parts/[id]/download          (neue route.ts)
       ├─ ParamsSchema.uuid()              (UUID-Validierung)
       ├─ db`SELECT status,name WHERE id=${id}`
       ├─ sanitizeFilename(name)           → "Flansch_M12"
       ├─ HeadObjectCommand({Bucket:BUCKET_STEPS, Key:`${id}/original.step`})
       ├─ getSignedUrl(..., { ResponseContentDisposition: "attachment; filename=..." })
       └─ NextResponse.json({ url, filename })
```

### Empfohlene Projektstruktur (neue Dateien)

```
src/
  app/
    api/
      parts/
        [id]/
          route.ts                    # GET hinzufügen (D-12) — PATCH/DELETE bleibt
          thumbnails/
            route.ts                  # NEU — GET /api/parts/[id]/thumbnails (D-13)
          download/
            route.ts                  # NEU — GET /api/parts/[id]/download (D-14)
    parts/
      [id]/
        page.tsx                      # NEU — Server Component Wrapper
        PartDetail.tsx                # NEU — Client Component ("use client")
  hooks/
    usePartDetail.ts                  # NEU — Custom Hook (kapselt 2 API-Anfragen)
tests/
  phase-09-part-detail.spec.ts        # NEU — Playwright E2E
src/app/parts/[id]/
  PartDetail.test.tsx                 # NEU — Vitest Unit Tests
```

### Pattern 1: Presigned URL für mehrere Thumbnails

Das bestehende `thumbnail/route.ts` generiert eine URL für `view_0.png`. Der neue `/thumbnails`-Endpoint generiert URLs für `view_0.png` bis `view_{N-1}.png` mit `thumbnail_count` aus der DB.

```typescript
// Source: Adaptiert aus src/app/api/parts/[id]/thumbnail/route.ts [VERIFIED: codebase]
// Neue Datei: src/app/api/parts/[id]/thumbnails/route.ts

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params  // Next.js 16: params ist Promise

  const parsed = ParamsSchema.safeParse({ id })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid id', details: parsed.error.flatten() }, { status: 400 })
  }

  const rows = await db`SELECT status, thumbnail_count FROM parts WHERE id = ${id} LIMIT 1`
  if (rows.length === 0) return NextResponse.json({ error: 'Part not found' }, { status: 404 })
  if (rows[0].status !== 'ready') return NextResponse.json({ urls: [] }, { status: 200 })

  const count: number = rows[0].thumbnail_count
  if (count === 0) return NextResponse.json({ urls: [] }, { status: 200 })

  const urls: string[] = []
  for (let i = 0; i < count; i++) {
    const key = `${id}/view_${i}.png`
    try {
      await s3.send(new HeadObjectCommand({ Bucket: BUCKET_THUMBNAILS, Key: key }))
      const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET_THUMBNAILS, Key: key }), { expiresIn: 60 })
      urls.push(url)
    } catch {
      // Einzelne fehlende Views überspringen — Rest trotzdem zurückgeben
    }
  }

  return NextResponse.json({ urls })
}
```

### Pattern 2: Presigned Download-URL mit Content-Disposition

```typescript
// Source: Adaptiert aus AWS SDK S3-Presigner-Dokumentation [VERIFIED: thumbnail/route.ts Muster]
// Neue Datei: src/app/api/parts/[id]/download/route.ts

function sanitizeFilename(name: string): string {
  return name
    .replace(/\s+/g, '_')           // Leerzeichen → Unterstriche
    .replace(/[^a-zA-Z0-9_\-\.]/g, '') // Sonderzeichen entfernen
    || 'bauteil'                    // Fallback falls leer
}

// In GET handler, nach UUID-Validierung und DB-Check:
const name = rows[0].name
const filename = `${sanitizeFilename(name)}.step`
const key = `${id}/original.step`

await s3.send(new HeadObjectCommand({ Bucket: BUCKET_STEPS, Key: key }))

const url = await getSignedUrl(
  s3,
  new GetObjectCommand({
    Bucket: BUCKET_STEPS,
    Key: key,
    ResponseContentDisposition: `attachment; filename="${filename}"`,
    ResponseContentType: 'application/octet-stream',
  }),
  { expiresIn: 300 }  // 5 Minuten — länger als Thumbnail (Dateigröße bis 100MB)
)

return NextResponse.json({ url, filename })
```

### Pattern 3: Seiten-Architektur (Server Component + Client Component)

```typescript
// Source: Etabliertes Muster aus Phase 5 Admin-Katalog [VERIFIED: codebase]
// src/app/parts/[id]/page.tsx — Server Component

import { PartDetail } from './PartDetail'

export default async function PartDetailPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params  // Next.js 16: params ist Promise
  return <PartDetail id={id} />
}

// src/app/parts/[id]/PartDetail.tsx — Client Component
'use client'
import { usePartDetail } from '@/hooks/usePartDetail'
// ... hooks, useState für activeIndex
```

### Pattern 4: usePartDetail Custom Hook

```typescript
// src/hooks/usePartDetail.ts
'use client'
import { useState, useEffect } from 'react'

export function usePartDetail(id: string) {
  const [part, setPart] = useState<Part | null>(null)
  const [thumbnailUrls, setThumbnailUrls] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setIsLoading(true)
    // Beide Anfragen parallel — kein sequenzielles Warten
    Promise.all([
      fetch(`/api/parts/${id}`).then(r => r.ok ? r.json() : Promise.reject(r.status)),
      fetch(`/api/parts/${id}/thumbnails`).then(r => r.ok ? r.json() : { urls: [] }),
    ])
      .then(([partData, thumbData]) => {
        setPart(partData.part)
        setThumbnailUrls(thumbData.urls ?? [])
      })
      .catch(err => setError(err === 404 ? 'not_found' : 'error'))
      .finally(() => setIsLoading(false))
  }, [id])  // [id] — kein thumbnailUrls im Deps-Array (Endlosloop-Pitfall)

  return { part, thumbnailUrls, isLoading, error }
}
```

### Pattern 5: StatusBadge (direkt aus CatalogTable.tsx kopieren)

```typescript
// Source: src/app/admin/CatalogTable.tsx [VERIFIED: codebase gelesen]
// Hinweis: 'archived' ist im Typ vorhanden, für Phase 9 aber nicht relevant
function StatusBadge({ status }: { status: Part['status'] }) {
  if (status === 'ready')
    return <Badge className="text-green-700 bg-green-50 border-green-200 hover:bg-green-50">Bereit</Badge>
  if (status === 'pending')
    return <Badge variant="secondary">Ausstehend</Badge>
  if (status === 'processing')
    return <Badge variant="outline" className="text-blue-600 border-blue-300">Wird verarbeitet…</Badge>
  if (status === 'failed')
    return <Badge variant="destructive">Fehlgeschlagen</Badge>
  return null
}
```

### Anti-Patterns vermeiden

- **thumbnailUrls in useEffect-Deps-Array:** Führt zu Endlosschleifen da jede URL-Aktualisierung einen Re-fetch auslöst. Nur `[id]` als Dependency. [VERIFIED: CatalogTable.tsx Kommentar + SearchResultCard.tsx Muster]
- **GET /download als Browser-Download-Proxy durch Next.js:** Bei 100MB STEP-Dateien führt das zu Vercel-Timeouts. Stattdessen `window.location.href = presignedUrl` (D-05). [VERIFIED: CONTEXT.md D-05]
- **S3-Key-Konstruktion ohne UUID-Validierung:** Path-Traversal-Angriff möglich (`../other-bucket/secret`). Immer `z.string().uuid()` ZUERST. [VERIFIED: thumbnail/route.ts, security.md]
- **Content-Type-Header beim Browser-Fetch:** Bei multipart/form-data Anfragen den Browser den Boundary automatisch setzen lassen (Phase 6/8 Pitfall). Für GET-Requests irrelevant.
- **SUPABASE_SERVICE_ROLE_KEY mit NEXT_PUBLIC_-Prefix:** Server-Secrets niemals im Client-Bundle. [VERIFIED: CLAUDE.md, ROADMAP.md Cross-cutting constraints]
- **`router.back()` ohne History-Check:** Wenn Nutzer direkt auf `/parts/[id]` navigiert (z.B. per Bookmark), ist `window.history.length <= 1`. Fallback auf `/search` erforderlich (D-08).

---

## Don't Hand-Roll

| Problem | Nicht bauen | Stattdessen verwenden | Warum |
|---------|-------------|----------------------|-------|
| Presigned URL generieren | Eigene HMAC-Signatur | `@aws-sdk/s3-request-presigner` `getSignedUrl()` | Korrekte AWS SigV4-Signatur ist komplex und sicherheitskritisch |
| UUID-Validierung | Regex-Pattern | `z.string().uuid()` (Zod) | Bereits Projektstandard; deckt alle UUID-Varianten ab |
| Status-Badge UI | Custom div/span | shadcn `<Badge>` | CLAUDE.md: shadcn/ui first; konsistent mit Admin-Katalog |
| Skeleton-Placeholder | Custom CSS-Animation | shadcn `<Skeleton>` | Bereits installiert; konsistent mit Upload-Form und SearchResultCard |
| Datum formatieren | Eigenes Format-String | `Intl.DateTimeFormat('de-DE')` | Bereits in CatalogTable.tsx — 1:1 kopieren |
| Dateinamen-Sanitization | Regex-Kette | Einfache replace-Kette (kein Package nötig) | Anforderung ist minimal: Leerzeichen→_ und Sonderzeichen entfernen |

---

## Common Pitfalls

### Pitfall 1: thumbnail_count = 0 beim Status-Check für /thumbnails

**Was schiefgeht:** Bei status='ready' aber thumbnail_count=0 (Randbedingung) wird ein leeres Array zurückgegeben, obwohl die DB 'ready' sagt. Client rendert Skeletons statt Fehler.
**Warum:** Zwischen DB-Insert (thumbnail_count=0) und Worker-Completion-Update gibt es ein Zeitfenster.
**Wie vermeiden:** `/thumbnails`-Endpoint gibt `{ urls: [] }` zurück wenn count=0; Client rendert Skeleton-Strip mit 6 Items (D-11). Kein Fehler-State nötig.
**Warnsignal:** HTTP 200 mit leером Array — kein 409-Fehler wie in `/thumbnail`.

[VERIFIED: CONTEXT.md D-11, thumbnail/route.ts zeigt 409-Ansatz für single thumbnail]

### Pitfall 2: Next.js 16 params als Promise nicht awaited

**Was schiefgeht:** `const { id } = params` statt `const { id } = await params` — TypeError in Next.js 16.
**Warum:** Next.js 16 änderte params zu einem Promise (breaking change gegenüber 14/15).
**Wie vermeiden:** Konsistent `await params` in ALLEN neuen Route-Handlers und in page.tsx.
**Warnsignal:** `params.id` ist `undefined` — kein TypeError, nur falsche UUID-Validierung.

[VERIFIED: CONTEXT.md code_context, src/app/api/parts/[id]/route.ts Zeile 27]

### Pitfall 3: Download-Button löst keinen File-Save-Dialog aus

**Was schiefgeht:** Ohne `response-content-disposition: attachment` öffnet der Browser STEP-Dateien inline oder fragt nach. Mit falschem MIME-Type passiert dasselbe.
**Warum:** Browser entscheidet basierend auf Content-Type und Content-Disposition ob er speichert oder rendert.
**Wie vermeiden:** `ResponseContentDisposition: 'attachment; filename="..."'` UND `ResponseContentType: 'application/octet-stream'` im GetObjectCommand-Params setzen.
**Warnsignal:** Download öffnet neuen Tab statt Save-Dialog.

[ASSUMED — AWS SDK S3-Presigner-Dokumentation nicht in dieser Session via Context7 verifiziert]

### Pitfall 4: router.back() auf direktem Seitenaufruf

**Was schiefgeht:** Nutzer bookmarkt `/parts/abc-123` und öffnet direkt — `router.back()` navigiert aus der App heraus (zur Browser-Startseite oder leerer History).
**Warum:** `window.history.length === 1` wenn keine vorherige History vorhanden.
**Wie vermeiden:** Guard: `if (window.history.length > 1) { router.back() } else { router.push('/search') }`
**Warnsignal:** Back-Button verlässt die App komplett.

[VERIFIED: CONTEXT.md D-08 beschreibt diesen Fallback explizit]

### Pitfall 5: Parallele HeadObject-Calls bei vielen Thumbnails

**Was schiefgeht:** Bei 8 Thumbnails werden 8 sequenzielle HeadObject-Calls ausgeführt — addiert sich zur Latenz.
**Warum:** For-Loop mit await ist sequenziell.
**Wie vermeiden:** `Promise.all()` für parallele HeadObject + getSignedUrl-Calls. Bei 8 Views: 8x parallel statt 8x seriell.
**Warnsignal:** /thumbnails-Endpoint braucht >1s obwohl alle Dateien existieren.

[ASSUMED — Basierend auf allgemeiner AWS SDK Kenntnis; parallele Ausführung ist dokumentiertes Best-Practice]

### Pitfall 6: Presigned URL TTL zu kurz für Download

**Was schiefgeht:** 60s-TTL wie bei Thumbnails — bei großen STEP-Dateien (bis 100MB) kann der Download länger dauern als die URL gültig ist.
**Warum:** S3 validiert die URL-Signatur zum Zeitpunkt des Request-Starts, nicht der Completion. Browser-Download bricht ab wenn URL abläuft und Connection-Resume nötig ist.
**Wie vermeiden:** Download-URL mit 300s (5min) TTL generieren — ausreichend für 100MB bei typischen Netzwerkgeschwindigkeiten.
**Warnsignal:** Download bricht bei großen Dateien mit 403-Fehler ab.

[ASSUMED — TTL-Empfehlung basiert auf Training-Wissen; für 100MB bei 3 Mbit/s = 4.5min]

---

## Code Examples

### GET /api/parts/[id] — neuer Handler (in bestehender route.ts)

```typescript
// Source: Erweiterung von src/app/api/parts/[id]/route.ts [VERIFIED: codebase]
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params

  const parsed = ParamsSchema.safeParse({ id })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid id', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const rows = await db`
    SELECT id, name, part_number, project, status, thumbnail_count, created_at
    FROM parts WHERE id = ${id} LIMIT 1
  `
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Part not found' }, { status: 404 })
  }

  return NextResponse.json({ part: rows[0] })
}
```

### Download-Handler

```typescript
// Source: Adaptiert aus src/app/api/parts/[id]/thumbnail/route.ts [VERIFIED: codebase]
// src/app/api/parts/[id]/download/route.ts

import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

function sanitizeFilename(name: string): string {
  return name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-\.]/g, '') || 'bauteil'
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params

  const parsed = ParamsSchema.safeParse({ id })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const rows = await db`SELECT status, name FROM parts WHERE id = ${id} LIMIT 1`
  if (rows.length === 0) return NextResponse.json({ error: 'Part not found' }, { status: 404 })
  if (rows[0].status !== 'ready') return NextResponse.json({ error: 'Not ready' }, { status: 409 })

  const filename = `${sanitizeFilename(rows[0].name)}.step`
  const key = `${id}/original.step`

  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET_STEPS, Key: key }))
  } catch {
    return NextResponse.json({ error: 'STEP file missing' }, { status: 404 })
  }

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: BUCKET_STEPS,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${filename}"`,
      ResponseContentType: 'application/octet-stream',
    }),
    { expiresIn: 300 }
  )

  return NextResponse.json({ url, filename })
}
```

---

## State of the Art

| Alter Ansatz | Aktueller Ansatz | Relevant für Phase 9 |
|--------------|------------------|----------------------|
| Next.js params synchron (`params.id`) | params als Promise: `await params` | Alle neuen Route-Handler und page.tsx |
| Einzelne Thumbnail-URL | Array von Presigned URLs in einem Request | /thumbnails-Endpoint statt N×/thumbnail |
| Download über Next.js-Proxy | `window.location.href = presignedUrl` | Vermeidet Vercel-Timeout bei 100MB |
| `<table>` für Label/Value-Pairs | `<dl>`/`<dt>`/`<dd>` | Semantisch korrekt, Screen-Reader-freundlich |

---

## Assumptions Log

| # | Claim | Abschnitt | Risiko wenn falsch |
|---|-------|-----------|-------------------|
| A1 | Download-URL TTL von 300s ist ausreichend für 100MB STEP-Files | Pitfall 6 | Großer Download bricht mit 403 ab — TTL erhöhen auf 900s |
| A2 | `ResponseContentDisposition` + `ResponseContentType` im GetObjectCommand-Params triggert Browser-Save-Dialog | Pattern 2, Pitfall 3 | Download öffnet Tab statt Datei zu speichern — Server-seitiger MIME-Header müsste anders gesetzt werden |
| A3 | Parallele HeadObject + getSignedUrl calls via Promise.all sind performanter als sequenziell | Pitfall 5 | Negligibler Unterschied bei 8 Calls — sequenzieller Loop ist einfacher und ausreichend |

---

## Open Questions

1. **Download-URL TTL für große Dateien**
   - Was wir wissen: STEP-Dateien bis 100MB; thumbnail/route.ts verwendet 60s
   - Was unklar: Ob S3 die Signatur zum Request-Start oder während des Downloads validiert — bei Range-Requests und Reconnects ist das relevant
   - Empfehlung: 300s als Kompromiss; Phase 10 (Hardening) kann bei Problemen erhöhen

2. **HeadObject bei /thumbnails — Resilience-Strategie**
   - Was wir wissen: thumbnail/route.ts macht HeadObject als Race-Condition-Schutz
   - Was unklar: Soll ein einzelner fehlender View (z.B. view_3.png fehlt) den gesamten /thumbnails-Call zum Fehler machen oder soll der fehlendeView übersprungen werden?
   - Empfehlung: Einzelne fehlende Views überspringen (try/catch im Loop), da partial views besser als leere Galerie sind

---

## Environment Availability

Schritt 2.6: ÜBERSPRUNGEN — Phase 9 ist ein reiner Code-/UI-Phase. Alle externen Abhängigkeiten (AWS S3, Neon DB) sind seit Phase 1–3 etabliert und operativ.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (Unit) + Playwright (E2E) |
| Config file | `vitest.config.ts` / `playwright.config.ts` |
| Quick run command | `npm test -- --testPathPattern="PartDetail"` |
| Full suite command | `npm run test:all` |

[VERIFIED: package.json-Scripts aus CLAUDE.md + Projektstruktur aus tests/]

### Phase Requirements → Test Map

| Req ID | Verhalten | Test-Typ | Automatisierter Befehl | Datei vorhanden? |
|--------|-----------|----------|----------------------|-----------------|
| DETAIL-01 | /parts/[id] zeigt alle 5 Metadatenfelder (name, part_number, project, status, created_at) | unit | `npm test -- PartDetail.test` | ❌ Wave 0 |
| DETAIL-01 | StatusBadge zeigt korrekte Farbe für jeden Status | unit | `npm test -- PartDetail.test` | ❌ Wave 0 |
| DETAIL-01 | Skeleton-Layout während Laden | unit | `npm test -- PartDetail.test` | ❌ Wave 0 |
| DETAIL-01 | 404-Error-State wenn Bauteil nicht gefunden | unit | `npm test -- PartDetail.test` | ❌ Wave 0 |
| DETAIL-02 | Download-Button disabled wenn status≠ready | unit | `npm test -- PartDetail.test` | ❌ Wave 0 |
| DETAIL-02 | Download-Button ruft /api/parts/[id]/download auf und setzt window.location.href | unit | `npm test -- PartDetail.test` | ❌ Wave 0 |
| DETAIL-01 + DETAIL-02 | Vollständiger Seitenaufruf von /parts/[id] zeigt Metadaten und Download-Button | E2E | `npm run test:e2e -- phase-09` | ❌ Wave 0 |
| DETAIL-02 | Download-Link liefert STEP-Datei mit korrektem filename | E2E (manual-verify) | Manuell in Browser — Playwright kann Downloads prüfen | ❌ Wave 0 |

### Sampling Rate

- **Pro Task-Commit:** `npm test -- --testPathPattern="PartDetail"` (Vitest Unit)
- **Pro Wave-Merge:** `npm run test:all`
- **Phase Gate:** Full suite grün vor `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/app/parts/[id]/PartDetail.test.tsx` — deckt DETAIL-01 (Unit: Metadaten, Skeleton, Error) und DETAIL-02 (Unit: Download-Button States)
- [ ] `tests/phase-09-part-detail.spec.ts` — Playwright E2E: Seitennavigation von /search → /parts/[id]
- [ ] `src/hooks/usePartDetail.test.ts` — Unit: API-Mocking für beide fetch-Calls

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | nein | Pilot ohne Auth — bestehende Projektentscheidung |
| V3 Session Management | nein | Keine Session-State in Phase 9 |
| V4 Access Control | nein | Pilot ohne Auth |
| V5 Input Validation | ja | `z.string().uuid()` — PFLICHT vor jeder S3-Key-Konstruktion |
| V6 Cryptography | nein (indirekt) | AWS SDK übernimmt SigV4 — nie selbst implementieren |

### Known Threat Patterns

| Pattern | STRIDE | Standard-Mitigation |
|---------|--------|---------------------|
| Path Traversal via part id | Tampering | UUID-Validierung mit `z.string().uuid()` als erste Operation in JEDEM Handler — vor DB-Query und S3-Key-Konstruktion |
| Presigned URL Leakage | Information Disclosure | 60s/300s TTL; URLs nie gecacht oder geloggt; nur über HTTPS |
| Server Secret im Client-Bundle | Information Disclosure | AWS_SECRET_ACCESS_KEY, DB-Credentials ohne `NEXT_PUBLIC_`-Prefix; s3.ts ist server-only |
| STEP-Datei eines anderen Nutzers downloaden | Elevation of Privilege | UUID-Validierung verhindert Traversal; zusätzlich: UUID-Namespace macht Enumeration praktisch unmöglich |

**Threat Model für neue Endpoints:**
- `GET /api/parts/[id]`: UUID-Validierung → DB-Lookup → JSON. Kein S3-Zugriff. Risikoarm.
- `GET /api/parts/[id]/thumbnails`: UUID → DB → HeadObject × N → getSignedUrl × N. Path-Traversal-Schutz durch UUID kritisch.
- `GET /api/parts/[id]/download`: UUID → DB → HeadObject → getSignedUrl mit Content-Disposition. Höchstes Risiko: falscher Dateiname könnte STEP-Key anderer Parts liefern — UUID-Validierung verhindert dies.

---

## Sources

### Primary (HIGH Konfidenz)

- `src/app/api/parts/[id]/thumbnail/route.ts` — Vollständiges Presigned-URL-Pattern (HeadObject + getSignedUrl + UUID-Validierung) — direkt verifiziert
- `src/app/api/parts/[id]/route.ts` — PATCH/DELETE-Muster; ParamsSchema; Next.js 16 params-Pattern — direkt verifiziert
- `src/app/admin/CatalogTable.tsx` — StatusBadge, formatDate, Thumbnail-useEffect-Pattern — direkt verifiziert
- `src/app/search/SearchResultCard.tsx` — Link href="/parts/[id]" (Einstiegspunkt Phase 9), Thumbnail-Loading-Muster — direkt verifiziert
- `src/lib/s3.ts` — BUCKET_STEPS, BUCKET_THUMBNAILS Konstanten — direkt verifiziert
- `.planning/phases/09-part-detail/09-CONTEXT.md` — Alle D-01..D-14 Entscheidungen — direkt gelesen
- `.planning/phases/09-part-detail/09-UI-SPEC.md` — Vollständiger Design-Contract — direkt gelesen
- `CLAUDE.md` — Projektkonventionen, shadcn/ui first, Build-Commands — direkt gelesen

### Secondary (MEDIUM Konfidenz)

- `.planning/STATE.md` — Accumulated Context, bestätigte S3-Pfadkonventionen, Entscheidungslog

### Tertiary (LOW Konfidenz — als ASSUMED markiert)

- A1, A2, A3 im Assumptions Log — Training-Wissen, nicht in dieser Session verifiziert

---

## Metadata

**Konfidenz-Aufschlüsselung:**
- Standard Stack: HIGH — alle Packages aus bestehendem Code verifiziert
- Architecture Patterns: HIGH — direkt aus thumbnail/route.ts und CatalogTable.tsx abgeleitet
- API-Endpoints: HIGH — D-12/D-13/D-14 vollständig spezifiziert in CONTEXT.md
- UI-Design: HIGH — 09-UI-SPEC.md vollständig approved mit allen Tailwind-Klassen
- Pitfalls: MEDIUM/HIGH — Pitfalls 1-4 aus Code verifiziert, Pitfalls 5-6 angenommen

**Research-Datum:** 2026-05-09
**Gültig bis:** 2026-06-08 (stabile Stack; 30 Tage)
