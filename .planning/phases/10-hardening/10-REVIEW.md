---
phase: 10-hardening
reviewed: 2026-05-09T00:00:00Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src/app/admin/CatalogTable.tsx
  - src/app/api/parts/route.test.ts
  - src/app/api/parts/route.ts
  - src/app/search/CameraCapture.tsx
  - src/app/upload/UploadForm.test.tsx
  - src/app/upload/UploadForm.tsx
  - tsconfig.json
findings:
  critical: 3
  warning: 6
  info: 3
  total: 12
status: issues_found
---

# Phase 10: Code Review Report

**Reviewed:** 2026-05-09T00:00:00Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

This review covers Phase 10 (Hardening) changes: server-side pagination in the admin catalog, error states, and mobile touch target polish. The API route (`route.ts`) is structurally sound — tagged template literals prevent SQL injection and Zod guards all query parameters. The React components are well-structured with explicit state machines. However, three blockers were identified: a LIKE-injection vulnerability in the search pattern, an open-redirect/SSRF risk from un-validated thumbnail URLs rendered via `src`, and a pagination display bug when `totalCount` is 0. Six additional warnings cover duplicated async logic, a stale-closure risk in optimistic rollback, a missing file-size guard in the camera upload path, inconsistent error handling on retry, and test coverage gaps.

---

## Critical Issues

### CR-01: LIKE Wildcard Injection via `search` Parameter

**File:** `src/app/api/parts/route.ts:43,47,69,73`

**Issue:** The search term is interpolated directly into the LIKE pattern via string concatenation:
```ts
const searchPattern = `%${search}%`
```
The Zod schema validates `search` only for maximum length (200 chars). A user-supplied value containing `%` or `_` wildcard characters becomes part of the pattern itself, allowing the user to craft arbitrary LIKE patterns (e.g., `search=%%%%` matches everything regardless of other filters, or `search=a_b` matches patterns that would not otherwise match). This is a query-semantic injection: the caller controls SQL pattern metacharacters. While this does not allow data exfiltration beyond what the query already returns, it allows bypassing the intended filter intent, causes excessive DB load (degenerate patterns), and is a violation of parameterized-query hygiene.

**Fix:** Escape `%` and `_` before constructing the pattern:
```ts
function escapeLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

const searchPattern = `%${escapeLike(search)}%`
```
Then add `ESCAPE '\'` to each ILIKE clause:
```sql
AND (name ILIKE ${searchPattern} ESCAPE '\' OR part_number ILIKE ${searchPattern} ESCAPE '\')
```

---

### CR-02: Unvalidated External URL Rendered as `<img src>` (Open Redirect / Content Spoofing)

**File:** `src/app/admin/CatalogTable.tsx:426–430` and `src/app/upload/UploadForm.tsx:455–459`

**Issue:** The thumbnail URL returned by `/api/parts/:id/thumbnail` is inserted directly into `<img src={thumbnailUrls[part.id]}>` and `<img src={thumbnailUrl}>` without any origin validation. If the thumbnail API ever returns an attacker-controlled URL (e.g., due to a compromised storage record, path manipulation in the backend, or future SSRF in the thumbnail route), the browser will fetch and render content from an arbitrary external origin. This also exposes the user's IP/session to a third-party server via a credentialed request context. Given that the thumbnail URL originates from a database field set by the server-side worker, and is transmitted through the API response which the component trusts completely, any injection at that layer (DB row tampering, insecure direct object references, or future bugs in the thumbnail route) flows directly to the DOM.

**Fix:** Validate that the URL belongs to an expected origin before rendering. A targeted fix using `URL` parsing:
```ts
function isSafeImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    // Allow only your Supabase storage bucket and expected CDN origins
    return parsed.protocol === 'https:' &&
      (parsed.hostname.endsWith('.supabase.co') ||
       parsed.hostname.endsWith('.supabase.in'))
  } catch {
    return false
  }
}

// In render:
{thumbnailUrls[part.id] && isSafeImageUrl(thumbnailUrls[part.id]) ? (
  <img src={thumbnailUrls[part.id]} ... />
) : (
  <Skeleton ... />
)}
```
The allowed hostnames should be derived from environment variables, not hardcoded.

