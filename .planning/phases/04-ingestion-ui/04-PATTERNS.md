# Phase 4: Ingestion UI - Pattern Map

**Mapped:** 2026-05-08
**Files analyzed:** 7 (5 NEW, 1 MODIFY, 1 NEW migration)
**Analogs found:** 6 / 7 (one — `usePartStatus` polling hook — has no role+dataflow analog; uses RESEARCH.md prescription)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/app/page.tsx` (MODIFY) | page (Server Component) | static-render | n/a (full rewrite per UI-SPEC homepage section) | rewrite |
| `src/app/upload/page.tsx` (NEW) | page (Server Component wrapper) | static-render | `src/app/layout.tsx` | role-match |
| `src/app/upload/UploadForm.tsx` (NEW) | component (Client form + state machine) | request-response + streaming-upload + polling | `src/components/ui/form.tsx` (form integration) + `src/app/api/upload/init/route.ts` (request shape) | composed |
| `src/app/api/parts/[id]/status/route.ts` (NEW) | route handler (GET) | request-response (DB read) | `src/app/api/upload/init/route.ts` + `src/app/api/upload/confirm/route.ts` | role-match (POST→GET; CRUD-Read) |
| `src/app/api/parts/[id]/thumbnail/route.ts` (NEW) | route handler (GET) | request-response (DB read + S3 sign) | `src/app/api/upload/init/route.ts` (presigned URL pattern) | exact (presigned URL flow) |
| `src/hooks/use-part-status.ts` (NEW) | custom hook | event-driven (polling + cleanup) | `src/hooks/use-mobile.tsx` (effect+listener+cleanup skeleton only) | partial (no polling analog exists) |
| `supabase/migrations/002_add_thumbnail_count.sql` (NEW) | migration | schema-DDL | `supabase/migrations/001_parts_schema.sql` | exact (migration style) |

**Test files (co-located, mirror analogs):**

| New Test File | Closest Analog |
|---------------|----------------|
| `src/app/api/parts/[id]/status/route.test.ts` | `src/app/api/upload/init/route.test.ts` |
| `src/app/api/parts/[id]/thumbnail/route.test.ts` | `src/app/api/upload/init/route.test.ts` (uses `getSignedUrl` mock) |
| `src/hooks/use-part-status.test.ts` | n/a (Vitest fake-timer pattern from RESEARCH.md) |
| `src/app/upload/UploadForm.test.tsx` | n/a (no client-component test exists yet — RESEARCH.md provides shape) |

---

## Pattern Assignments

### `src/app/api/parts/[id]/status/route.ts` (route handler, GET, request-response/DB-read)

**Analog:** `src/app/api/upload/confirm/route.ts` (Zod-UUID validation) + `src/app/api/upload/init/route.ts` (db tagged-template)

**Imports pattern** (`init/route.ts` lines 7-12 — DROP S3 imports, KEEP db + zod):
```typescript
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
```

**Zod-UUID validation pattern** (`confirm/route.ts` lines 12-14):
```typescript
const ConfirmSchema = z.object({
  part_id: z.string().uuid('part_id muss eine gültige UUID sein'),
})
```
> For Phase 4 status route: input is `params.id` (not body), so wrap in `safeParse({ id })`. Pattern of `z.string().uuid(...)` is identical.

**Tagged-template SQL read pattern** (`confirm/route.ts` lines 36-38 — analogous SELECT with LIMIT):
```typescript
const parts = await db`
  SELECT id, status FROM parts WHERE id = ${part_id} LIMIT 1
`
if (parts.length === 0) {
  return NextResponse.json({ error: 'Part not found' }, { status: 404 })
}
```
> For status route: extend SELECT to `status, thumbnail_count`. **`thumbnail_count` column requires migration 002** (see migration section below).

**Error response pattern** (`init/route.ts` lines 41-46):
```typescript
const parsed = InitSchema.safeParse(body)
if (!parsed.success) {
  return NextResponse.json(
    { error: 'Invalid input', details: parsed.error.flatten() },
    { status: 400 }
  )
}
```
> Same shape for invalid UUID: `{ error: 'Invalid id', ... }, status: 400`.

**Next.js 16 dynamic-route signature** (NOT in analog — Phase 3 routes have no `[id]`; sourced from RESEARCH.md Pitfall 1):
```typescript
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params
  // ...
}
```

**Module-level comment header pattern** (`init/route.ts` lines 1-5):
```typescript
// src/app/api/parts/[id]/status/route.ts
// GET /api/parts/[id]/status — D-05
// Liest aus parts-Tabelle. KEIN Worker-Touch.
// Server-only — KEIN "use client", keine Browser-Imports.
```

---

### `src/app/api/parts/[id]/thumbnail/route.ts` (route handler, GET, request-response/DB+S3)

**Analog:** `src/app/api/upload/init/route.ts` (presigned URL flow with AWS SDK)

**Imports pattern** (`init/route.ts` lines 7-12 — swap `PutObjectCommand` for `GetObjectCommand` + `HeadObjectCommand`, swap `BUCKET_STEPS` for `BUCKET_THUMBNAILS`):
```typescript
import { NextResponse } from 'next/server'
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { z } from 'zod'
import { db } from '@/lib/db'
import { s3, BUCKET_THUMBNAILS } from '@/lib/s3'
```

**Presigned URL signing pattern** (`init/route.ts` lines 76-84 — drop ContentType for GET):
```typescript
const presignedUrl = await getSignedUrl(
  s3,
  new PutObjectCommand({
    Bucket: BUCKET_STEPS,
    Key: `${part.id}/original.step`,
    ContentType: 'application/octet-stream',
  }),
  { expiresIn: 900 }
)
```
> For thumbnail route: use `GetObjectCommand`, `BUCKET_THUMBNAILS`, key `${id}/view_0.png`, `expiresIn: 60` (D-08). No ContentType for GET.

**S3 key convention** (from `src/lib/s3.ts` line 14 — comment is the contract):
```typescript
// Bucket-Namen als Konstanten — Pfadkonvention: {part_id}/original.step, {part_id}/view_0.png … view_7.png
```
> Use `${id}/view_0.png` exactly per D-07.

**409 status guard pattern** (no exact analog — derives from `confirm/route.ts` lines 39-41 plus RESEARCH.md):
```typescript
const rows = await db`SELECT status FROM parts WHERE id = ${id} LIMIT 1`
if (rows.length === 0) return NextResponse.json({ error: 'Part not found' }, { status: 404 })
if (rows[0].status !== 'ready') {
  return NextResponse.json({ error: 'Thumbnail not ready' }, { status: 409 })
}
```

**HeadObject pre-flight pattern** (RESEARCH.md Pitfall 5; not in analog — new this phase):
```typescript
try {
  await s3.send(new HeadObjectCommand({ Bucket: BUCKET_THUMBNAILS, Key: key }))
} catch {
  return NextResponse.json({ error: 'Thumbnail object missing' }, { status: 404 })
}
```

---

### `src/app/api/parts/[id]/status/route.test.ts` AND `.../thumbnail/route.test.ts` (test, mock-based)

**Analog:** `src/app/api/upload/init/route.test.ts` (full structure)

**Mock setup pattern** (`init/route.test.ts` lines 10-21):
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

vi.mock('@/lib/db', () => ({
  db: vi.fn(),
}))
vi.mock('@/lib/s3', () => ({
  s3: {},
  BUCKET_STEPS: 'mock-bucket-steps',
  BUCKET_THUMBNAILS: 'mock-bucket-thumbnails',
}))
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/mock-presigned-url'),
}))

import { db } from '@/lib/db'
const mockDb = vi.mocked(db)
```
> For thumbnail test: also mock `@aws-sdk/client-s3` with `s3.send: vi.fn()` to stub `HeadObjectCommand`. For status test: omit `getSignedUrl` and `s3` mocks (route does not call S3).

