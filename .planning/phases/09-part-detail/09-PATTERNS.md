# Phase 9: Part Detail — Pattern Map

**Mapped:** 2026-05-09
**Files analyzed:** 9 (7 new, 2 modified)
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/app/parts/[id]/page.tsx` | page (Server Component) | request-response | `src/app/search/page.tsx` | exact |
| `src/app/parts/[id]/PartDetail.tsx` | component (Client) | request-response + event-driven | `src/app/admin/CatalogTable.tsx` | role-match |
| `src/hooks/usePartDetail.ts` | hook | request-response | `src/hooks/use-part-status.ts` | role-match |
| `src/app/api/parts/[id]/route.ts` | route (ADD GET) | CRUD | `src/app/api/parts/[id]/route.ts` (PATCH/DELETE) | exact |
| `src/app/api/parts/[id]/thumbnails/route.ts` | route (NEW) | request-response + file-I/O | `src/app/api/parts/[id]/thumbnail/route.ts` | exact |
| `src/app/api/parts/[id]/download/route.ts` | route (NEW) | request-response + file-I/O | `src/app/api/parts/[id]/thumbnail/route.ts` | role-match |
| `src/app/parts/[id]/PartDetail.test.tsx` | test (unit) | — | `src/hooks/use-part-status.test.ts` | role-match |
| `src/hooks/usePartDetail.test.ts` | test (unit) | — | `src/hooks/use-part-status.test.ts` | exact |
| `tests/phase-09-part-detail.spec.ts` | test (E2E) | — | `tests/phase-08-results-ui.spec.ts` | exact |

---

## Pattern Assignments

### `src/app/parts/[id]/page.tsx` (Server Component)

**Analog:** `src/app/search/page.tsx`

**Imports pattern** (lines 1-7):
```typescript
// src/app/search/page.tsx lines 1-7
import type { Metadata } from 'next'
import { CameraCapture } from './CameraCapture'

export const metadata: Metadata = {
  title: 'Bauteil suchen — Bauteil-Finder',
}
```

**Core pattern** (lines 9-21) — Server Component passes params down, delegates all logic to Client Component:
```typescript
// src/app/search/page.tsx lines 9-21
export default function SearchPage() {
  return (
    <main className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-semibold mb-8">Bauteil fotografieren</h1>
        <CameraCapture />
      </div>
    </main>
  )
}
```

**Adaptation for `parts/[id]/page.tsx`:**
- `params` is `Promise<{ id: string }>` — must `await params` (Next.js 16)
- Pass `id` as prop to `<PartDetail id={id} />`
- `metadata` can be `export const metadata: Metadata = { title: 'Bauteil-Details — Bauteil-Finder' }` or dynamic via `generateMetadata`

```typescript
// Target pattern for src/app/parts/[id]/page.tsx
import type { Metadata } from 'next'
import { PartDetail } from './PartDetail'

export const metadata: Metadata = {
  title: 'Bauteil-Details — Bauteil-Finder',
}

export default async function PartDetailPage(
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params  // Next.js 16: params ist Promise
  return (
    <main className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-md mx-auto md:max-w-2xl">
        <PartDetail id={id} />
      </div>
    </main>
  )
}
```

---

### `src/app/parts/[id]/PartDetail.tsx` (Client Component)

**Analog:** `src/app/admin/CatalogTable.tsx`

**Directive + Imports pattern** (lines 1-76):
```typescript
// src/app/admin/CatalogTable.tsx lines 1-76
'use client'

