# Phase 5: Admin Catalog — Pattern Map

**Mapped:** 2026-05-09
**Files analyzed:** 8 new/modified files
**Analogs found:** 8 / 8

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/app/layout.tsx` | layout | — | `src/app/layout.tsx` (self) | exact (additive change) |
| `src/app/admin/page.tsx` | page (Server Component shell) | request-response | `src/app/upload/page.tsx` | exact |
| `src/app/admin/CatalogTable.tsx` | component (Client) | CRUD + event-driven | `src/app/upload/UploadForm.tsx` | role-match |
| `src/app/api/parts/route.ts` | API route | CRUD (read) | `src/app/api/parts/[id]/status/route.ts` | exact |
| `src/app/api/parts/[id]/route.ts` | API route | CRUD (update + delete) | `src/app/api/parts/[id]/status/route.ts` + `src/lib/s3.ts` | role-match |
| `src/app/api/parts/[id]/archive/route.ts` | API route | CRUD (update) | `src/app/api/parts/[id]/status/route.ts` | exact |
| `src/app/api/parts/[id]/retry/route.ts` | API route | request-response + event-driven | `src/app/api/upload/confirm/route.ts` | exact |

---

## Pattern Assignments

### `src/app/layout.tsx` (layout — additive Toaster-Mount)

**Analog:** `src/app/layout.tsx` (Selbst — minimale Ergänzung)

**Aktueller Zustand** (Zeilen 1–21) — NUR additive Änderung:
```tsx
import type { Metadata } from "next";
import "./globals.css";
// NEU hinzufügen:
import { Toaster } from "@/components/ui/sonner"

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
        <Toaster />   {/* NEU — muss NACH {children} stehen */}
      </body>
    </html>
  );
}
```

**Kritisch:** Ohne `<Toaster />` im DOM werden alle `toast.success()` / `toast.error()` Aufrufe lautlos ignoriert — kein Fehler in der Konsole (Pitfall 1 aus RESEARCH.md).

---

### `src/app/admin/page.tsx` (page, Server Component)

**Analog:** `src/app/upload/page.tsx`

**Imports-Pattern** (Zeilen 1–4):
```tsx
// src/app/upload/page.tsx Zeilen 1-4 — identisches Muster:
import type { Metadata } from 'next'
import { UploadForm } from './UploadForm'
```

**Core-Pattern** (Zeilen 6–21) — Server Component als dünne Shell:
```tsx
// src/app/upload/page.tsx — gesamte Datei:
// KEIN "use client" — UploadForm ist Client Component, page.tsx bleibt server-side.

import type { Metadata } from 'next'
import { UploadForm } from './UploadForm'

export const metadata: Metadata = {
  title: 'STEP-Datei hochladen — Bauteil-Finder',
}

export default function UploadPage() {
  return (
    <main className="min-h-screen bg-background py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold mb-8">STEP-Datei hochladen</h1>
        <UploadForm />
      </div>
    </main>
  )
}
```

**Für Admin-Page anpassen:**
- `title`: `'Teile-Katalog — Bauteil-Finder'`
- `h1`-Text: `'Teile-Katalog'` (`text-lg font-semibold` — UI-SPEC Heading-Token)
- Importierter Client: `CatalogTable` statt `UploadForm`
- `max-w-*`: `max-w-7xl` (Tabellen brauchen mehr Breite als Upload-Form)
- Header-Row: `h1` + `<Link href="/upload">` Button nebeneinander (flex justify-between)

---

### `src/app/admin/CatalogTable.tsx` (component, Client, CRUD + event-driven)

**Analog:** `src/app/upload/UploadForm.tsx`

**'use client' + Imports-Pattern** (Zeilen 1–21):
```tsx
// src/app/upload/UploadForm.tsx Zeilen 1-21:
'use client'