**Request construction + dynamic params** (`init/route.test.ts` lines 44-57 — ADAPT for `params: Promise<{id}>`):
```typescript
const request = new Request('http://localhost/api/upload/init', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(validBody),
})
const response = await POST(request)
```
> For dynamic routes: `await GET(request, { params: Promise.resolve({ id: validUuid }) })`.

**Test labels in German** (`init/route.test.ts` line 38, 60):
```typescript
it('gibt HTTP 409 zurück wenn SHA-256 bereits in der Datenbank existiert (INGEST-04)', async () => {
it('gibt HTTP 200 mit part_id und presigned_url zurück bei gültigem Init-Request', async () => {
```
> Match style: German labels, requirement-ID in parentheses (`INGEST-02`).

**Mock chaining for multi-query handlers** (`init/route.test.ts` lines 63-65):
```typescript
mockDb
  .mockResolvedValueOnce([])                        // SELECT sha256 → kein Treffer
  .mockResolvedValueOnce([{ id: newPartId }])       // INSERT RETURNING id
```
> For thumbnail test: `mockDb.mockResolvedValueOnce([{ status: 'ready' }])` + mock `s3.send` (HeadObject) success + mock `getSignedUrl` value.

---

### `src/app/upload/page.tsx` (page, Server Component wrapper)