import { useState, useRef, useEffect } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
```

**StatusBadge sub-component** (lines 104-133) — copy verbatim, omit 'archived':
```typescript
// src/app/admin/CatalogTable.tsx lines 104-133
function StatusBadge({ status }: { status: Part['status'] }) {
  if (status === 'ready') {
    return (
      <Badge className="text-green-700 bg-green-50 border-green-200 hover:bg-green-50">
        Bereit
      </Badge>
    )
  }
  if (status === 'pending') {
    return <Badge variant="secondary">Ausstehend</Badge>
  }
  if (status === 'processing') {
    return (
      <Badge variant="outline" className="text-blue-600 border-blue-300">
        Wird verarbeitet…
      </Badge>
    )
  }
  if (status === 'failed') {
    return <Badge variant="destructive">Fehlgeschlagen</Badge>
  }
  return null
}
```

**formatDate helper** (lines 135-145) — copy verbatim:
```typescript
// src/app/admin/CatalogTable.tsx lines 135-145
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date(iso))
    .replace(',', '')
}
```

**Thumbnail loading pattern** (lines 459-472) — img with Skeleton fallback:
```typescript
// src/app/admin/CatalogTable.tsx lines 459-472
{part.status === 'ready' && thumbnailUrls[part.id] ? (
  <img
    src={thumbnailUrls[part.id]}
    alt={part.name}
    width={48}
    height={48}
    loading="lazy"
    className="object-contain rounded-sm border w-12 h-12"
  />
) : (
  <Skeleton className="w-12 h-12 rounded-sm" />
)}
```

**Skeleton loading state** (lines 422-428) — while data loads:
```typescript
// src/app/admin/CatalogTable.tsx lines 422-428
{isLoading ? (
  <div className="space-y-2">
    {Array.from({ length: 5 }).map((_, i) => (
      <Skeleton key={i} className="h-14 w-full" />
    ))}
  </div>
) : ...}
```

**thumbnail useEffect — critical eslint-disable comment** (lines 186-203):
```typescript
// src/app/admin/CatalogTable.tsx lines 186-204
useEffect(() => {
  parts
    .filter(p => p.status === 'ready' && !thumbnailUrls[p.id])
    .forEach(part => {
      fetch(`/api/parts/${part.id}/thumbnail`)
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (data?.url) {
            setThumbnailUrls(prev => ({ ...prev, [part.id]: data.url }))
          }
        })
        .catch(() => {
          // Kein Fehler-Toast bei Thumbnail — Skeleton bleibt sichtbar
        })
    })
  // thumbnailUrls aus Deps entfernen um Endlosschleife zu vermeiden
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [parts])
```

**Also reference:** `src/app/search/SearchResultCard.tsx` lines 20-29 for simpler single-fetch + useState(null) thumbnail pattern with `onError` handler:
```typescript
// src/app/search/SearchResultCard.tsx lines 20-29
const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)

useEffect(() => {
  fetch(`/api/parts/${id}/thumbnail`)
    .then(r => (r.ok ? r.json() : null))
    .then(data => { if (data?.url) setThumbnailUrl(data.url) })
    .catch(() => { /* Skeleton bleibt sichtbar */ })
}, [id])
```

---

### `src/hooks/usePartDetail.ts` (Custom Hook)

**Analog:** `src/hooks/use-part-status.ts`

**File header + directive** (lines 1-6):
```typescript
// src/hooks/use-part-status.ts lines 1-6
// Custom Hook für Status-Polling — D-04, D-06, INGEST-02
// [...]
'use client'

import { useEffect, useRef, useState } from 'react'
```

**TypeScript interface for return value** (lines 9-15):
```typescript
// src/hooks/use-part-status.ts lines 9-16
export type PartStatus = 'pending' | 'processing' | 'ready' | 'failed'

export interface UsePartStatusResult {
  status: PartStatus | null
  thumbnailCount: number
  error: Error | null
  timedOut: boolean
}
```

**useState initialization pattern** (lines 26-30):
```typescript
// src/hooks/use-part-status.ts lines 26-30
const [status, setStatus] = useState<PartStatus | null>(null)
const [thumbnailCount, setThumbnailCount] = useState(0)
const [error, setError] = useState<Error | null>(null)
const [timedOut, setTimedOut] = useState(false)
```

**useEffect with [id] dependency and cleanup** (lines 32-106):
```typescript
// src/hooks/use-part-status.ts lines 32-106 (structure — not full polling logic)
useEffect(() => {
  if (!partId) {
    // reset all state
    return
  }

  // ... fetch logic

  return () => {
    // cleanup: abort controller, clear intervals/timeouts
  }
}, [partId])
```

**Parallel fetch pattern for usePartDetail** — adapt from RESEARCH.md Pattern 4:
```typescript
// Pattern from 09-RESEARCH.md lines 296-310
useEffect(() => {
  setIsLoading(true)
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
}, [id])  // ONLY [id] — no thumbnailUrls (Endlosloop-Pitfall)
```

---

### `src/app/api/parts/[id]/route.ts` — ADD GET handler

**Analog:** `src/app/api/parts/[id]/route.ts` (existing PATCH handler, lines 24-73)

**File header convention** (lines 1-4):
```typescript
// src/app/api/parts/[id]/route.ts lines 1-4
// PATCH /api/parts/[id] — ADMIN-02: Metadaten aktualisieren
// DELETE /api/parts/[id] — ADMIN-03: Hard-Delete (DB + S3)
// Server-only — KEIN "use client", keine Browser-Imports.
```

**ParamsSchema (shared — already in file)** (lines 12-15):
```typescript
// src/app/api/parts/[id]/route.ts lines 12-15
const ParamsSchema = z.object({
  id: z.string().uuid('id muss eine gültige UUID sein'),
})
```

**UUID validation + params await pattern** (lines 24-33):
```typescript
// src/app/api/parts/[id]/route.ts lines 24-33
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params  // Next.js 16: params ist Promise (Pitfall 5)

  const parsedParams = ParamsSchema.safeParse({ id })
  if (!parsedParams.success) {
    return NextResponse.json(
      { error: 'Invalid id', details: parsedParams.error.flatten() },
      { status: 400 }
    )
  }
