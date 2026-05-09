# Phase 5: Admin Catalog — Research

**Recherchiert:** 2026-05-09
**Domäne:** Next.js 16 Admin-UI, AWS S3 Hard-Delete, Neon PostgreSQL, shadcn/ui
**Gesamtkonfidenz:** HIGH

---

<user_constraints>
## User Constraints (aus CONTEXT.md)

### Gesperrte Entscheidungen

**D-01:** Tabelle mit Mini-Thumbnail — shadcn/Table mit Spalten: Thumbnail (48×48px) | Bezeichnung | Teilenummer | Projekt | Status-Badge | Erstellt am | Aktionen-Dropdown.
**D-02:** 20 Zeilen pro Seite — shadcn/Pagination darunter.
**D-03:** Aktionen via shadcn/DropdownMenu pro Zeile — Einträge: Bearbeiten / Archivieren / Löschen / ↺ Neu starten (nur sichtbar wenn status='failed').
**D-04:** Freitext-Suchfeld über der Tabelle — filtert nach Name oder Teilenummer. Einfache client-seitige Filterung (300ms Debounce).
**D-05:** Tabs über der Tabelle mit shadcn/Tabs: Alle | Bereit | Ausstehend | Fehler | Archiviert. Jeder Tab zeigt Zahl-Badge.
**D-06:** Standard-Tab: "Alle" beim ersten Laden.
**D-07:** shadcn/Sheet öffnet von rechts beim Klick auf "Bearbeiten".
**D-08:** Sheet-Inhalt: Thumbnail 192×192px, react-hook-form + Zod: Name (required), Teilenummer (optional), Projekt (optional), Status-Select (KEIN 'archived'). Erstellt am read-only. Speichern + Abbrechen.
**D-09:** Nach Speichern: Sheet bleibt offen, Tabellenzeile aktualisiert sich live (optimistic update).
**D-10:** Archivieren = Soft-Delete — setzt `status='archived'`.
**D-11:** Löschen = Hard-Delete — DB + S3 (`parts-steps`: `{part_id}/original.step`, `parts-thumbnails`: `{part_id}/view_0.png` bis `view_7.png`). AlertDialog zur Bestätigung.
**D-12:** Retry ohne Bestätigungs-Dialog — setzt `status='pending'` + ruft `/enqueue`-Endpoint auf.

### Claude's Discretion

- URL-Struktur: `/admin` (von UI-SPEC festgelegt — bereits entschieden)
- API-Routen: `/api/parts` mit Sub-Routen (von UI-SPEC festgelegt):
  - `GET /api/parts` — alle Teile abrufen
  - `PATCH /api/parts/[id]` — Metadaten aktualisieren
  - `DELETE /api/parts/[id]` — Hard-Delete (DB + S3)
  - `POST /api/parts/[id]/archive` — Soft-Delete
  - `POST /api/parts/[id]/retry` — Reset + Enqueue
- Debounce-Timing: 300ms (von UI-SPEC festgelegt)
- Paginierung: React State (kein URL-Query-Parameter — von UI-SPEC festgelegt)

### Deferred Ideas (AUSSERHALB DES SCOPE)

- Queue-Übersicht (ADMIN-V2-01) — V2
- Systemweite Konfiguration (ADMIN-V2-02) — V2
- Server-seitige Suche — Phase 10
- Bulk-Aktionen — Phase 10

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Beschreibung | Research-Fundament |
|----|-------------|---------------------|
| ADMIN-01 | Nutzer kann alle hochgeladenen Bauteile in einer Katalog-Liste mit Status und Thumbnail sehen | `GET /api/parts` liefert alle Zeilen; Thumbnails via bestehenden `/api/parts/[id]/thumbnail`-Endpunkt; shadcn/Table + Tabs + Pagination |
| ADMIN-02 | Nutzer kann Metadaten (Name, Teilenummer, Projekt, Status) nachträglich bearbeiten | `PATCH /api/parts/[id]` + shadcn/Sheet + react-hook-form + Zod; Optimistic Update in lokalem State |
| ADMIN-03 | Nutzer kann ein Bauteil archivieren oder löschen | Archivieren: `POST /api/parts/[id]/archive` setzt `status='archived'`; Löschen: `DELETE /api/parts/[id]` inkl. `DeleteObjectCommand` für 9 S3-Objekte |
| ADMIN-04 | Nutzer kann die Verarbeitung für fehlerhafte Bauteile erneut starten | `POST /api/parts/[id]/retry` setzt `status='pending'` + ruft `WORKER_URL/enqueue` auf — identisches Muster zu `confirm/route.ts` |

</phase_requirements>

---

## Summary

Phase 5 ist eine reine CRUD-UI-Phase ohne neue Infrastruktur. Die gesamte Datenbank- und S3-Infrastruktur ist bereits in Phase 1–3 etabliert. Die `parts`-Tabelle hat bereits `parts_status_idx` für effiziente Filterung. Alle shadcn-Komponenten sind installiert. Die Phase besteht aus: einem `GET /api/parts`-Endpunkt (neu), vier Action-Endpunkten (PATCH, DELETE, POST archive, POST retry), einer Client-Komponente `CatalogTable` mit Tabs/Suche/Pagination und einem Edit-Sheet.