**Analog:** `src/app/layout.tsx` (Server Component, metadata export, minimal)

**Server Component metadata pattern** (`layout.tsx` lines 1-7):
```typescript
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Coding Starter Kit",
  description: "Built with AI Agent Function System",
};
```
> Apply same pattern: `export const metadata = { title: "STEP-Datei hochladen — Bauteil-Finder" }`. **No `"use client"` directive** — page is a server component.

**Page-level layout shell** (UI-SPEC.md Layout Contract block):
```tsx
// src/app/upload/page.tsx — Server Component
import { UploadForm } from './UploadForm'

export const metadata = { title: 'STEP-Datei hochladen' }

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

---

### `src/app/upload/UploadForm.tsx` (Client component, composed pattern)

**Analog:** `src/components/ui/form.tsx` (FormProvider/FormField composition) + `src/app/api/upload/init/route.ts` (request body contract)

**`"use client"` + react-hook-form imports** (composed from `form.tsx` lines 1-13 + RESEARCH.md):
```typescript
"use client"

import { useState, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { AlertCircle, Loader2, Upload, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import { usePartStatus } from '@/hooks/use-part-status'
```
> `@/*` alias enforced (CONVENTIONS.md). Never relative `../../components/ui`.

**Init request body shape** (must match `init/route.ts` lines 15-29 — schema is server source of truth):
```typescript
// FROM init/route.ts:
const InitSchema = z.object({
  name: z.string().min(1, 'name ist Pflichtfeld').max(255),
  sha256: z.string().length(64, ...).regex(/^[0-9a-f]+$/i, ...),
  original_filename: z.string().min(1).max(255),
  file_size_bytes: z.number().int().positive().max(100 * 1024 * 1024, ...),
  part_number: z.string().max(100).optional(),
  project: z.string().max(255).optional(),
})
```
> `UploadForm.tsx` `onSubmit` MUST send exactly these fields. RESEARCH.md "Submit-Handler" example (lines 696-707) shows the matching `fetch()` body.

**Confirm request body shape** (must match `confirm/route.ts` lines 12-14):
```typescript
// FROM confirm/route.ts:
const ConfirmSchema = z.object({
  part_id: z.string().uuid('part_id muss eine gültige UUID sein'),
})
```

**Form schema mirrors validation messages from UI-SPEC** (Copywriting Contract):
```typescript
const formSchema = z.object({
  name: z.string().min(1, 'Bezeichnung ist erforderlich.').max(200),
  partNumber: z.string().max(100).optional(),
  project: z.string().max(200).optional(),
  status: z.enum(['pending', 'processing', 'ready', 'failed']).default('pending'),
})
```

**Form composition pattern** (`form.tsx` exports + standard shadcn FormField usage from shadcn docs):
```tsx
<Form {...form}>
  <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
    <FormField
      control={form.control}
      name="name"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Bezeichnung</FormLabel>
          <FormControl>
            <Input placeholder="z. B. Flanschplatte 50mm" {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
    {/* ... other fields ... */}
  </form>
</Form>
```

**File-input pattern (uncontrolled, outside Form)** (RESEARCH.md Pattern 5 — no codebase analog; file inputs are intentionally uncontrolled):
```tsx
<Label htmlFor="step-file">STEP-Datei</Label>
<input
  id="step-file"
  type="file"
  ref={fileInputRef}
  accept=".step,.stp"
  disabled={phase !== 'idle' && phase !== 'duplicate'}
/>
{fileError && <p className="text-sm text-destructive">{fileError}</p>}
```

**SHA-256 + XHR upload helpers** (RESEARCH.md Pattern 3 + Pattern 4 — must be inline in this file or a small util):
```typescript
async function sha256OfFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0')).join('')
}