import { useState, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
```

**react-hook-form + Zod-Resolver-Pattern** (Zeilen 91–94):
```tsx
// src/app/upload/UploadForm.tsx Zeilen 91-94:
const form = useForm<FormValues>({
  resolver: zodResolver(formSchema),
  defaultValues: { name: '', partNumber: '', project: '' },
})
```

**Zod-Schema-Pattern** (Zeilen 42–48):
```tsx
// src/app/upload/UploadForm.tsx Zeilen 42-48 — Muster für Edit-Sheet-Schema:
const formSchema = z.object({
  name: z.string().min(1, 'Bezeichnung ist erforderlich.').max(200),
  partNumber: z.string().max(100).optional(),
  project: z.string().max(200).optional(),
})
type FormValues = z.infer<typeof formSchema>
```

**Status-Badge-Farbmapping** (Zeilen 357–379) — EXAKT kopieren, nicht abweichen:
```tsx
// src/app/upload/UploadForm.tsx Zeilen 357-379 — UI-SPEC Color Contract:
{polledStatus === 'pending' && (
  <Badge variant="secondary">Ausstehend</Badge>
)}
{polledStatus === 'processing' && (
  <Badge variant="outline" className="text-blue-600 border-blue-300">
    Wird verarbeitet…
  </Badge>
)}
{polledStatus === 'ready' && (
  <Badge className="text-green-700 bg-green-50 border-green-200 hover:bg-green-50">
    Bereit
  </Badge>
)}
{polledStatus === 'failed' && (
  <Badge variant="destructive">Fehlgeschlagen</Badge>
)}
// Neu für Phase 5 — archived:
{status === 'archived' && (
  <Badge variant="outline" className="text-muted-foreground border-border">Archiviert</Badge>
)}
```

**Form-Submit-Handler-Pattern** (Zeilen 121–191) — für PATCH im Sheet adaptieren:
```tsx
// src/app/upload/UploadForm.tsx Zeilen 121-191 — Muster für handleSave:
const onSubmit = async (values: FormValues) => {
  try {
    // API-Call
    const res = await fetch('/api/parts/' + partId, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    })
    if (!res.ok) throw new Error('Save failed')
    // Optimistic Update + Toast
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    setErrorMsg(msg)
  }
}
```

**Thumbnail-Skeleton-Pattern** (Zeilen 412–424):
```tsx
// src/app/upload/UploadForm.tsx Zeilen 412-424 — für Sheet-Thumbnail:
{thumbnailUrl ? (
  <img
    src={thumbnailUrl}
    alt="Frontansicht"
    className="w-48 h-48 object-contain rounded-md border"
  />
) : (
  <Skeleton className="w-48 h-48" />
)}
```

**Sonner-Toast-Aufrufe** — für alle Action-Handler:
```tsx
// Aus RESEARCH.md Pattern 6 — in Client-Komponente verwenden:
import { toast } from 'sonner'

toast.success('Änderungen gespeichert.')
toast.error('Archivieren fehlgeschlagen. Bitte erneut versuchen.')
```

**Optimistic-Update-Pattern** — für alle Mutationshandler (archive, delete, retry):
```tsx
// RESEARCH.md Pattern 5 — Standard-Muster:
const handleArchive = async (id: string) => {
  // 1. Originalstatus sichern
  const originalStatus = parts.find(p => p.id === id)?.status
  // 2. Optimistic: State sofort aktualisieren
  setParts(prev => prev.map(p => p.id === id ? { ...p, status: 'archived' } : p))
  try {
    const res = await fetch(`/api/parts/${id}/archive`, { method: 'POST' })
    if (!res.ok) throw new Error('Archive failed')
  } catch {
    // 3. Rollback bei Fehler
    setParts(prev => prev.map(p => p.id === id ? { ...p, status: originalStatus } : p))
    toast.error('Archivieren fehlgeschlagen. Bitte erneut versuchen.')
  }
}
```

**Debounce-Pattern** — für das Suchfeld (300ms, kein externes Paket):
```tsx
// useRef + clearTimeout — kein date-fns, keine externe Debounce-Lib:
const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