Das einzige technisch nicht-triviale Element ist der Hard-Delete: neun S3-Objekte müssen atomisch gelöscht werden (`DeleteObjectsCommand` — Batch-Variante, nicht `DeleteObjectCommand`). Fehlt ein Objekt in S3, darf der DB-Delete trotzdem durchgeführt werden (best-effort S3-Cleanup).

**Primäre Empfehlung:** Daten beim ersten Page-Load einmalig vollständig laden (`GET /api/parts` ohne Pagination-Parameter), dann alle Filter/Pagination client-seitig in React State durchführen. Bei 1000+ Teilen ist dies Phase 10 vorzubehalten (D-04, CONTEXT.md).

Ein wichtiger Infrastruktur-Gap: Der `Toaster` aus `src/components/ui/sonner.tsx` ist **noch nicht im Root-Layout** (`src/app/layout.tsx`) gemountet. Wave 0 muss das nachholen, bevor Sonner-Toasts funktionieren.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Alle Teile auflisten | API / Backend | — | DB-Query läuft server-seitig; Daten sind nicht öffentlich |
| Client-seitige Filterung (Tabs, Suche) | Browser / Client | — | Synchrones Filtern in-memory ohne Server-Roundtrip (D-04) |
| Client-seitige Pagination | Browser / Client | — | React State, kein URL-Param (UI-SPEC) |
| Metadaten-Bearbeitung (Sheet) | Browser / Client + API | — | Form client-seitig; PATCH server-seitig |
| Archivieren (Soft-Delete) | API / Backend | — | DB-UPDATE, kein S3-Zugriff |
| Hard-Delete (DB + S3) | API / Backend | — | S3-Client und DB-Client sind server-only |
| Retry | API / Backend | — | Worker-Enqueue über HTTP, server-only |
| Thumbnail-Anzeige in Tabelle | Browser / Client | API (Presigned URL) | `<img loading="lazy">` nutzt bestehenden Thumbnail-Endpunkt |
| Thumbnail-Anzeige im Sheet | Browser / Client | API (Presigned URL) | Identisch — bestehender `/api/parts/[id]/thumbnail`-Endpunkt |
| Sonner-Toasts | Browser / Client | — | `toast()` aus `sonner`-Paket, Client-seitig |

---

## Standard Stack

### Core

| Library | Version | Zweck | Warum Standard |
|---------|---------|-------|----------------|
| Next.js App Router | ^16.1.1 | Page Route `/admin`, API Routes | Bereits installiert [VERIFIED: package.json] |
| @neondatabase/serverless | ^1.1.0 | Tagged-Template SQL via `db` | Established Pattern — `src/lib/db.ts` [VERIFIED: codebase] |
| @aws-sdk/client-s3 | ^3.1045.0 | `DeleteObjectsCommand` für Hard-Delete | Bereits installiert, `src/lib/s3.ts` vorhanden [VERIFIED: package.json] |
| zod | ^4.3.5 | Validierung aller API-Inputs | Established Pattern — alle bestehenden Routes [VERIFIED: codebase] |
| react-hook-form | ^7.71.1 | Edit-Sheet-Formular | Established Pattern — UploadForm.tsx [VERIFIED: codebase] |
| @hookform/resolvers | ^5.2.2 | Zod-Resolver für react-hook-form | Established Pattern [VERIFIED: package.json] |
| sonner | ^2.0.7 | Error-Toasts | Installiert, `src/components/ui/sonner.tsx` vorhanden [VERIFIED: codebase] |
| lucide-react | ^0.562.0 | Icons (MoreHorizontal, RotateCcw) | Established Pattern [VERIFIED: package.json] |

### shadcn/ui Komponenten (alle bereits installiert)

| Komponente | Datei | Phase-5-Verwendung |
|------------|-------|-------------------|
| table | `src/components/ui/table.tsx` | Hauptliste (D-01) |
| tabs | `src/components/ui/tabs.tsx` | Status-Filter (D-05) |
| pagination | `src/components/ui/pagination.tsx` | 20 Zeilen pro Seite (D-02) |
| dropdown-menu | `src/components/ui/dropdown-menu.tsx` | Aktionen pro Zeile (D-03) |
| sheet | `src/components/ui/sheet.tsx` | Metadaten-Bearbeitung (D-07) |
| alert-dialog | `src/components/ui/alert-dialog.tsx` | Löschen-Bestätigung (D-11) |
| badge | `src/components/ui/badge.tsx` | Status-Badges |
| skeleton | `src/components/ui/skeleton.tsx` | Thumbnail-Loading-State |
| form | `src/components/ui/form.tsx` | Edit-Sheet-Formular |
| input | `src/components/ui/input.tsx` | Suchfeld, Formularfelder |
| select | `src/components/ui/select.tsx` | Status-Select im Sheet |
| button | `src/components/ui/button.tsx` | Aktionen, Submit |
| separator | `src/components/ui/separator.tsx` | DropdownMenuSeparator |