function uploadToS3(presignedUrl: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', presignedUrl, true)
    // KEIN setRequestHeader('Content-Type', ...) — zerstört Presigned-URL-Signatur!
    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 100)
    })
    xhr.addEventListener('load', () => {
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`HTTP ${xhr.status}`))
    })
    xhr.addEventListener('error', () => reject(new Error('Network error')))
    xhr.send(file)
  })
}
```
> **Critical contract:** init route comment (lines 75-77) explicitly states ContentType is NOT in signableHeaders. Browser must NOT send Content-Type header on PUT.

---

### `src/hooks/use-part-status.ts` (custom hook, polling/event-driven)

**Analog:** `src/hooks/use-mobile.tsx` (skeleton: `useEffect` + listener + cleanup return)

**Effect+cleanup skeleton** (`use-mobile.tsx` lines 5-19):
```typescript
import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => { setIsMobile(window.innerWidth < MOBILE_BREAKPOINT) }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
```
> **Match:** module-level constants for thresholds, `useState` + `useEffect`, **return cleanup function**, single-responsibility hook. **Diverge:** Phase 4 needs multiple timers + AbortController (no codebase analog — follow RESEARCH.md Pattern 2 exactly).

**Full implementation** (RESEARCH.md Pattern 2 lines 343-426 — copy verbatim, this is the canonical version):
- Constants: `FAST_INTERVAL_MS = 2_000`, `SLOW_INTERVAL_MS = 5_000`, `FAST_PHASE_DURATION_MS = 30_000`, `TIMEOUT_MS = 5 * 60 * 1_000`, `FAILURE_THRESHOLD = 3`
- Disables on `partId === null` (resets state, returns early)
- `AbortController` per fetch tick
- Variable interval via elapsed-time check inside fast tick
- 5-min `setTimeout` for `timedOut`
- 3-failure threshold before surfacing error
- Return cleanup clears interval + timeout + aborts controller

**Hook signature contract** (matches `/api/parts/[id]/status` response shape — UI-SPEC.md):
```typescript
type PartStatus = 'pending' | 'processing' | 'ready' | 'failed'

export function usePartStatus(partId: string | null): {
  status: PartStatus | null
  thumbnailCount: number
  error: Error | null
  timedOut: boolean
}
```

---

### `src/hooks/use-part-status.test.ts` (test, fake timers)

**Analog:** none in repo. RESEARCH.md "Phase Requirements → Test Map" prescribes test names. Use Vitest fake-timer pattern.

**Setup pattern** (Vitest standard, mirrors style of `init/route.test.ts` lines 7-9 for imports + structure):
```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'