---

### CR-03: Pagination Counter Displays "Zeige 1–0 von 0" When No Results Match Filter

**File:** `src/app/admin/CatalogTable.tsx:565`

**Issue:** The counter text is:
```ts
Zeige {Math.min((currentPage - 1) * ROWS_PER_PAGE + 1, totalCount)}–{Math.min(currentPage * ROWS_PER_PAGE, totalCount)} von {totalCount} Teilen
```
When `totalCount === 0` but `parts.length > 0` is temporarily true due to a race condition (old `parts` state not yet cleared while `totalCount` has been reset to 0 from a new fetch), the display reads "Zeige 1–0 von 0 Teilen". More concretely: the condition that shows the pagination block is `totalPages > 1 && parts.length > 0` (line 510), so under normal flow this only renders when there are parts. However, if a tab/search change sets `totalCount = 0` and `totalPages = 1` but `setIsLoading` hasn't cleared `parts` yet (since `setParts` is called after `setTotalCount`), the block is suppressed by `isLoading`. The actual persistent bug is the formula itself: when `totalCount = 0`, the expression `(currentPage - 1) * ROWS_PER_PAGE + 1` evaluates to `1`, so the label reads "Zeige 1–0 von 0" which is nonsensical.

**Fix:** Guard for the zero case:
```ts
{totalCount === 0
  ? 'Keine Teile gefunden'
  : `Zeige ${Math.min((currentPage - 1) * ROWS_PER_PAGE + 1, totalCount)}–${Math.min(currentPage * ROWS_PER_PAGE, totalCount)} von ${totalCount} Teilen`
}
```

---

## Warnings

### WR-01: Duplicated `handleSearch` / `handleSearchWithLimit` Logic — Divergence Risk

**File:** `src/app/search/CameraCapture.tsx:173–243`

**Issue:** `handleSearch` (lines 173–209) and `handleSearchWithLimit` (lines 212–243) are nearly identical. Both construct the same `FormData`, create the same `AbortController`, call the same endpoint with the same error-handling logic, and differ only in which `limit` value they use. This is a maintainability issue today but will become a correctness issue: any future change to error handling, the endpoint URL, or abort behavior must be applied in two places. The duplication already contains one divergence: in `handleSearch`, the request URL uses `displayLimit` from state (line 183), while in `handleSearchWithLimit`, it uses the passed `newLimit` argument (line 222). Since `handleSearch` is called from the `captured` state's "Suchen" button before `displayLimit` could have been changed, this is consistent for now — but fragile.

**Fix:** Extract a shared `executeSearch(limit: number)` helper and have both handlers call it:
```ts
async function executeSearch(limit: number) {
  if (!capturedBlob) return
  setPhase('searching')
  setErrorMessage(null)
  const formData = new FormData()
  formData.append('image', capturedBlob, 'capture.jpg')
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30_000)
  try {
    const res = await fetch(`/api/search?threshold=0&limit=${Math.max(50, limit)}`, {
      method: 'POST', body: formData, signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    setSearchResult(await res.json())
    setPhase('result')
  } catch (err) { /* shared error handling */ }
  finally { clearTimeout(timeoutId) }
}
```

---

### WR-02: `onLimitChange` is a No-Op in the `searching` Re-Search Overlay

**File:** `src/app/search/CameraCapture.tsx:359`

**Issue:** When `phase === 'searching'` and a previous result exists (re-search overlay), `SearchResults` is rendered with `onLimitChange={() => {}}` (an empty function). This means a user who attempts to change the result limit during an active re-search receives no response and no feedback. The limit change is silently dropped. If the user quickly changes the limit while a search is already in flight, their intent is lost.