const handleSearch = (value: string) => {
  if (debounceRef.current) clearTimeout(debounceRef.current)
  debounceRef.current = setTimeout(() => {
    setSearchQuery(value)
    setCurrentPage(1)  // Pagination auf Seite 1 zurücksetzen
  }, 300)
}
```

**Datum-Formatierung** — `Intl.DateTimeFormat`, kein date-fns (nicht installiert):
```tsx
// RESEARCH.md Open Question 2 — Intl-Lösung:
const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('de-DE', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
// Ausgabe: "09.05.2026, 14:32" → trim ", " zu "09.05.2026 14:32" per replace
```

---

### `src/app/api/parts/route.ts` (API route, CRUD read)

**Analog:** `src/app/api/parts/[id]/status/route.ts`

**Imports-Pattern** (Zeilen 1–9):
```typescript
// src/app/api/parts/[id]/status/route.ts Zeilen 1-9:
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
```

**Core-Pattern** (Zeilen 15–47) — adaptiert für GET ohne params:
```typescript
// src/app/api/parts/[id]/status/route.ts Zeilen 15-47 — Muster für GET /api/parts:
export async function GET(): Promise<NextResponse> {
  // Kein params-Parsing nötig (keine URL-Parameter)
  // Kein Zod-Schema nötig für leeren GET
  const rows = await db`
    SELECT id, name, part_number, project, status, thumbnail_count, created_at
    FROM parts
    ORDER BY created_at DESC
  `
  // embedding NICHT zurückgeben — 768-dim, zu groß für Admin-UI
  return NextResponse.json({ parts: rows })
}
```

**Kommentar-Konvention** — erste Zeile der Datei:
```typescript
// src/app/api/parts/route.ts
// GET /api/parts — ADMIN-01: Alle Teile für Admin-Katalog abrufen
// Server-only — KEIN "use client", keine Browser-Imports.
```

---

### `src/app/api/parts/[id]/route.ts` (API route, CRUD update + delete)

**Analog:** `src/app/api/parts/[id]/status/route.ts` (UUID-Pattern) + `src/lib/s3.ts` (S3-Delete)

**UUID-Validierungs-Pattern** (Zeilen 11–28) — IDENTISCH kopieren:
```typescript
// src/app/api/parts/[id]/status/route.ts Zeilen 11-28:
const ParamsSchema = z.object({
  id: z.string().uuid('id muss eine gültige UUID sein'),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }   // Next.js 16: params ist Promise
): Promise<NextResponse> {
  const { id } = await params

  const parsed = ParamsSchema.safeParse({ id })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid id', details: parsed.error.flatten() },
      { status: 400 }
    )
  }
  // ...
}
```

**Imports für PATCH + DELETE** (zusätzlich zu uuid/db):
```typescript
// PATCH braucht nur db + zod (wie status/route.ts)
// DELETE braucht zusätzlich:
import { DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { s3, BUCKET_STEPS, BUCKET_THUMBNAILS } from '@/lib/s3'
```

**PATCH-Schema** — 'archived' ausschließen (Pitfall 4):
```typescript
// RESEARCH.md Pattern 2 — 'archived' ist bewusst nicht in der Enum:
const PatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  part_number: z.string().max(100).nullable().optional(),
  project: z.string().max(200).nullable().optional(),
  status: z.enum(['pending', 'processing', 'ready', 'failed']).optional(),
  // 'archived' ist NICHT erlaubt — Archivierung nur via /archive-Route (D-10)
})
```

**S3-Imports** (aus `src/lib/s3.ts` Zeilen 1–19):
```typescript
// src/lib/s3.ts — vollständige Datei (20 Zeilen):
import { S3Client } from '@aws-sdk/client-s3'

export const s3 = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
  ...(process.env.DECOMPOSEDS3_ENDPOINT
    ? { endpoint: process.env.DECOMPOSEDS3_ENDPOINT, forcePathStyle: true }
    : {}),
})

export const BUCKET_STEPS = process.env.AWS_S3_BUCKET_STEPS!
export const BUCKET_THUMBNAILS = process.env.AWS_S3_BUCKET_THUMBNAILS!
```

**Hard-Delete S3-Pattern** — DeleteObjectsCommand (Batch, NICHT singular):
```typescript
// RESEARCH.md Pattern 3 — S3 ZUERST löschen, dann DB (Pitfall 6):
// 1. STEP-Datei aus parts-steps Bucket
await s3.send(new DeleteObjectsCommand({
  Bucket: BUCKET_STEPS,
  Delete: {
    Objects: [{ Key: `${id}/original.step` }],
    Quiet: true,  // Unterdrückt leere Error-Responses für nicht existierende Keys
  },
}))

// 2. Thumbnails aus parts-thumbnails Bucket (view_0.png bis view_7.png = 8 Objekte)
await s3.send(new DeleteObjectsCommand({
  Bucket: BUCKET_THUMBNAILS,
  Delete: {
    Objects: Array.from({ length: 8 }, (_, i) => ({ Key: `${id}/view_${i}.png` })),
    Quiet: true,
  },
}))

// 3. DB-Zeile löschen — erst NACH S3 (DB-Waisen = harmloser als S3-Waisen)
await db`DELETE FROM parts WHERE id = ${id}`