[VERIFIED: codebase — `ls src/components/ui/`]

**Keine neuen shadcn-Komponenten müssen installiert werden.**

### Installation

Keine neuen Pakete erforderlich. Alle Dependencies sind bereits in `package.json` vorhanden.

---

## Architecture Patterns

### System Architecture Diagram

```
Browser (Client Component: CatalogTable)
  │
  │─── Page Load ──────────────────────→  GET /api/parts
  │                                            │
  │                                            ↓
  │                                    Neon DB: SELECT * FROM parts
  │                                            │
  │ ←── JSON Array (alle Teile) ───────────────┘
  │
  │─── Tab/Suche/Pagination ──→ React State Filter (client-side, kein Server)
  │
  │─── "Bearbeiten" Klick ────→  Sheet öffnet, Formular füllt sich
  │      │
  │      │─── Speichern ────────→  PATCH /api/parts/[id]
  │      │                              │
  │      │                              ↓
  │      │                        DB: UPDATE parts SET ...
  │      │                              │
  │      │←── 200 OK ───────────────────┘
  │      │     (optimistic: local state bereits aktualisiert)
  │
  │─── "Archivieren" ─────────→  POST /api/parts/[id]/archive
  │                                    │
  │                                    ↓
  │                              DB: UPDATE parts SET status='archived'
  │
  │─── "Löschen" (confirm) ───→  DELETE /api/parts/[id]
  │                                    │
  │                                    ├─→ S3: DeleteObjects (parts-steps + parts-thumbnails)
  │                                    │
  │                                    └─→ DB: DELETE FROM parts WHERE id=...
  │
  │─── "↺ Neu starten" ───────→  POST /api/parts/[id]/retry
  │                                    │
  │                                    ├─→ DB: UPDATE parts SET status='pending'
  │                                    │
  │                                    └─→ HTTP POST WORKER_URL/enqueue
```

### Empfohlene Projektstruktur

```
src/
  app/
    admin/
      page.tsx            # Server Component — lädt KEINE Daten (Daten via Client fetch)
      CatalogTable.tsx    # 'use client' — Haupt-Client-Komponente (Tabs, Suche, Tabelle, Sheet)
    api/
      parts/
        route.ts          # GET /api/parts (neu)
        [id]/
          route.ts        # PATCH (Metadaten), DELETE (Hard-Delete) — neue HTTP-Methoden
          archive/
            route.ts      # POST /api/parts/[id]/archive (neu)
          retry/
            route.ts      # POST /api/parts/[id]/retry (neu)
          status/
            route.ts      # ← bereits vorhanden (Phase 4)
          thumbnail/
            route.ts      # ← bereits vorhanden (Phase 4)
```

### Pattern 1: GET /api/parts — Alle Teile abrufen

**Was:** Ein einzelner API-Endpunkt gibt alle `parts`-Zeilen zurück (kein server-seitiges Paging). Alle Filterung und Pagination erfolgt client-seitig.

**Wann:** Beim initialen Page-Load der `/admin`-Seite.

```typescript
// src/app/api/parts/route.ts
// GET /api/parts — ADMIN-01: Alle Teile für Admin-Katalog
// Server-only — KEIN "use client", keine Browser-Imports.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(): Promise<NextResponse> {
  const rows = await db`
    SELECT id, name, part_number, project, status, thumbnail_count, created_at
    FROM parts
    ORDER BY created_at DESC
  `
  // embedding wird nicht zurückgegeben (768-dim, zu groß für Admin-UI)
  return NextResponse.json({ parts: rows })
}
```
[ASSUMED — konkretes SQL auf Basis der verifizierter Tabellenspalten aus `001_parts_schema.sql`]

### Pattern 2: PATCH /api/parts/[id] — Metadaten aktualisieren

**Was:** Partial-Update von Name, Teilenummer, Projekt, Status. Zod validiert, UUID wird zuerst geprüft.

```typescript
// src/app/api/parts/[id]/route.ts
// PATCH /api/parts/[id] — ADMIN-02
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'

const ParamsSchema = z.object({ id: z.string().uuid() })

const PatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  part_number: z.string().max(100).nullable().optional(),
  project: z.string().max(200).nullable().optional(),
  status: z.enum(['pending', 'processing', 'ready', 'failed']).optional(),
  // 'archived' ist hier NICHT erlaubt — Archivierung erfolgt via /archive-Route
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params
  const parsed = ParamsSchema.safeParse({ id })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }
  // ... Body parsen, Felder updaten
}
```
[ASSUMED — Pattern konsistent mit bestehenden Routes]

### Pattern 3: DELETE /api/parts/[id] — Hard-Delete (DB + S3)

**Was:** Zuerst S3-Objekte löschen (best-effort), dann DB-Zeile. `DeleteObjectsCommand` löscht bis zu 1000 Keys in einem Request.