**Fix:** Either disable the limit select in `SearchResults` during searching, or queue the limit change to apply after the in-flight request completes:
```tsx
onLimitChange={phase === 'searching' ? () => {} : (newLimit) => {
  setDisplayLimit(newLimit)
  handleSearchWithLimit(newLimit)
}}
```
And expose a `disabled` prop to `SearchResults` to grey out controls during searching.

---

### WR-03: Optimistic Rollback in `handleSave` Uses Stale Closure Over `editPart`

**File:** `src/app/admin/CatalogTable.tsx:264–298`

**Issue:** `handleSave` captures `editPart` from the component closure at the time the form is submitted. The rollback on failure (line 293) references the same `editPart`:
```ts
setParts(prev => prev.map(p => (p.id === editPart.id ? editPart : p)))
```
If the user opens a second part's edit sheet (updating `editPart` state) while the previous save request is still in flight, the rollback will restore the wrong part data — the currently open part's data will overwrite the in-flight save's original data. The Sheet closing behavior ("Sheet bleibt offen") makes this scenario more likely.

**Fix:** Capture a snapshot of `editPart` inside `handleSave` before any async operation:
```ts
const handleSave = async (values: EditValues) => {
  if (!editPart) return
  const snapshot = editPart  // captured before any await
  const updatedPart: Part = { ...snapshot, ... }
  setParts(prev => prev.map(p => (p.id === snapshot.id ? updatedPart : p)))
  try {
    // ...
  } catch {
    setParts(prev => prev.map(p => (p.id === snapshot.id ? snapshot : p)))
    // ...
  }
}
```

---

### WR-04: File Size Not Validated for Camera-Captured Blobs Before Upload

**File:** `src/app/search/CameraCapture.tsx:57–73`

**Issue:** `captureFrame` produces a JPEG blob with no upper bound check. While the `MAX_WIDTH = 1024` constraint limits dimensions, a very high-detail scene could still produce a JPEG that exceeds a reasonable payload size. The `handleFileSelect` path correctly checks `file.type` but does NOT check `file.size` before setting `capturedBlob`. More critically, for camera-captured blobs (`handleCapture`), there is no size check at all before POSTing to `/api/search`. A server-side body size limit may reject the request with a non-informative error that gets classified as a generic "Suche fehlgeschlagen" message.

**Fix:** Add a size guard after `captureFrame` and after file selection:
```ts
const MAX_IMAGE_BYTES = 5 * 1024 * 1024  // 5 MB

// In handleCapture:
const blob = await captureFrame(videoRef.current)
if (blob.size > MAX_IMAGE_BYTES) {
  setErrorMessage('Aufnahme ist zu groß. Bitte Umgebungsbeleuchtung verbessern und erneut versuchen.')
  return
}

// In handleFileSelect:
if (file.size > MAX_IMAGE_BYTES) {
  setErrorMessage(`Datei ist zu groß (${Math.round(file.size / 1024 / 1024)} MB). Maximal: 5 MB.`)
  return
}
```

---

### WR-05: `handleRetry` and `handleArchive` Silently Suppress All Errors Except Toast

**File:** `src/app/admin/CatalogTable.tsx:300–343`

**Issue:** Both `handleArchive` and `handleRetry` catch exceptions, roll back the optimistic update, and show a toast — but the catch block swallows all error types including `TypeError` (network unavailable), which would make the rollback occur without the user understanding why. More importantly, if the rollback itself throws (e.g., `parts.find` returns `undefined` because the part was already removed by another action), the secondary error is also silently swallowed. The `handleDeleteConfirm` function also lacks any feedback in the success path (no toast on successful delete), while `handleSave` shows a success toast — inconsistent behavior.

**Fix:** Add a success toast to `handleDeleteConfirm`:
```ts
toast.success('Bauteil gelöscht.')
```
And ensure `handleRetry`/`handleArchive` always guard against `original` being undefined before using it in the rollback (it already guards `if (!original) return` at the start, but the rollback `setParts` callback should use optional chaining).