return NextResponse.json({ deleted: id })
```

**Not-found-Pattern** (aus `src/app/api/parts/[id]/status/route.ts` Zeilen 38–40):
```typescript
if (rows.length === 0) {
  return NextResponse.json({ error: 'Part not found' }, { status: 404 })
}
```

---

### `src/app/api/parts/[id]/archive/route.ts` (API route, CRUD update/soft-delete)

**Analog:** `src/app/api/parts/[id]/status/route.ts` — identisches Grundmuster

**Vollständiges Pattern** — UUID-Validierung + DB-Update:
```typescript
// src/app/api/parts/[id]/status/route.ts Zeilen 11-47 — adaptiert für POST archive:
const ParamsSchema = z.object({
  id: z.string().uuid('id muss eine gültige UUID sein'),
})

export async function POST(
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

  // Existenz-Check vor Update (aus confirm/route.ts Muster):
  const rows = await db`SELECT id FROM parts WHERE id = ${id} LIMIT 1`
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Part not found' }, { status: 404 })
  }

  // Soft-Delete — setzt nur status, kein S3-Zugriff (D-10)
  // is_archived-Boolean wird NICHT geschrieben (RESEARCH.md DB-Schema-Kritische-Anmerkung)
  await db`UPDATE parts SET status = 'archived' WHERE id = ${id}`

  return NextResponse.json({ id, status: 'archived' })
}
```

---

### `src/app/api/parts/[id]/retry/route.ts` (API route, request-response + event-driven)

**Analog:** `src/app/api/upload/confirm/route.ts` — IDENTISCHES Worker-Enqueue-Muster

**Worker-Enqueue-Pattern** (Zeilen 46–67) — EXAKT kopieren:
```typescript
// src/app/api/upload/confirm/route.ts Zeilen 46-67:
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

**Reihenfolge für Retry** (Assumption A4 aus RESEARCH.md):
```typescript
// ERST DB auf 'pending' setzen, DANN Worker aufrufen:
// Begründung: Falls Worker-Call fehlschlägt, kann Admin den Retry erneut auslösen.
// Falls DB-Update nach Worker schlägt fehl: Worker hat Job ohne DB-Status='pending' (schlimmer).
await db`UPDATE parts SET status = 'pending' WHERE id = ${id}`
// DANN: workerUrl-Check + fetch (identisch zu confirm/route.ts)
```

**Full-Pattern** für retry/route.ts:
```typescript
// UUID-Validierung (wie status/route.ts Zeilen 11-28)
const ParamsSchema = z.object({ id: z.string().uuid('id muss eine gültige UUID sein') })

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params
  const parsed = ParamsSchema.safeParse({ id })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid id', details: parsed.error.flatten() }, { status: 400 })
  }

  // Existenz + Status-Check (nur 'failed' kann retry auslösen)
  const rows = await db`SELECT id, status FROM parts WHERE id = ${id} LIMIT 1`
  if (rows.length === 0) return NextResponse.json({ error: 'Part not found' }, { status: 404 })
  if (rows[0].status !== 'failed') {
    return NextResponse.json({ error: 'Only failed parts can be retried' }, { status: 409 })
  }

  // DB-Update ZUERST (Assumption A4)
  await db`UPDATE parts SET status = 'pending' WHERE id = ${id}`

  // Worker-Enqueue (identisch zu confirm/route.ts Zeilen 46-67)
  const workerUrl = process.env.WORKER_URL
  if (workerUrl) {
    // ... (exakt wie confirm/route.ts)
  }

  return NextResponse.json({ part_id: id, status: 'pending' }, { status: 202 })
}
```

---

## Shared Patterns

### UUID-Validierung (alle [id]-Routes)

**Source:** `src/app/api/parts/[id]/status/route.ts` Zeilen 11–28
**Anwenden auf:** `route.ts` (PATCH+DELETE), `archive/route.ts`, `retry/route.ts`

```typescript
// KRITISCH: UUID-Validierung IMMER als ERSTE Operation — vor DB-Query und vor S3-Key-Konstruktion
// Verhindert Path-Traversal via manipulierter part_id in S3-Key (security.md V5, Threat T-04-04)
const ParamsSchema = z.object({
  id: z.string().uuid('id muss eine gültige UUID sein'),
})

const { id } = await params   // Next.js 16: params ist Promise — immer await!
const parsed = ParamsSchema.safeParse({ id })
if (!parsed.success) {
  return NextResponse.json(
    { error: 'Invalid id', details: parsed.error.flatten() },
    { status: 400 }
  )
}
```