```typescript
// src/app/api/parts/[id]/route.ts — DELETE-Handler
import { DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { s3, BUCKET_STEPS, BUCKET_THUMBNAILS } from '@/lib/s3'

// S3-Keys für ein Part:
// parts-steps:       {part_id}/original.step          (1 Objekt)
// parts-thumbnails:  {part_id}/view_0.png ... view_7.png (8 Objekte)
const keysToDelete = [
  { Key: `${id}/original.step` },
  ...Array.from({ length: 8 }, (_, i) => ({ Key: `${id}/view_${i}.png` })),
]

// Batch-Delete in einem Request (max 1000 Keys — hier 9 Keys, weit unter Limit)
await s3.send(new DeleteObjectsCommand({
  Bucket: BUCKET_STEPS,
  Delete: { Objects: [{ Key: `${id}/original.step` }], Quiet: true },
}))
await s3.send(new DeleteObjectsCommand({
  Bucket: BUCKET_THUMBNAILS,
  Delete: {
    Objects: Array.from({ length: 8 }, (_, i) => ({ Key: `${id}/view_${i}.png` })),
    Quiet: true,
  },
}))

// DB-Delete — erst NACH S3 (Waisen-Daten in S3 sind besser als Daten ohne S3-Cleanup)
await db`DELETE FROM parts WHERE id = ${id}`
```
[VERIFIED: `DeleteObjectsCommand` aus `@aws-sdk/client-s3` ist im installierten Paket enthalten — `package.json` zeigt `@aws-sdk/client-s3: ^3.1045.0`]

### Pattern 4: POST /api/parts/[id]/retry — Worker-Enqueue

**Was:** Identisches Muster zu `src/app/api/upload/confirm/route.ts` — DB-Status auf 'pending' setzen, dann `WORKER_URL/enqueue` aufrufen.

```typescript
// Analog zu confirm/route.ts:
await db`UPDATE parts SET status = 'pending' WHERE id = ${id}`

const workerUrl = process.env.WORKER_URL
if (workerUrl) {
  await fetch(`${workerUrl}/enqueue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ part_id: id }),
  })
}
return NextResponse.json({ part_id: id, status: 'pending' }, { status: 202 })
```
[VERIFIED: `confirm/route.ts` zeigt das identische Enqueue-Muster]

### Pattern 5: Optimistic Updates in CatalogTable

**Was:** Bei Archive/Delete/Retry wird der lokale React-State sofort aktualisiert, bevor die API-Response eintrifft. Bei API-Fehler wird der State zurückgesetzt und ein Sonner-Toast ausgelöst.

```typescript
// Archivieren — Optimistic Pattern:
const handleArchive = async (id: string) => {
  // 1. Optimistic: State sofort aktualisieren
  setParts(prev => prev.map(p => p.id === id ? { ...p, status: 'archived' } : p))

  try {
    const res = await fetch(`/api/parts/${id}/archive`, { method: 'POST' })
    if (!res.ok) throw new Error('Archive failed')
  } catch {
    // 2. Rollback bei Fehler
    setParts(prev => prev.map(p => p.id === id ? { ...p, status: originalStatus } : p))
    toast.error('Archivieren fehlgeschlagen. Bitte erneut versuchen.')
  }
}
```
[ASSUMED — Standard-React-Pattern für optimistic updates]

### Pattern 6: Sonner-Toast Usage

**Was:** `toast()` und `toast.error()` aus dem `sonner`-Paket. Wichtig: `Toaster`-Komponente muss im Layout gemountet sein.

```typescript
// In Client-Komponenten:
import { toast } from 'sonner'

// Erfolg:
toast.success('Änderungen gespeichert.')

// Fehler:
toast.error('Archivieren fehlgeschlagen. Bitte erneut versuchen.')
```

**KRITISCH:** `src/app/layout.tsx` enthält aktuell KEINEN `<Toaster>`-Mount. Wave 0 muss das nachholen:
```tsx
// src/app/layout.tsx — ergänzen:
import { Toaster } from '@/components/ui/sonner'

// In der Body:
<body className="antialiased">
  {children}
  <Toaster />