```

**DB query returning specific fields** (lines 61-72):
```typescript
// src/app/api/parts/[id]/route.ts lines 61-72
const updated = await db`
  UPDATE parts
  SET ...
  WHERE id = ${id}
  RETURNING id, name, part_number, project, status, thumbnail_count, created_at
`
return NextResponse.json({ part: updated[0] })
```

**GET handler to add — directly from RESEARCH.md Code Examples (lines 418-442):**
```typescript
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

---

### `src/app/api/parts/[id]/thumbnails/route.ts` (NEW route)

**Analog:** `src/app/api/parts/[id]/thumbnail/route.ts` — copy entirely and extend

**Full analog file** (`src/app/api/parts/[id]/thumbnail/route.ts` lines 1-67):

**Imports pattern** (lines 1-11):
```typescript
// src/app/api/parts/[id]/thumbnail/route.ts lines 1-11
import { NextResponse } from 'next/server'
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { z } from 'zod'
import { db } from '@/lib/db'
import { s3, BUCKET_THUMBNAILS } from '@/lib/s3'
```

**UUID validation** (lines 13-16):
```typescript
// src/app/api/parts/[id]/thumbnail/route.ts lines 13-16
const ParamsSchema = z.object({
  id: z.string().uuid('id muss eine gültige UUID sein'),
})
```

**Core GET pattern** (lines 18-67) — adapt: loop 0..thumbnail_count-1, Promise.all for parallel calls, return `{ urls }` array:
```typescript
// src/app/api/parts/[id]/thumbnail/route.ts lines 18-67
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params

  // 1. UUID validieren BEVOR DB-Query oder S3-Key-Konstruktion (Threat T-04-08)
  const parsed = ParamsSchema.safeParse({ id })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid id', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // 2. Part-Existenz und Status-Check
  const rows = await db`
    SELECT status FROM parts WHERE id = ${id} LIMIT 1
  `
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Part not found' }, { status: 404 })
  }
  if (rows[0].status !== 'ready') {
    return NextResponse.json({ error: 'Thumbnail not ready' }, { status: 409 })
  }

  // 3. S3-Key gemäß Pfadkonvention (STATE.md: view_0..view_7.png)
  const key = `${id}/view_0.png`

  // 4. HeadObject prüft Existenz BEVOR signiert wird (race condition guard)
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET_THUMBNAILS, Key: key }))
  } catch {
    return NextResponse.json({ error: 'Thumbnail object missing' }, { status: 404 })
  }

  // 5. Presigned GET-URL — 60s Lifetime
  let url: string
  try {
    url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: BUCKET_THUMBNAILS, Key: key }),
      { expiresIn: 60 }
    )
  } catch {
    return NextResponse.json({ error: 'Failed to generate thumbnail URL' }, { status: 500 })
  }

  return NextResponse.json({ url })
}
```

**Key adaptations for `/thumbnails` route:**
- DB query: `SELECT status, thumbnail_count FROM parts WHERE id = ${id} LIMIT 1`
- When `thumbnail_count === 0`: return `NextResponse.json({ urls: [] })` with status 200 (not 409)
- When `status !== 'ready'`: return `NextResponse.json({ urls: [] })` with status 200 (not 409) — client renders skeleton strip
- Loop `for i in 0..thumbnail_count-1`, use `Promise.all()` for parallel HeadObject + getSignedUrl
- Return `NextResponse.json({ urls })` array
- TTL stays 60s (thumbnails are small)

---

### `src/app/api/parts/[id]/download/route.ts` (NEW route)

**Analog:** `src/app/api/parts/[id]/thumbnail/route.ts` — same structure, different S3 bucket and key

**Imports pattern** — same as thumbnail, but add `BUCKET_STEPS`:
```typescript
// Adapt from src/app/api/parts/[id]/thumbnail/route.ts lines 6-11
import { NextResponse } from 'next/server'
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { z } from 'zod'
import { db } from '@/lib/db'
import { s3, BUCKET_STEPS } from '@/lib/s3'  // BUCKET_STEPS not BUCKET_THUMBNAILS
```