### DB Tagged-Template (alle API Routes)

**Source:** `src/lib/db.ts` (importiert via `@/lib/db`)
**Anwenden auf:** Alle neuen API-Routes

```typescript
// NIEMALS: import { sql } from '@neondatabase/serverless'
// IMMER:
import { db } from '@/lib/db'

// Verwendung — Tagged Template verhindert SQL-Injection strukturell:
const rows = await db`SELECT * FROM parts WHERE id = ${id} LIMIT 1`
const [part] = await db`UPDATE parts SET status = ${'pending'} WHERE id = ${id} RETURNING id`
await db`DELETE FROM parts WHERE id = ${id}`
```

### JSON-Body-Parse-Pattern (POST/PATCH-Routes)

**Source:** `src/app/api/upload/confirm/route.ts` Zeilen 19–31 + `src/app/api/upload/init/route.ts` Zeilen 31–42

```typescript
// Für alle Routes die einen Request-Body lesen:
let body: unknown
try {
  body = await request.json()
} catch {
  return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
}

const parsed = Schema.safeParse(body)
if (!parsed.success) {
  return NextResponse.json(
    { error: 'Invalid input', details: parsed.error.flatten() },
    { status: 400 }
  )
}
```

### S3-Client-Import (DELETE-Route)

**Source:** `src/lib/s3.ts` Zeilen 1–19 + `src/app/api/parts/[id]/thumbnail/route.ts` Zeilen 1–12

```typescript
// Immer aus @/lib/s3 importieren — NIEMALS eigenen S3Client instanzieren:
import { s3, BUCKET_STEPS, BUCKET_THUMBNAILS } from '@/lib/s3'
// Dann AWS-Commands einzeln:
import { DeleteObjectsCommand } from '@aws-sdk/client-s3'
```

### Next.js 16 params-als-Promise

**Source:** `src/app/api/parts/[id]/status/route.ts` Zeile 17, `src/app/api/parts/[id]/thumbnail/route.ts` Zeile 21
**Anwenden auf:** Alle neuen [id]-Routes

```typescript
// Next.js 16: params ist ein Promise — IMMER await (Pitfall 5):
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params   // ← await ist Pflicht
```

### Datei-Kommentar-Konvention

**Source:** Alle bisherigen Route-Dateien (Zeile 1–5)
**Anwenden auf:** Alle neuen Dateien

```typescript
// src/app/api/parts/[id]/archive/route.ts
// POST /api/parts/[id]/archive — ADMIN-03: Soft-Delete (status='archived')
// Server-only — KEIN "use client", keine Browser-Imports.
```

---

## Anti-Patterns (explizit dokumentiert)

| Anti-Pattern | Korrekt statt dessen | Quelle |
|---|---|---|
| `import { sql } from '@neondatabase/serverless'` | `import { db } from '@/lib/db'` | Established Pattern Codebase |
| `DeleteObjectCommand` (singular) für Multi-Delete | `DeleteObjectsCommand` (plural, Batch) | RESEARCH.md Pitfall 2 |
| `status: z.enum([..., 'archived'])` im PATCH-Schema | `'archived'` weglassen — nur via /archive | RESEARCH.md Pitfall 4 |
| `params.id` ohne await | `const { id } = await params` | RESEARCH.md Pitfall 5 |
| S3-Delete NACH DB-Delete | S3 ZUERST, dann DB (best-effort) | RESEARCH.md Pitfall 6 |
| `is_archived = true` setzen | Nur `status = 'archived'` schreiben | RESEARCH.md DB-Schema Kritische Anmerkung |
| `NEXT_PUBLIC_WORKER_URL` | `WORKER_URL` (kein NEXT_PUBLIC_ Prefix) | security.md |

---

## Downstream-Constraint für Phase 6

**WICHTIG:** Phase 6 (Search Pipeline) MUSS `WHERE status = 'ready'` als Filter verwenden.
Archivierte Teile haben `status='archived'` — Phase 6 darf NICHT `WHERE is_archived = false` nutzen.
Das `is_archived`-Boolean-Feld wird in Phase 5 nicht beschrieben und sollte in Phase 6 ignoriert werden.

---

## Metadata

**Analog-Suchbereich:** `src/app/`, `src/lib/`, `src/hooks/`, `src/components/ui/`
**Gelesene Dateien:** 9 Quelldateien + 3 Planungsdokumente
**Pattern-Extraktion:** 2026-05-09