beforeEach(() => {
  vi.useFakeTimers()
  global.fetch = vi.fn()
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})
```

**Required test names** (from RESEARCH.md Wave 0 Test Map — mirror exactly):
- `'polls every 2s in first 30s'`
- `'switches to 5s after 30s'`
- `'stops on ready'`
- `'timeouts after 5 minutes'`
- `'cleans up timers on unmount'`

---

### `src/app/upload/UploadForm.test.tsx` (component test)

**Analog:** none in repo. Pattern: React Testing Library + Vitest. RESEARCH.md provides shape and required tests.

**Required test names** (RESEARCH.md Wave 0 Test Map):
- `'validates file size'`
- `'validates file extension'`
- `'validates name required'`
- `'shows duplicate alert'` (mock 409 from `/api/upload/init`)

---

### `supabase/migrations/002_add_thumbnail_count.sql` (migration, schema-DDL)

**Analog:** `supabase/migrations/001_parts_schema.sql` (exact migration style)

**Header comment pattern** (`001_parts_schema.sql` lines 1-4):
```sql
-- supabase/migrations/001_parts_schema.sql
-- Phase 1: Database Foundation
-- Erstellt: Bauteil-Finder v1 Datenbankinfrastruktur
-- Einspielen: Supabase Dashboard > SQL Editor > Dateiinhalt einfügen und ausführen
```
> Apply: `-- Phase 4: Ingestion UI` + `-- Fügt thumbnail_count-Spalte zur parts-Tabelle hinzu (D-05)`.

**DDL style** (`001_parts_schema.sql` lines 11-28 — lowercase keywords, aligned columns, inline comments):
```sql
create table parts (
  id                uuid         default gen_random_uuid() primary key,
  name              text         not null,
  ...
  status            text         not null default 'pending',  -- 'pending'|'processing'|'ready'|'failed' (D-02)
  ...
);
```
> Apply same lowercase + alignment + inline-comment style for ALTER:
```sql
-- Phase 4: thumbnail_count column for status API response (D-05)
alter table parts
  add column thumbnail_count integer not null default 0;