---

### WR-06: `route.test.ts` — Invalid `status` Filter Not Tested; `search` Injection Not Tested

**File:** `src/app/api/parts/route.test.ts:67–74`

**Issue:** The test "filtert nach status wenn angegeben" only verifies that a valid `status=failed` returns HTTP 200 — it does not verify that the `status` filter is actually applied to the database query (the mock `mockDb` returns an empty array regardless, making the test pass trivially). More critically, there is no test for:
1. An invalid `status` value (e.g., `status=malicious`) which should return HTTP 400 but is not tested.
2. The `search` parameter with LIKE-metacharacter input (e.g., `search=%`), which is the CR-01 issue above.
3. `limit` boundary values (`limit=0` should return 400; `limit=101` should return 400).

The test for `page=0` (line 60) correctly verifies 400, but the equivalent negative cases for `limit` and `status` are missing, leaving the Zod validation partially untested.

**Fix:** Add tests:
```ts
it('gibt HTTP 400 zurück bei ungültigem status-Parameter', async () => {
  const response = await GET(makeRequest({ status: 'invalid' }))
  expect(response.status).toBe(400)
})

it('gibt HTTP 400 zurück wenn limit=0 angegeben', async () => {
  const response = await GET(makeRequest({ limit: '0' }))
  expect(response.status).toBe(400)
})
```

---

## Info

### IN-01: `Label` Import Unused Pattern in CatalogTable

**File:** `src/app/admin/CatalogTable.tsx:68`

**Issue:** `Label` is imported from `@/components/ui/label` and used only once (line 686) for a read-only "Erstellt am" display. This is an unusual mix: all other form fields use `FormLabel` from the `Form` primitives. Using a bare `Label` outside a `FormItem`/`FormField` context is not wrong, but it is inconsistent with the rest of the form and means the "Erstellt am" section is not integrated into the form's accessibility tree the same way as the other fields.

**Fix:** Either wrap in a `FormItem`-style container for consistency, or keep as-is (acceptable if intentionally read-only and outside the form schema).

---

### IN-02: `FileInputTrigger` as JSX Variable Rather Than Component

**File:** `src/app/search/CameraCapture.tsx:248–253`

**Issue:** `FileInputTrigger` is defined as a `const` holding JSX (not a function component). This pattern prevents React from treating it as a proper component — it will not have its own reconciliation context, and hooks could not be added to it in the future. It also uses a non-function JSX variable, which is a code smell that can confuse linters and developers.

**Fix:** Convert to a named sub-component:
```tsx
function FileInputTrigger({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" className="w-full min-h-[44px]" onClick={onClick}>
      <Upload className="mr-2 h-4 w-4" />
      Foto aus Galerie wählen
    </Button>
  )
}
// Usage: <FileInputTrigger onClick={() => fileInputRef.current?.click()} />
```

---

### IN-03: `UploadForm.test.tsx` — `makeFile` Size Capped at 100 Bytes for Content

**File:** `src/app/upload/UploadForm.test.tsx:10`

**Issue:** The `makeFile` helper caps the blob content at `Math.min(sizeBytes, 100)` characters but then overrides `file.size` to `sizeBytes` via `Object.defineProperty`. This works for the current tests (which only check the `size` property), but the actual blob content does not match `sizeBytes`. If a future test exercises code that reads `file.arrayBuffer()` (e.g., verifying SHA-256 computation on actual content), the actual bytes will not match the declared size. The comment says "damit Validierung korrekt auslöst" but this approach is fragile.

**Fix:** Document the constraint explicitly with a comment, or use a separate `makeLargeFile` helper for size-validation-only tests:
```ts
// Note: blob content is truncated to 100 bytes; only file.size is authoritative.
// Do not use this for tests that read file content.
```

---

_Reviewed: 2026-05-09T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