**Also reference:** `src/app/api/parts/[id]/archive/route.ts` lines 1-36 for the minimal sub-route skeleton (file header comment, ParamsSchema, GET function signature):
```typescript
// src/app/api/parts/[id]/archive/route.ts lines 1-36
// [comment block]
// Server-only — KEIN "use client", keine Browser-Imports.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'

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

  const existing = await db`SELECT id FROM parts WHERE id = ${id} LIMIT 1`
  if (existing.length === 0) {
    return NextResponse.json({ error: 'Part not found' }, { status: 404 })
  }
  ...
}
```

**Key adaptations for `/download` route:**
- DB query: `SELECT status, name FROM parts WHERE id = ${id} LIMIT 1`
- `sanitizeFilename` helper: `name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_\-\.]/g, '') || 'bauteil'`
- S3 key: `${id}/original.step` from `BUCKET_STEPS`
- `GetObjectCommand` with extra params: `ResponseContentDisposition: \`attachment; filename="${filename}"\`` and `ResponseContentType: 'application/octet-stream'`
- TTL: `expiresIn: 300` (5 min, not 60s — large files up to 100MB)
- Return: `NextResponse.json({ url, filename })`
- Status !== 'ready': return 409 (unlike `/thumbnails` which returns 200 with empty array)

---

### `src/app/parts/[id]/PartDetail.test.tsx` (Vitest unit test)

**Analog:** `src/hooks/use-part-status.test.ts`

**File header + imports pattern** (lines 1-15):
```typescript
// src/hooks/use-part-status.test.ts lines 1-15
// Tests für usePartStatus-Hook (D-04, D-06, INGEST-02)
// Aktiviert in Plan 04 (Wave 2) — alle 8 Tests grün mit fake timers.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePartStatus } from './use-part-status'
```

**fetch mock helper** (lines 9-15):
```typescript
// src/hooks/use-part-status.test.ts lines 9-15
function mockFetchResponse(body: unknown, status = 200) {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response)
}
```

**beforeEach/afterEach setup** (lines 18-25):
```typescript
// src/hooks/use-part-status.test.ts lines 18-25
describe('usePartStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    global.fetch = vi.fn() as unknown as typeof fetch
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })
```

**For PartDetail.test.tsx** — import from `@testing-library/react` (render, screen, fireEvent) rather than renderHook. Mock `fetch` for both API endpoints. Test coverage per RESEARCH.md test map:
- Renders all 5 metadata fields when loaded
- StatusBadge color per status value
- Skeleton shown while loading (isLoading=true)
- 404 error-state when API returns 404
- Download button disabled when status !== 'ready'
- Download button calls `/api/parts/[id]/download` and sets `window.location.href`

---

### `src/hooks/usePartDetail.test.ts` (Vitest unit test)

**Analog:** `src/hooks/use-part-status.test.ts` — exact structural match

Copy the full beforeEach/afterEach/mockFetchResponse pattern (lines 9-25). Test coverage:
- Returns `{ part, thumbnailUrls, isLoading: false }` after successful parallel fetch
- Returns `{ error: 'not_found' }` when parts API returns 404
- `thumbnailUrls` defaults to `[]` when `/thumbnails` returns non-ok response
- `isLoading` is `true` initially, `false` after Promise.all resolves
- Uses `act(async () => { await Promise.resolve() })` to flush promises

---

### `tests/phase-09-part-detail.spec.ts` (Playwright E2E)

**Analog:** `tests/phase-08-results-ui.spec.ts`

**File header + imports** (lines 1-4):
```typescript
// tests/phase-08-results-ui.spec.ts lines 1-4
import { test, expect } from '@playwright/test'
```

**Mock fixture definition** (lines 6-17):
```typescript
// tests/phase-08-results-ui.spec.ts lines 6-17
const mockSearchResponse = {
  results: [ ... ],
  query: { threshold: 0, limit: 50, results_count: 3 },
}
```

**Route mocking pattern** (lines 22-35):
```typescript
// tests/phase-08-results-ui.spec.ts lines 22-35
async function setupMocks(page) {
  await page.route('**/api/search**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockSearchResponse),
    })
  })
  await page.route('**/api/parts/*/thumbnail**', async route => {
    await route.fulfill({ status: 404 })
  })
}
```

**test.describe block + goto pattern** (lines 19-55):
```typescript
// tests/phase-08-results-ui.spec.ts lines 19-55
test.describe('Phase 8: Results UI', () => {
  test('SEARCH-03: Ergebnis-Grid sichtbar nach Suche', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/search')
    await uploadAndSearch(page)

    await expect(page.getByText('Flanschplatte')).toBeVisible({ timeout: 10_000 })
  })
```