</body>
```
[VERIFIED: `src/app/layout.tsx` gelesen — kein `<Toaster>` vorhanden]
[VERIFIED: `src/components/ui/sonner.tsx` existiert und exportiert `Toaster`]

### Anti-Patterns vermeiden

- **Kein `'use server'` in API Routes** — Next.js App Router API Routes sind bereits server-seitig
- **Kein `NEXT_PUBLIC_`-Prefix für WORKER_URL, AWS_* Variablen** — bereits als Constraint etabliert
- **Kein `sql`-Import aus neon** — immer `db` aus `@/lib/db` (Established Pattern)
- **Kein Custom-Select-Primitive** — `src/components/ui/select.tsx` verwenden
- **Kein `DeleteObjectCommand` (singular)** für Multi-Key-Delete — `DeleteObjectsCommand` (plural) ist die Batch-Variante
- **Kein Status='archived' im PATCH-Endpunkt** — Archivierung nur via `/archive`-Sub-Route (D-10)

---

## Don't Hand-Roll

| Problem | Nicht selbst bauen | Stattdessen nutzen | Warum |
|---------|-------------------|-------------------|-------|
| Formular-Validierung | Custom onChange-Validierung | react-hook-form + zodResolver | Established Pattern (UploadForm.tsx), Fehler-Reset, Dirty-State |
| Debounce-Logik | `setTimeout` manuell mit Ref | `useCallback` + `useRef` mit clearTimeout-Pattern | Einfach genug ohne externe Lib |
| Toast-Nachrichten | Eigene Toast-Komponente | `toast()` aus `sonner` | Bereits installiert, `sonner.tsx` vorhanden |
| UUID-Validierung | Regex im Route-Handler | `z.string().uuid()` Zod | Established Pattern — alle bisherigen Routes |
| S3 Multi-Delete | Sequenzielle `DeleteObjectCommand` | `DeleteObjectsCommand` (Batch) | Ein HTTP-Request statt neun, atomarer Fehlerfall |
| Status-Badge-Rendering | if/else-Kaskade inline | `StatusBadge`-Utility-Komponente | Wiederverwendbar in Tabelle und Sheet |

---

## Common Pitfalls

### Pitfall 1: `Toaster` fehlt im Root-Layout

**Was schiefgeht:** `toast.error(...)` wird aufgerufen, aber nichts erscheint im Browser. Kein Fehler in der Konsole.
**Warum:** `sonner` benötigt eine `<Toaster />`-Instanz im DOM-Tree. `src/app/layout.tsx` enthält sie aktuell nicht.
**Vermeiden:** Wave-0-Plan muss `<Toaster />` in `src/app/layout.tsx` ergänzen.
**Warnsignal:** Toast-Tests schlagen lautlos fehl; Manuelle Tests zeigen keine Toast-Anzeige.

### Pitfall 2: `DeleteObjectCommand` (singular) statt `DeleteObjectsCommand` (plural)

**Was schiefgeht:** 9 sequenzielle S3-DELETE-Requests statt einem Batch-Request. Bei Netzwerkunterbrechung nach dem ersten Delete entstehen Waisen-Objekte in S3.
**Warum:** Beide Commands sind im SDK. Der singular-Command ist für einzelne Keys, der Plural-Command für Batches.
**Vermeiden:** `DeleteObjectsCommand` mit `Delete.Objects`-Array verwenden, `Quiet: true` um leere Errors zu unterdrücken.

### Pitfall 3: Optimistic Update ohne Rollback

**Was schiefgeht:** Zeile verschwindet aus Tabelle, API-Call schlägt fehl, Zeile ist dauerhaft weg aus der UI.
**Warum:** `setParts(prev => prev.filter(...))` ohne Backup des gelöschten Items.
**Vermeiden:** Original-State sichern vor optimistic Update; bei Fehler wiederherstellen + Toast zeigen.

### Pitfall 4: Status 'archived' im PATCH-Schema erlauben

**Was schiefgeht:** Über das Edit-Sheet kann ein Admin `status='archived'` setzen, obwohl D-10 Archivierung als dedizierte Aktion definiert.
**Warum:** PATCH-Zod-Schema zu permissiv.
**Vermeiden:** `z.enum(['pending', 'processing', 'ready', 'failed'])` ohne 'archived' im PATCH-Schema.

### Pitfall 5: `params` in Next.js 16 ist ein Promise

**Was schiefgeht:** `params.id` ist `undefined` bei direktem Zugriff ohne `await`.
**Warum:** Next.js 16 ändert `params` zu einem async Promise (bereits in Phase 4 gehandhabt).
**Vermeiden:** `const { id } = await params` — identisch zu `status/route.ts` und `thumbnail/route.ts`.

### Pitfall 6: S3-Löschung vor DB-Löschung — falsche Reihenfolge

**Was schiefgeht:** DB-Delete schlägt fehl nach S3-Delete: Daten existieren in DB aber S3-Objekte sind weg.
**Warum:** Die Reihenfolge der Operationen bestimmt die Richtung der Inkonsistenz.
**Vermeiden:** S3-Delete erst, dann DB-Delete. S3-Waisen (nicht referenzierte Objekte) sind harmloser als DB-Einträge die auf nicht-existierende S3-Objekte zeigen. Bei S3-Fehlern (z.B. Objekt existiert nicht): fortfahren mit DB-Delete (best-effort).

### Pitfall 7: Thumbnail-Fetch für jeden sichtbaren Table-Row

**Was schiefgeht:** 20 parallele Presigned-URL-Requests beim Page-Load (eine pro sichtbarer Zeile mit status='ready').
**Warum:** `GET /api/parts/[id]/thumbnail` erzeugt jeweils einen S3-HeadObject + GetObject-Presign-Aufruf.
**Vermeiden:** `loading="lazy"` auf `<img>` — Browser lädt Thumbnails erst wenn sie sichtbar sind. Ist bereits in UI-SPEC vorgegeben.

### Pitfall 8: CatalogTable als Server Component

**Was schiefgeht:** useState, useEffect, DropdownMenu, Sheet, etc. funktionieren nicht in Server Components.
**Warum:** Interaktive Elemente erfordern `'use client'`.
**Vermeiden:** `CatalogTable.tsx` muss `'use client'` als ersten Ausdruck haben. `/admin/page.tsx` kann ein Server Component sein (Shell), das CatalogTable einbettet.

---

## Code Examples

### Verifizierte Patterns aus dem bestehenden Code

#### UUID-Validierung (aus `src/app/api/parts/[id]/status/route.ts`)

```typescript
// Identisches Pattern für alle neuen [id]-Routes:
const ParamsSchema = z.object({
  id: z.string().uuid('id muss eine gültige UUID sein'),
})

