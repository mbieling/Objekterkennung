---
phase: 04-ingestion-ui
reviewed: 2026-05-08T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - src/app/api/parts/[id]/status/route.test.ts
  - src/app/api/parts/[id]/status/route.ts
  - src/app/api/parts/[id]/thumbnail/route.test.ts
  - src/app/api/parts/[id]/thumbnail/route.ts
  - src/app/page.tsx
  - src/app/upload/page.tsx
  - src/app/upload/UploadForm.test.tsx
  - src/app/upload/UploadForm.tsx
  - src/hooks/use-part-status.test.ts
  - src/hooks/use-part-status.ts
  - src/lib/s3.ts
  - supabase/migrations/002_add_thumbnail_count.sql
  - tests/phase-04-upload.spec.ts
  - vitest.config.ts
findings:
  critical: 3
  warning: 5
  info: 2
  total: 10
status: issues_found
---

# Phase 4: Code Review Report

**Reviewed:** 2026-05-08
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

The implementation covers the five-step upload flow (hash → init → S3 PUT → confirm → poll), the two read-only API routes (`/status`, `/thumbnail`), and the polling hook. UUID validation before DB/S3 access is present and correctly blocks invalid inputs. The `uploadToS3` function intentionally omits `Content-Type` to avoid invalidating the presigned-URL signature — that decision is sound per the documented research.

Three blockers were found: a stale closure in the interval-switch logic that makes the 2s → 5s interval handoff unreliable; a missing `AbortController` signal on the thumbnail `fetch` call in `UploadForm`, which fires state updates on an unmounted component; and an unprotected presigned-URL generation step where an `getSignedUrl` error is unhandled and will crash the route with an unformatted 500. Five warnings cover: interval drift causing the slow-phase to be re-entered on every tick; the error type of thrown S3 errors being silently swallowed; thumbnail `fetch` errors being swallowed with an empty catch; the `duplicateId` alert rendering after `phase` is reset; and a `DECOMPOSEDS3_ENDPOINT` typo in the env-variable name check that will silently miss the intended local-override variable.

---

## Critical Issues

### CR-01: Stale closure — interval-switch logic never fires correctly

**File:** `src/hooks/use-part-status.ts:79-89`

**Issue:** `tick()` reads `intervalId` via closure, but `intervalId` is re-assigned inside `tick` itself. Because `setInterval(tick, FAST_INTERVAL_MS)` captures the value of `intervalId` at the time the closure is created (which is `null` at call time — the assignment happens on line 89, *after* `tick` is defined), `clearInterval(intervalId)` inside `tick` is called with `null` on the first invocation where `elapsed >= 30_000`. The interval is never cleared, so a new `setInterval(tick, SLOW_INTERVAL_MS)` is added every 5 seconds from that point on, creating an ever-growing set of concurrent intervals that each fire `fetchStatus` independently.

Concretely: after 30 s the hook fires at least two parallel intervals — one from the original `setInterval(tick, FAST_INTERVAL_MS)` (which was never cleared) and one from each subsequent `setInterval(tick, SLOW_INTERVAL_MS)`. This multiplies network requests and can cause rapid-fire state updates.

The root cause is that `intervalId` must be held in a `ref` (not a plain `let`) so that reassignments are visible inside the closure.

**Fix:**
```typescript
// Replace the plain let with a ref declared before useEffect:
const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

// Inside tick():
const tick = () => {
  if (stopped) return
  const elapsed = Date.now() - startedAt
  if (elapsed >= FAST_PHASE_DURATION_MS && intervalRef.current) {
    clearInterval(intervalRef.current)
    intervalRef.current = setInterval(tick, SLOW_INTERVAL_MS)
  }
  fetchStatus()
}
intervalRef.current = setInterval(tick, FAST_INTERVAL_MS)

// Cleanup:
return () => {
  stopped = true
  controller.abort()
  if (intervalRef.current) clearInterval(intervalRef.current)
  if (timeoutId) clearTimeout(timeoutId)
}
```

---

### CR-02: Thumbnail fetch in UploadForm fires state update on unmounted component

**File:** `src/app/upload/UploadForm.tsx:106-111`

**Issue:** When `polledStatus === 'ready'` the component calls `fetch('/api/parts/${partId}/thumbnail')` as a bare promise chain inside a `useEffect`. There is no `AbortController` and no `isMounted` guard. If the user navigates away (or `UploadForm` unmounts) while the fetch is in flight, the `.then` callbacks fire and call `setThumbnailUrl(url)` and `setPhase('ready')` on the already-unmounted component. In React 18 strict mode this raises a warning; in production it silently sets state on stale closures and can prevent garbage collection of the component tree until the request resolves (up to 60 s, the presigned-URL expiry).