```

**Index pattern** (`001_parts_schema.sql` lines 38-41 — only if needed; thumbnail_count likely doesn't need an index — UI doesn't query on it):
```sql
create index parts_sha256_idx on parts(sha256);
```
> Skip index for `thumbnail_count` (no WHERE/ORDER BY use case in Phase 4).

---

### `src/app/page.tsx` (MODIFY, page, Server Component)

**Analog:** UI-SPEC.md "Homepage Touchpoint" — full rewrite to minimal landing.

**New content** (UI-SPEC line 327-330):
```tsx
import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <Button asChild>
        <Link href="/upload">Teil hochladen</Link>
      </Button>
    </main>
  )
}
```
> `Button asChild` pattern verified in `src/components/ui/button.tsx` lines 39, 44 — `asChild` swaps the underlying `Comp` to `Slot`, allowing `<Link>` to inherit button styles.

---

## Shared Patterns

### Pattern: Server-Only Module Imports
**Source:** `src/lib/db.ts` (lines 1-4) + `src/lib/s3.ts` (lines 1-4)
**Apply to:** Both new API routes (`status/route.ts`, `thumbnail/route.ts`)
```typescript
// src/lib/db.ts
// Neon PostgreSQL-Client — server-only.
// Darf NIEMALS in Client-Komponenten importiert werden.
// Erlaubte Verwendungsorte: src/app/api/** (API Routes), Server Components, Server Actions.
import { neon, neonConfig } from '@neondatabase/serverless'
```
> Both new routes import `db` from `@/lib/db` and (thumbnail only) `s3, BUCKET_THUMBNAILS` from `@/lib/s3`. Never duplicate client construction.

### Pattern: Zod Validation at Route Boundary
**Source:** `src/app/api/upload/init/route.ts` (lines 14-46) + `src/app/api/upload/confirm/route.ts` (lines 12-31)
**Apply to:** Both new API routes (validate `params.id` as UUID), `UploadForm.tsx` (validate form via `zodResolver`)
```typescript
const parsed = SomeSchema.safeParse(input)
if (!parsed.success) {
  return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
}
```
> **Security rule (security.md):** "Validate ALL user input on the server side with Zod" — both new routes MUST validate `params.id` with `z.string().uuid()`. Never inline regex.

### Pattern: Error Response Shape
**Source:** `src/app/api/upload/init/route.ts` lines 41-46, 54-58 + `confirm/route.ts` lines 39-41, 55-59
**Apply to:** Both new API routes
```typescript
// 400 Bad Request
return NextResponse.json({ error: 'Invalid input', details: parsed.error.flatten() }, { status: 400 })
// 404 Not Found
return NextResponse.json({ error: 'Part not found' }, { status: 404 })
// 409 Conflict (with extra context)
return NextResponse.json({ error: 'Thumbnail not ready' }, { status: 409 })
// 502 Bad Gateway (when external service unreachable)
return NextResponse.json({ error: 'Worker enqueue failed', detail: 'Worker unreachable' }, { status: 502 })
```
> Always `{ error: <human-readable-string>, ... }`. Never leak stack traces or DB errors.

### Pattern: Tagged-Template SQL with Parameter Binding
**Source:** `src/app/api/upload/init/route.ts` lines 51-53, 62-72 + `confirm/route.ts` lines 36-38
**Apply to:** Both new API routes
```typescript
const rows = await db`
  SELECT status, thumbnail_count
  FROM parts
  WHERE id = ${id}
  LIMIT 1
`
```
> **Always** use tagged-template literals — Neon binds parameters automatically (security.md "parameterized queries"). Never string-concat values into SQL. Always `LIMIT 1` for single-row reads (backend.md).

### Pattern: shadcn-First Component Usage
**Source:** `.claude/rules/frontend.md` + `src/components/ui/form.tsx` + every other `ui/*.tsx`
**Apply to:** `UploadForm.tsx`, `page.tsx` (homepage)
```typescript
// CORRECT: import from shadcn registry copy
import { Button } from '@/components/ui/button'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'

// WRONG: never reimplement
// const MyButton = () => <button className="bg-blue-500 ...">  ❌
```
> All 10 shadcn primitives needed for Phase 4 are already installed (verified in `src/components/ui/`). Never `npx shadcn add` — they're all there. Never custom-build.

### Pattern: Path Alias `@/*`
**Source:** every codebase file (e.g., `init/route.ts` line 11-12, `form.tsx` line 15-16, `db.ts` is imported as `@/lib/db`)
**Apply to:** All new files
```typescript
import { db } from '@/lib/db'
import { s3, BUCKET_THUMBNAILS } from '@/lib/s3'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
```
> Never relative imports like `../../lib/db`. Verified by `tsconfig.json` paths convention (CONVENTIONS.md).

### Pattern: German-Language User-Facing Strings
**Source:** `init/route.ts` line 16 (`'name ist Pflichtfeld'`), `confirm/route.ts` line 13 (`'part_id muss eine gültige UUID sein'`), all UI-SPEC Copywriting Contract entries
**Apply to:** All new files (route error messages, form labels, validation messages, status descriptions)
```typescript
// route error
return NextResponse.json({ error: 'Teil nicht gefunden' }, { status: 404 })
// Note: Phase 3 routes use English error keys ('Part not found') — keep keys English, but Zod messages German for user-facing.
```
> **Convention observed:** Error `{error: ...}` JSON keys stay English machine-readable; Zod messages and UI copy are German. Test labels are German (`'gibt HTTP 409 zurück...'`).

### Pattern: Module Header Comment
**Source:** `init/route.ts` lines 1-5, `confirm/route.ts` lines 1-5, `db.ts` lines 1-4, `s3.ts` lines 1-3, `001_parts_schema.sql` lines 1-4
**Apply to:** All new files
```
// <relative-path>
// <one-line purpose with phase reference (e.g., D-05)>
// <runtime context, e.g., "Server-only — KEIN 'use client'">
```

### Pattern: Test-File Co-Location
**Source:** `src/lib/db.test.ts` next to `src/lib/db.ts`, `src/app/api/upload/init/route.test.ts` next to `route.ts`
**Apply to:** All new test files (next to the source file, not in `tests/`)

### Pattern: Vitest Mock Setup with `vi.mock`
**Source:** `init/route.test.ts` lines 11-21 + `confirm/route.test.ts` lines 8-10
**Apply to:** All new route tests
```typescript
vi.mock('@/lib/db', () => ({ db: vi.fn() }))
vi.mock('@/lib/s3', () => ({ s3: { send: vi.fn() }, BUCKET_THUMBNAILS: 'mock-bucket' }))
import { db } from '@/lib/db'
const mockDb = vi.mocked(db)
```

---

## No Analog Found

Files where the codebase has no close match — planner falls back to RESEARCH.md and UI-SPEC.md prescriptions:

| File | Role | Data Flow | Reason | Use Instead |
|------|------|-----------|--------|-------------|
| `src/hooks/use-part-status.ts` | hook | event-driven (variable polling + AbortController + 3-tier cleanup) | No polling hook exists. `use-mobile.tsx` is the closest hook (effect+cleanup skeleton) but is single-listener, not interval-based. | RESEARCH.md Pattern 2 (lines 343-426) — verbatim canonical implementation. |
| `src/app/upload/UploadForm.tsx` | composed client component | multi-phase state machine + XHR upload + SHA-256 + react-hook-form | No multi-phase client component exists yet. | RESEARCH.md Pattern 1 (state-machine), Pattern 3 (XHR), Pattern 4 (SHA-256), Pattern 5 (file-input) + UI-SPEC Layout Contract + Copywriting Contract. |
| `src/hooks/use-part-status.test.ts` | hook test (fake timers) | unit | No fake-timer test exists in codebase. | RESEARCH.md Validation Architecture — required test names. |
| `src/app/upload/UploadForm.test.tsx` | client component test (RTL) | integration | No client-component tests exist. | RESEARCH.md Validation Architecture — required test names. Vitest + `@testing-library/react`. |

---

## Key Cross-Cutting Notes

1. **The Init/Confirm contract is the source of truth.** `UploadForm.tsx` MUST send the exact body shape validated by `init/route.ts:InitSchema` (lines 15-29) and `confirm/route.ts:ConfirmSchema` (lines 12-14). Any drift = 400 from server.

2. **Never set `Content-Type` on the S3 PUT.** `init/route.ts` lines 75-77 contain the canonical comment: *"Content-Type NICHT in signableHeaders — verhindert Content-Type-Mismatch (Pitfall 1)"*. The browser must not call `xhr.setRequestHeader('Content-Type', ...)`.

3. **Next.js 16 dynamic params are Promises.** Both new routes have `[id]` segments. Signature MUST be `{ params: Promise<{ id: string }> }` and use `await params`. No analog has dynamic params (Phase 3 routes are flat) — RESEARCH.md Pitfall 1 is the spec.

4. **`thumbnail_count` column requires migration `002_add_thumbnail_count.sql`.** Verified via reading `001_parts_schema.sql` lines 11-28: column does NOT exist. The status route response shape (UI-SPEC + D-05) demands `{status, thumbnail_count}`. Wave 0 task: write + apply migration before status route can return real data.

5. **No auth in Phase 4** — consistent with Phase 3 (REQUIREMENTS.md "Out of Scope: OAuth/SSO Login"). UUIDs are unenumerable. `.claude/rules/backend.md` "Always check authentication" is intentionally bypassed in v1; document in plan.

6. **RLS deliberately disabled** — `001_parts_schema.sql` lines 61-65 confirm this is a project-wide decision (D-06). Frontend never talks to Supabase directly; all DB access via Next.js API routes using service role.

---

## Metadata

**Analog search scope:** `src/app/`, `src/app/api/`, `src/components/ui/`, `src/hooks/`, `src/lib/`, `supabase/migrations/`
**Files scanned:** 14 (full read on canonical refs from CONTEXT.md), partial scan via `ls` on UI components directory
**Pattern extraction date:** 2026-05-08
**Verified canonical references read:**
- `src/app/api/upload/init/route.ts` (87 lines)
- `src/app/api/upload/init/route.test.ts` (119 lines)
- `src/app/api/upload/confirm/route.ts` (70 lines)
- `src/app/api/upload/confirm/route.test.ts` (95 lines)
- `src/lib/db.ts` (13 lines)
- `src/lib/s3.ts` (16 lines)
- `src/lib/db.test.ts` (53 lines)
- `src/lib/utils.ts` (6 lines)
- `src/components/ui/form.tsx` (178 lines)
- `src/components/ui/button.tsx` (56 lines)
- `src/components/ui/badge.tsx` (36 lines)
- `src/components/ui/alert.tsx` (59 lines)
- `src/components/ui/card.tsx` (79 lines)
- `src/components/ui/input.tsx` (22 lines)
- `src/components/ui/progress.tsx` (28 lines)
- `src/components/ui/skeleton.tsx` (15 lines)
- `src/hooks/use-toast.ts` (194 lines)
- `src/hooks/use-mobile.tsx` (19 lines)
- `src/app/page.tsx` (101 lines)
- `src/app/layout.tsx` (21 lines)
- `supabase/migrations/001_parts_schema.sql` (65 lines)