const { id } = await params

const parsed = ParamsSchema.safeParse({ id })
if (!parsed.success) {
  return NextResponse.json(
    { error: 'Invalid id', details: parsed.error.flatten() },
    { status: 400 }
  )
}
```
[VERIFIED: `src/app/api/parts/[id]/status/route.ts`]

#### Worker-Enqueue (aus `src/app/api/upload/confirm/route.ts`)

```typescript
const workerUrl = process.env.WORKER_URL
if (workerUrl) {
  let workerResponse: Response
  try {
    workerResponse = await fetch(`${workerUrl}/enqueue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ part_id }),
    })
  } catch {
    return NextResponse.json(
      { error: 'Worker enqueue failed', detail: 'Worker unreachable' },
      { status: 502 }
    )
  }
  if (!workerResponse.ok) {
    return NextResponse.json({ error: 'Worker enqueue failed' }, { status: 502 })
  }
}
return NextResponse.json({ part_id, status: 'pending' }, { status: 202 })
```
[VERIFIED: `src/app/api/upload/confirm/route.ts`]

#### S3-Client-Initialisierung (aus `src/lib/s3.ts`)

```typescript
import { s3, BUCKET_STEPS, BUCKET_THUMBNAILS } from '@/lib/s3'
// s3 ist ein S3Client mit forcePathStyle für lokale Dev-Endpoints
// BUCKET_STEPS = process.env.AWS_S3_BUCKET_STEPS
// BUCKET_THUMBNAILS = process.env.AWS_S3_BUCKET_THUMBNAILS
```
[VERIFIED: `src/lib/s3.ts`]

#### Status-Badge-Farbmapping (aus `src/app/upload/UploadForm.tsx`)

```tsx
// Exaktes Muster aus Phase 4 — NICHT abweichen (UI-SPEC Color-Mapping):
{status === 'ready' && (
  <Badge className="text-green-700 bg-green-50 border-green-200 hover:bg-green-50">Bereit</Badge>
)}
{status === 'pending' && (
  <Badge variant="secondary">Ausstehend</Badge>
)}
{status === 'processing' && (
  <Badge variant="outline" className="text-blue-600 border-blue-300">Wird verarbeitet…</Badge>
)}
{status === 'failed' && (
  <Badge variant="destructive">Fehlgeschlagen</Badge>
)}
{status === 'archived' && (
  <Badge variant="outline" className="text-muted-foreground border-border">Archiviert</Badge>
)}
```
[VERIFIED: `src/app/upload/UploadForm.tsx` + `05-UI-SPEC.md`]

---

## Datenbankschema-Referenz

Alle relevanten Spalten der `parts`-Tabelle (aus Migrations):

| Spalte | Typ | Relevanz für Phase 5 |
|--------|-----|---------------------|
| `id` | uuid PK | Alle Route-Parameter |
| `name` | text NOT NULL | ADMIN-01 (Anzeige), ADMIN-02 (Edit) |
| `part_number` | text nullable | ADMIN-01 (Anzeige), ADMIN-02 (Edit) |
| `project` | text nullable | ADMIN-01 (Anzeige), ADMIN-02 (Edit) |
| `status` | text NOT NULL | ADMIN-01 (Tab-Filter + Badge), ADMIN-02 (Select), ADMIN-03, ADMIN-04 |
| `thumbnail_count` | integer default 0 | ADMIN-01 (Thumbnail-Entscheidung: status='ready' UND count>0) |
| `created_at` | timestamptz | ADMIN-01 (Anzeige, Sortierung) |
| `updated_at` | timestamptz | Wird via Trigger automatisch gesetzt |
| `is_archived` | boolean default false | **NICHT VERWENDET in Phase 5** — Phase 5 nutzt `status='archived'` (D-10) |

**Kritische Anmerkung:** Die Tabelle hat sowohl `is_archived` (boolean, Phase 1) als auch Status-basiertes Archivieren (D-10 in Phase 5). Die Entscheidung D-10 definiert Archivieren als `status='archived'`. Das `is_archived`-Boolean-Feld wird in Phase 5 NICHT geschrieben — nur `status` wird manipuliert. Phase 6 (Search Pipeline) muss `WHERE status = 'ready'` filtern, nicht `WHERE is_archived = false`.

[VERIFIED: `supabase/migrations/001_parts_schema.sql`, `05-CONTEXT.md` D-10]

---

## Downstream-Constraint für Phase 6

**WICHTIG für den Planner zu dokumentieren:** Phase 6 (Search Pipeline) MUSS `WHERE status = 'ready'` als Filter verwenden. Archivierte Teile haben `status='archived'` und dürfen nicht in Suchergebnissen erscheinen. Phase 6 darf NICHT `WHERE is_archived = false` verwenden.

[ASSUMED — logische Konsequenz aus D-10; Planner muss dies als Constraint in Phase 6 vermerken]

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js API Routes | ✓ | (Darwin 25.4.0 Host) | — |
| @aws-sdk/client-s3 | Hard-Delete (ADMIN-03) | ✓ | ^3.1045.0 | — |
| @neondatabase/serverless | Alle DB-Operationen | ✓ | ^1.1.0 | — |
| sonner | Toasts | ✓ | ^2.0.7 | — |
| Neon DB (live) | Integrations-Tests | [ASSUMED: verfügbar] | — | `.env.local` muss DATABASE_URL haben |
| AWS S3 (live) | Hard-Delete-Test | [ASSUMED: verfügbar] | — | Mocks in Unit-Tests |

[VERIFIED: `package.json` für alle npm-Pakete]

**Keine blockierenden Abhängigkeiten.** Alle Pakete sind installiert.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest ^4.1.2 |
| Config file | `vitest.config.ts` |
| Quick run command | `npm test -- --run` |
| Full suite command | `npm test` |
| E2E | Playwright (`npm run test:e2e`) |

### Phase Requirements → Test Map

| Req ID | Verhalten | Test-Typ | Automatisierter Befehl | Datei vorhanden? |
|--------|-----------|----------|----------------------|-----------------|
| ADMIN-01 | GET /api/parts gibt alle Teile zurück | unit | `npm test -- --run src/app/api/parts/route.test.ts` | ❌ Wave 0 |
| ADMIN-01 | GET /api/parts gibt HTTP 400 bei ungültiger UUID zurück | unit | `npm test -- --run src/app/api/parts/route.test.ts` | ❌ Wave 0 |
| ADMIN-02 | PATCH /api/parts/[id] aktualisiert Metadaten | unit | `npm test -- --run src/app/api/parts/[id]/route.test.ts` | ❌ Wave 0 |
| ADMIN-02 | PATCH lehnt status='archived' ab | unit | `npm test -- --run src/app/api/parts/[id]/route.test.ts` | ❌ Wave 0 |
| ADMIN-03 | POST /api/parts/[id]/archive setzt status='archived' | unit | `npm test -- --run src/app/api/parts/[id]/archive/route.test.ts` | ❌ Wave 0 |
| ADMIN-03 | DELETE /api/parts/[id] löscht DB-Zeile | unit | `npm test -- --run src/app/api/parts/[id]/route.test.ts` | ❌ Wave 0 |
| ADMIN-03 | DELETE ruft S3 DeleteObjectsCommand auf | unit | `npm test -- --run src/app/api/parts/[id]/route.test.ts` | ❌ Wave 0 |
| ADMIN-04 | POST /api/parts/[id]/retry setzt status='pending' + enqueued | unit | `npm test -- --run src/app/api/parts/[id]/retry/route.test.ts` | ❌ Wave 0 |
| ADMIN-01 | Tabelle zeigt alle Teile mit korrekten Badges | smoke (E2E) | `npm run test:e2e` | ❌ Wave 0 |

### Sampling Rate

- **Pro Task-Commit:** `npm test -- --run <betroffene Testdatei>`
- **Pro Wave-Merge:** `npm test` (vollständige Vitest-Suite)
- **Phase Gate:** Vollständige Suite grün vor `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/app/api/parts/route.test.ts` — Test-Stubs für ADMIN-01
- [ ] `src/app/api/parts/[id]/route.test.ts` — Test-Stubs für ADMIN-02 (PATCH) und ADMIN-03 (DELETE)
- [ ] `src/app/api/parts/[id]/archive/route.test.ts` — Test-Stubs für ADMIN-03 (archive)
- [ ] `src/app/api/parts/[id]/retry/route.test.ts` — Test-Stubs für ADMIN-04
- [ ] `tests/admin-catalog.spec.ts` — Playwright E2E Smoke-Test (optional, kann in Wave 4 fallen)

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | nein | Kein Auth in Pilot (RLS deaktiviert per D-06) |
| V3 Session Management | nein | Kein Auth in Pilot |
| V4 Access Control | nein | Kein Auth in Pilot |
| V5 Input Validation | ja | Zod `z.string().uuid()` als erste Operation in allen [id]-Routes |
| V6 Cryptography | nein | Kein kryptographischer Code in dieser Phase |

### Known Threat Patterns

| Pattern | STRIDE | Standard-Mitigation |
|---------|--------|---------------------|
| Path-Traversal via `part_id` in S3-Key | Tampering | `z.string().uuid()` validiert vor S3-Key-Konstruktion — Established Pattern |
| SQL-Injection via Benutzereingaben | Tampering | Tagged-Template `db` verhindert Injection strukturell |
| Zu große Strings in PATCH-Body | Tampering/DoS | Zod `z.string().max(200)` etc. auf alle Edit-Felder |
| NEXT_PUBLIC_ für Server-Secrets | Information Disclosure | Alle neuen Env-Vars ohne NEXT_PUBLIC_ Prefix |

---

## Assumptions Log

| # | Claim | Section | Risiko bei Falschheit |
|---|-------|---------|----------------------|
| A1 | `GET /api/parts` gibt Daten vollständig ohne Pagination zurück (kein Cursor/Offset) | Architecture Patterns | Falls Neon Row-Limit hat: leere Response oder Truncation — in Phase 10 adressieren |
| A2 | `is_archived`-Spalte wird in Phase 5 nicht beschrieben; Status='archived' ist die alleinige Archivierungs-Wahrheit | DB-Schema-Referenz | Falls Phase 6 auf `is_archived` prüft, erscheinen archivierte Teile trotzdem in Suche — Cross-Phase-Bug |
| A3 | Neon DB ist über DATABASE_URL erreichbar in der lokalen Entwicklungsumgebung | Environment Availability | Unit-Tests mocken DB; nur Integrations-Tests (db.test.ts) benötigen Live-DB |
| A4 | Der Retry-Endpoint setzt `status='pending'` in DB BEVOR er den Worker aufruft | Architecture Patterns | Falls Worker-Call zuerst und er schlägt fehl: Status bleibt 'failed' (sicher); falls DB zuerst und Worker schlägt fehl: Status ist 'pending' aber kein Job in Queue (Zombie) — DB-Update danach ist sicherer |

**Kritische Assumption A4:** Die Reihenfolge DB-Update → Worker-Enqueue ist sicherer als Worker → DB. Bei Worker-Ausfall mit DB-First hat der Admin die Möglichkeit, Retry erneut auszulösen, wenn der Status auf 'pending' verbleibt und der Worker nie antwortet. Im confirm/route.ts ist die Reihenfolge ebenfalls: DB-Existenz-Check → Worker-Enqueue (DB-Write implizit beim Init). Für Retry: erst DB auf 'pending' setzen, dann Worker-Call. [ASSUMED]

---

## Open Questions

1. **`is_archived`-Boolean vs. `status='archived'`-Dualität**
   - Was bekannt ist: Die DB hat beide Felder. D-10 definiert Archivieren als `status='archived'`.
   - Was unklar ist: Werden zukünftige Phasen `is_archived` nutzen oder ist es ein veraltetes Schema-Element?
   - Empfehlung: Planner dokumentiert als Constraint für Phase 6: nur `status` als Archivierungs-Signal. Das `is_archived`-Feld nicht beschreiben in Phase 5.

2. **Datums-Formatierung clientseitig**
   - Was bekannt ist: UI-SPEC fordert `dd.MM.yyyy HH:mm` (z.B. "09.05.2026 14:32")
   - Was unklar ist: Ob `date-fns` oder `Intl.DateTimeFormat` zu verwenden ist
   - Empfehlung: `Intl.DateTimeFormat('de-DE', { ... })` — keine zusätzliche Dependency. `date-fns` ist nicht installiert.

---

## Sources

### Primary (HIGH confidence)
- `src/lib/db.ts` — Neon Tagged-Template-Pattern
- `src/lib/s3.ts` — S3-Client, Bucket-Konstanten, forcePathStyle
- `src/app/api/upload/confirm/route.ts` — Worker-Enqueue-Muster (Retry-Referenz)
- `src/app/api/parts/[id]/status/route.ts` — UUID-Validierungs-Pattern, params-as-Promise
- `src/app/api/parts/[id]/thumbnail/route.ts` — S3-Presign-Muster, HeadObject-Prüfung
- `src/app/upload/UploadForm.tsx` — react-hook-form + Zod + Status-Badge-Farbmapping
- `src/hooks/use-part-status.ts` — Polling-Hook (ggf. wiederverwendbar für Tabellen-Refresh)
- `supabase/migrations/001_parts_schema.sql` — `parts`-Tabellen-Schema inkl. `is_archived`, `status`
- `supabase/migrations/002_add_thumbnail_count.sql` — `thumbnail_count`-Spalte
- `package.json` — alle Paket-Versionen
- `.planning/phases/05-admin-catalog/05-CONTEXT.md` — Gesperrte Entscheidungen D-01 bis D-12
- `.planning/phases/05-admin-catalog/05-UI-SPEC.md` — Vollständiger Komponenten-Inventar, Copywriting, URL-Entscheidungen
- `src/app/layout.tsx` — Fehlender Toaster-Mount (Gap identifiziert)
- `src/components/ui/sonner.tsx` — Toaster-Komponente vorhanden

### Secondary (MEDIUM confidence)
- `@aws-sdk/client-s3` `DeleteObjectsCommand` — Batch-Delete für mehrere Keys [ASSUMED: im installierten Paket verfügbar, da PutObjectCommand, GetObjectCommand, HeadObjectCommand alle bereits verwendet werden]

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — alle Pakete aus package.json verifiziert, alle shadcn-Komponenten aus ls bestätigt
- Architecture: HIGH — direkt aus bestehendem Code-Muster abgeleitet
- Pitfalls: HIGH — aus tatsächlichem Code-Gap (Toaster fehlt in layout.tsx) und etablierten Patterns
- DB-Schema: HIGH — aus migrations-Dateien direkt gelesen

**Research date:** 2026-05-09
**Valid until:** 2026-06-09 (stable stack — keine fast-moving Dependencies)