Additionally, the `useEffect` dependency array includes `partId` and `phase`, so this effect re-runs whenever `phase` changes. Because setting `phase('ready')` inside the `.then` is one of those changes, care must be taken that the guard condition `polledStatus === 'ready' && phase === 'polling'` truly prevents repeated fetches — it does for the `setPhase` path, but if `thumbnailUrl` is still `null` and the effect runs again with `phase === 'ready'`, the thumbnail fetch is *not* re-issued (condition fails), which is correct. The unmount-safety issue remains regardless.

**Fix:**
```typescript
useEffect(() => {
  if (polledStatus === 'ready' && phase === 'polling') {
    setPhase('ready')
    const controller = new AbortController()
    fetch(`/api/parts/${partId}/thumbnail`, { signal: controller.signal })
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`thumb HTTP ${r.status}`)))
      .then(({ url }: { url: string }) => setThumbnailUrl(url))
      .catch((e) => {
        if (e?.name === 'AbortError') return   // unmount — expected
        // Skeleton stays visible per UI-SPEC
      })
    return () => controller.abort()
  }
  if (polledStatus === 'failed' && phase === 'polling') setPhase('failed')
  if (timedOut && phase === 'polling') setPhase('failed')
}, [polledStatus, phase, partId, timedOut])
```

---

### CR-03: Unhandled `getSignedUrl` error returns unformatted 500

**File:** `src/app/api/parts/[id]/thumbnail/route.ts:55-59`

**Issue:** The `getSignedUrl` call on lines 55–59 is outside any try/catch block. If the AWS SDK throws (e.g., due to a credential error, region mismatch, or transient network issue), Next.js will catch the unhandled rejection and return an unformatted HTML 500 error page — not the JSON error shape that all other routes in this codebase return. This breaks the API contract and exposes stack traces in development (and potentially in production depending on Next.js configuration).

The `HeadObjectCommand` on line 49 is correctly wrapped in try/catch, but `getSignedUrl` is not.

**Fix:**
```typescript
let url: string
try {
  url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET_THUMBNAILS, Key: key }),
    { expiresIn: 60 }
  )
} catch {
  return NextResponse.json({ error: 'Failed to generate URL' }, { status: 500 })
}
return NextResponse.json({ url })
```

---

## Warnings

### WR-01: `tick()` re-enters slow-phase on every subsequent tick after 30 s

**File:** `src/hooks/use-part-status.ts:82-86`

**Issue:** Even after the fix for CR-01 (using a ref), the logic `if (elapsed >= FAST_PHASE_DURATION_MS)` is evaluated on every tick. Once `elapsed >= 30_000` is true it remains true on every subsequent tick, so the interval is cleared and re-created from scratch every 5 seconds. This produces the correct firing frequency but leaks one interval per tick. A boolean flag should gate the transition so it happens exactly once.

**Fix:**
```typescript
let slowPhase = false

const tick = () => {
  if (stopped) return
  if (!slowPhase && Date.now() - startedAt >= FAST_PHASE_DURATION_MS) {
    slowPhase = true
    if (intervalRef.current) clearInterval(intervalRef.current)
    intervalRef.current = setInterval(tick, SLOW_INTERVAL_MS)
  }
  fetchStatus()
}
```

---

### WR-02: S3 `HeadObjectCommand` error type is silently discarded — `NoSuchKey` check is unreliable

**File:** `src/app/api/parts/[id]/thumbnail/route.ts:48-52`

**Issue:** The catch block on lines 50–52 returns 404 `'Thumbnail object missing'` for *any* error thrown by `HeadObjectCommand` — including permission errors (403), bucket-not-found (NoSuchBucket), or credential failures. A credential misconfiguration will appear to callers as "thumbnail missing" rather than a server error, making operational diagnosis difficult and potentially masking infrastructure problems silently. The test (line 93 in `route.test.ts`) also uses `new Error('NoSuchKey')` rather than the actual AWS SDK `NoSuchKey` error class, so the test does not prove correct error discrimination.

**Fix:**
```typescript
import { NoSuchKey } from '@aws-sdk/client-s3'

try {
  await s3.send(new HeadObjectCommand({ Bucket: BUCKET_THUMBNAILS, Key: key }))
} catch (e) {
  if (e instanceof NoSuchKey) {
    return NextResponse.json({ error: 'Thumbnail object missing' }, { status: 404 })
  }
  // Unexpected S3 error — do not leak details
  return NextResponse.json({ error: 'Storage error' }, { status: 500 })
}
```

---

### WR-03: Thumbnail `fetch` errors are silently swallowed

**File:** `src/app/upload/UploadForm.tsx:109-111`

**Issue:** The `.catch(() => { /* silent */ })` on line 109 discards any non-abort error from the thumbnail fetch. The comment says "Skeleton bleibt sichtbar" — which is the intended UX — but the error is never surfaced anywhere, not even logged. If the thumbnail API consistently returns 5xx (e.g., due to a misconfigured S3 credential), the user sees an infinite skeleton with no indication that something is wrong and no path to diagnose it. At minimum the error should be stored so the UI can show a fallback message after a timeout or retry.