**toBeVisible + timeout pattern** (lines 53-61):
```typescript
// tests/phase-08-results-ui.spec.ts lines 53-61
await expect(page.getByText('Flanschplatte')).toBeVisible({ timeout: 10_000 })
await expect(page.getByText('Schraubenring')).toBeVisible()
```

**For `phase-09-part-detail.spec.ts`** — adapt these routes:
- Mock `**/api/parts/*/thumbnail**` → `**/api/parts/*/thumbnails**` (plural, returns `{ urls: [] }`)
- Mock `**/api/parts/[id]**` → returns mock part fixture
- Mock `**/api/parts/*/download**` → returns `{ url: 'https://s3.example.com/...', filename: 'Flansch_M12.step' }`
- `page.goto('/parts/test-uuid')` directly (no upload flow needed)
- E2E covers: DETAIL-01 (5 fields visible) + DETAIL-02 (download button state + click behavior)

---

## Shared Patterns

### UUID Validation (Security-critical — apply to ALL 3 new route handlers)

**Source:** `src/app/api/parts/[id]/thumbnail/route.ts` lines 13-31
```typescript
const ParamsSchema = z.object({
  id: z.string().uuid('id muss eine gültige UUID sein'),
})

// First operation in every GET handler — before DB or S3:
const parsed = ParamsSchema.safeParse({ id })
if (!parsed.success) {
  return NextResponse.json(
    { error: 'Invalid id', details: parsed.error.flatten() },
    { status: 400 }
  )
}
```

### Next.js 16 Params as Promise

**Source:** `src/app/api/parts/[id]/thumbnail/route.ts` line 20-22
**Apply to:** ALL new route handlers AND `parts/[id]/page.tsx`
```typescript
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }   // Next.js 16: params ist Promise
): Promise<NextResponse> {
  const { id } = await params
```

### HeadObject Before getSignedUrl (Race Condition Guard)

**Source:** `src/app/api/parts/[id]/thumbnail/route.ts` lines 47-52
**Apply to:** `thumbnails/route.ts` and `download/route.ts`
```typescript
// 4. HeadObject prüft Existenz BEVOR signiert wird (Pitfall 5: race condition)
try {
  await s3.send(new HeadObjectCommand({ Bucket: BUCKET_THUMBNAILS, Key: key }))
} catch {
  return NextResponse.json({ error: 'Thumbnail object missing' }, { status: 404 })
}
```

### Presigned URL Generation (60s TTL pattern)

**Source:** `src/app/api/parts/[id]/thumbnail/route.ts` lines 55-64
**Apply to:** `thumbnails/route.ts` (60s), `download/route.ts` (300s)
```typescript
let url: string
try {
  url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET_THUMBNAILS, Key: key }),
    { expiresIn: 60 }
  )
} catch {
  return NextResponse.json({ error: 'Failed to generate thumbnail URL' }, { status: 500 })
}
```

### useEffect Dependency Anti-Pattern (Prevent Infinite Loop)

**Source:** `src/app/admin/CatalogTable.tsx` lines 200-203
**Apply to:** `usePartDetail.ts` and `PartDetail.tsx`
```typescript
// thumbnailUrls aus Deps entfernen um Endlosschleife zu vermeiden
// eslint-disable-next-line react-hooks/exhaustive-deps
}, [parts])
// For usePartDetail: }, [id])  — ONLY [id], never [thumbnailUrls]
```

### Skeleton While Loading

**Source:** `src/app/search/SearchResultCard.tsx` lines 53-64
**Apply to:** `PartDetail.tsx` main image and thumbnail strip
```typescript
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
```

### Server-Only File Header Comment

**Source:** `src/app/api/parts/[id]/thumbnail/route.ts` lines 1-5
**Apply to:** ALL new API route files
```typescript
// src/app/api/parts/[id]/thumbnails/route.ts
// GET /api/parts/[id]/thumbnails — D-13
// Liefert Array von 60-Sekunden-Presigned-S3-URLs für view_0..view_N.png.
// Server-only — KEIN "use client", keine Browser-Imports.
```

### Fetch Mock Setup in Tests

**Source:** `src/hooks/use-part-status.test.ts` lines 18-25
**Apply to:** `PartDetail.test.tsx` and `usePartDetail.test.ts`
```typescript
beforeEach(() => {
  vi.useFakeTimers()
  global.fetch = vi.fn() as unknown as typeof fetch
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})
```

---

## No Analog Found

All files have close analogs in the codebase.

---

## Metadata

**Analog search scope:** `src/app/api/parts/`, `src/app/search/`, `src/app/admin/`, `src/hooks/`, `tests/`
**Files scanned:** 9 source files read directly
**Pattern extraction date:** 2026-05-09