**Fix:**
```typescript
.catch((e: unknown) => {
  if ((e as Error)?.name === 'AbortError') return
  // Store error so UI can eventually show a "thumbnail unavailable" message
  // rather than an indefinite skeleton
  console.error('[thumbnail fetch]', e)  // dev/ops visibility
})
```
A proper fix would set a `thumbnailError` state that the component uses to replace the `<Skeleton>` with a "Vorschau nicht verfügbar" message after the upload is otherwise complete.

---

### WR-04: `duplicateId` alert visible momentarily after reset

**File:** `src/app/upload/UploadForm.tsx:193-202`

**Issue:** In `handleReset()`, `setDuplicateId(null)` is called after `form.reset()` and `setPhase('idle')`. React batches these state updates in React 18, so in practice this is likely safe. However, if a future React version or a Suspense boundary flushes state updates incrementally, there is a window where `phase === 'idle'` and `duplicateId !== null` simultaneously — the alert would flash visible because `isFormDisabled` is `false` (idle) but the `duplicateId` block (line 235) renders unconditionally on `duplicateId` rather than on `phase === 'duplicate'`. The condition is `{duplicateId && ...}` not `{phase === 'duplicate' && duplicateId && ...}`.

**Fix:**
```tsx
{phase === 'duplicate' && duplicateId && (
  <Alert variant="destructive">
    <AlertCircle className="h-4 w-4" />
    <AlertDescription>
      Diese Datei existiert bereits — Teil-ID: {duplicateId}
    </AlertDescription>
  </Alert>
)}
```

---

### WR-05: `DECOMPOSEDS3_ENDPOINT` typo in `s3.ts` — local-override endpoint never applies

**File:** `src/lib/s3.ts:12`

**Issue:** The environment variable checked for local S3 override is named `DECOMPOSEDS3_ENDPOINT` (no underscore between `DECOMPOSED` and `S3`). The intended variable name based on context is almost certainly `DECOMPOSED_S3_ENDPOINT` or `LOCAL_S3_ENDPOINT`. If the intended `.env.local` variable is spelled differently (e.g., `LOCAL_S3_ENDPOINT`), the condition `process.env.DECOMPOSEDS3_ENDPOINT` will always be `undefined` and the endpoint override will never be applied in local development. This means all local development hits real AWS endpoints, which risks accidental writes to production buckets and incurs unexpected costs.

**Fix:**
Choose a consistent name — e.g., `LOCAL_S3_ENDPOINT` — and use it everywhere:
```typescript
...(process.env.LOCAL_S3_ENDPOINT
  ? { endpoint: process.env.LOCAL_S3_ENDPOINT, forcePathStyle: true }
  : {}),
```
Update `.env.local.example` to document `LOCAL_S3_ENDPOINT=http://localhost:9000`.

---

## Info

### IN-01: `vitest.config.ts` loads `.env.local` unconditionally — leaks real credentials into unit test runs

**File:** `vitest.config.ts:4-7`

**Issue:** `config({ path: '.env.local' })` is called at the top of `vitest.config.ts` without any environment guard. This means real AWS credentials and the production Supabase URL are loaded whenever unit tests run, even tests that mock all external dependencies. If a mock is accidentally omitted or `vi.clearAllMocks()` runs before the mock is registered, a unit test can silently hit a production service. Conventionally, `.env.test` should hold test-specific (fake/local) credentials, and `.env.local` credentials should only be loaded for integration test runs.

**Fix:**
```typescript
// Only load .env.local for integration/e2e tests, not unit tests.
// Separate integration tests into a distinct vitest project or use VITEST_ENV=integration guard:
if (process.env.VITEST_ENV === 'integration') {
  config({ path: '.env.local' })
}
```
Or maintain a `.env.test` with safe placeholder values that Vitest loads by default.

---

### IN-02: `pollError` alert copy reads "Upload fehlgeschlagen" — misleading context

**File:** `src/app/upload/UploadForm.tsx:436-442`

**Issue:** The alert shown when `pollError` is truthy says "Upload fehlgeschlagen. Bitte Verbindung prüfen und erneut versuchen." The upload itself has already completed successfully at this point (the file is in S3, the confirm endpoint returned 202). The error is a polling network error, not an upload failure. This misleads the user into re-uploading a file that is already in the system, potentially creating duplicate records (depending on duplicate-detection logic in the init endpoint).

**Fix:**
```tsx
<AlertDescription>
  Statusabfrage fehlgeschlagen. Bitte Verbindung prüfen — die Datei wurde bereits hochgeladen.
</AlertDescription>
```

---

_Reviewed: 2026-05-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
