---
status: issues_found
phase: 06-search-pipeline
reviewed: 2026-05-09T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/app/api/search/route.ts
  - src/app/api/search/route.test.ts
  - worker/main.py
  - worker/tests/test_embed.py
findings:
  critical: 4
  warning: 4
  info: 2
  total: 10
---

# Phase 06: Code Review Report

**Reviewed:** 2026-05-09
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Four files were reviewed: the Next.js search API route, its test suite, the Python FastAPI worker, and the worker's test stubs. The search pipeline has several serious defects. The most critical are a SQL injection vector via unvalidated embedding data injected as a raw string into a SQL literal, a complete absence of authentication on the search endpoint, an unvalidated and unbounded `s3_key` input in the Python worker that enables path traversal, and a crash risk from missing error handling on the `embedResponse.json()` call. Four warnings cover lesser but still meaningful issues around file size validation, worker response shape validation, SSRF exposure via `WORKER_URL`, and a boto3 client being instantiated on every request. All test stubs in `test_embed.py` are skipped and provide zero coverage.

---

## Critical Issues

### CR-01: SQL Injection via Raw Embedding String Literal

**File:** `src/app/api/search/route.ts:129`

**Issue:** The embedding returned by the worker is placed directly into a SQL string literal using string interpolation (`[${embedding.join(',')}]`) and then spliced into the query as `${embeddingLiteral}::vector`. Although Neon's tagged-template client parameterizes `${embeddingLiteral}` as a bind parameter, the value passed is a string that pgvector will parse. The critical problem is that `embedding` is typed as `number[]` but is sourced from `await embedResponse.json()` with a plain `as` cast — there is **no runtime validation** that the returned JSON actually contains an array of numbers. If the worker (or a man-in-the-middle) returns strings, objects, or crafted values inside the array, `embedding.join(',')` will interpolate arbitrary text into the vector literal, potentially producing malformed SQL or — depending on the pgvector version and driver behavior — enabling injection when the literal is later coerced. The `as { embedding: number[] }` cast is a lie; TypeScript does not check it at runtime.

**Fix:** Validate the worker response with Zod before use:

```typescript
import { z } from 'zod'

const EmbedResponseSchema = z.object({
  embedding: z.array(z.number()).length(768),
})

const parsed = EmbedResponseSchema.safeParse(await embedResponse.json())
if (!parsed.success) {
  await cleanupTempS3(tempKey)
  return NextResponse.json({ error: 'Ungültiges Embedding vom Worker' }, { status: 502 })
}
const { embedding } = parsed.data
```

This also eliminates the unsafe `as` cast and ensures exactly 768 floats are present before the literal is constructed.

---

### CR-02: No Authentication on the Search Endpoint

**File:** `src/app/api/search/route.ts:32`

**Issue:** `POST /api/search` performs a full S3 upload, a synchronous worker HTTP call (DINOv2 inference), and a pgvector query — all without checking whether the caller is authenticated. Any unauthenticated party on the internet can:
- Drive up S3 storage and transfer costs by spamming uploads
- Saturate the worker's GPU/CPU with embedding inference requests
- Enumerate the parts database (the response returns `id`, `name`, `part_number`, `project` for all `status = 'ready'` rows that match)

The project's security rules (`.claude/rules/security.md`) mandate "Always verify authentication before processing API requests" and "Use Supabase RLS as a second line of defense."

**Fix:** Add a Supabase session check at the top of `POST`, before any S3 or worker interaction:

```typescript
import { createClient } from '@/lib/supabase-server' // server-side client

const supabase = createClient()
const { data: { user } } = await supabase.auth.getUser()
if (!user) {
  return NextResponse.json({ error: 'Nicht authentifiziert' }, { status: 401 })
}
```

---

### CR-03: Path Traversal via Unvalidated `s3_key` in Worker

**File:** `worker/main.py:43` and `worker/main.py:101`

**Issue:** `EmbedRequest.s3_key` is declared as a plain `str` with no validation. The `/embed` endpoint is called by the Next.js route with a server-generated UUID key, but the endpoint itself is open: anything that can reach port 8000 (within the same Docker network or if exposed externally) can send an arbitrary `s3_key`. Values like `../../../etc/passwd` or `search-temp/../private/sensitive-object` would be passed directly to `s3_client.download_file()`, causing the worker to fetch arbitrary objects from the S3 bucket. This is a classic path traversal translated into an S3 key namespace attack — the attacker can exfiltrate any object in `BUCKET_THUMBNAILS`, including STEP-file thumbnails belonging to other users.

**Fix:** Validate that `s3_key` matches the expected prefix pattern before download:

```python
import re
from fastapi import HTTPException

ALLOWED_KEY_PATTERN = re.compile(r'^search-temp/[0-9a-f-]{36}\.jpg$')

@app.post("/embed", response_model=EmbedResponse)
def embed(req: EmbedRequest) -> EmbedResponse:
    if not ALLOWED_KEY_PATTERN.match(req.s3_key):
        raise HTTPException(status_code=400, detail="Ungültiger s3_key")
    ...
```

---

### CR-04: Unhandled Exception on `embedResponse.json()` Crashes the Request Without S3 Cleanup

**File:** `src/app/api/search/route.ts:118`

**Issue:** After `embedResponse.ok` is confirmed on line 113, `embedResponse.json()` is called on line 118 with no `try/catch`. If the worker returns an HTTP 200 with a non-JSON body (e.g., a proxy timeout page, a FastAPI validation error that slips through, or a truncated response), `.json()` throws a `SyntaxError`. Because this is outside the `try` block that wraps the fetch, the exception propagates uncaught to Next.js, which returns a 500 with no S3 cleanup — leaving the temp object in S3 indefinitely.

**Fix:** Wrap the JSON parse and subsequent processing:

```typescript
let embedJson: unknown
try {
  embedJson = await embedResponse.json()
} catch {
  await cleanupTempS3(tempKey)
  return NextResponse.json({ error: 'Worker-Antwort nicht parsierbar' }, { status: 502 })
}
// then validate with Zod (see CR-01 fix)
```

---

## Warnings

### WR-01: No File Size Limit on Uploaded Images

**File:** `src/app/api/search/route.ts:68`

**Issue:** The route validates MIME type (`image/*`) but not file size. A caller can upload a multi-gigabyte file disguised as `image/jpeg`. The full contents are read into memory with `file.arrayBuffer()` on line 68, then buffered again on line 69 with `Buffer.from(bytes)`. On Vercel the request body is limited by the platform (~4.5 MB default), but no explicit check guards against the maximum allowed size, meaning the buffer could silently be cut off or the route could use excessive memory.

**Fix:** Add a size check after extracting the file:

```typescript
const MAX_IMAGE_BYTES = 10 * 1024 * 1024 // 10 MB
if (file.size > MAX_IMAGE_BYTES) {
  return NextResponse.json({ error: 'Bild zu groß (max 10 MB)' }, { status: 413 })
}
```

---

### WR-02: `WORKER_URL` Enables SSRF — No Allowlist or Host Validation

**File:** `src/app/api/search/route.ts:101`

**Issue:** The worker URL is taken directly from `process.env.WORKER_URL` and the path `/embed` is appended. If `WORKER_URL` is misconfigured (e.g., via a compromised CI/CD pipeline or environment injection attack) to point to an internal metadata service (`http://169.254.169.254/...`) or another internal host, the Next.js route becomes an SSRF vector — it will send a POST with a JSON body to any target reachable from the Vercel/Next.js execution environment.

**Fix:** At startup (or at request time), validate that `WORKER_URL` matches an expected pattern — either a hardcoded host, a specific domain suffix, or at minimum `http://localhost:8000` in development and a known hostname in production. Raise an error at startup rather than silently accepting arbitrary URLs.

---

### WR-03: boto3 S3 Client Instantiated on Every `/embed` Request

**File:** `worker/main.py:87`

**Issue:** A new `boto3.client("s3", ...)` is created inside the `embed()` function body on every request. boto3 client construction is not free — it parses configuration, creates connection pools, and reads environment variables. Under concurrent load (multiple simultaneous search requests), this creates unnecessary overhead and may exhaust connection pool resources.

**Fix:** Instantiate the client once at module level (outside the function), using lazy initialization if startup-time environment variable availability is a concern:

```python
import functools

@functools.lru_cache(maxsize=1)
def _get_s3_client():
    return boto3.client(
        "s3",
        region_name=os.environ["AWS_REGION"],
        aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
        endpoint_url=os.environ.get("DECOMPOSEDS3_ENDPOINT"),
    )
```

---

### WR-04: `embedResponse.ok` Check Does Not Propagate Worker Error Detail to Logs

**File:** `src/app/api/search/route.ts:113`

**Issue:** When `embedResponse.ok` is false, the route returns a generic `{ error: 'Worker Embed-Fehler' }` and discards the response body without logging it. This makes diagnosing worker-side failures (e.g., `PIL.UnidentifiedImageError`, out-of-memory, CUDA errors) invisible in production logs. The worker's error body is consumed and lost.

**Fix:** Read and log the worker error response:

```typescript
if (!embedResponse.ok) {
  const workerError = await embedResponse.text().catch(() => '<unlesbar>')
  logger.warn(`[search] Worker Embed-Fehler status=${embedResponse.status}: ${workerError}`)
  await cleanupTempS3(tempKey)
  return NextResponse.json({ error: 'Worker Embed-Fehler' }, { status: 502 })
}
```

(Using `console.warn` in the absence of a logger import.)

---

## Info

### IN-01: All Worker Tests Are Skipped — Zero Actual Test Coverage for `/embed`

**File:** `worker/tests/test_embed.py:19`

**Issue:** Every test in `test_embed.py` is decorated with `@pytest.mark.skip(reason="Wave 0 stub")`. The tests only do source-level string matching (e.g., `assert '@app.post("/embed")' in source`), not functional testing. The `/embed` endpoint — the most critical path in the search pipeline — has no executed tests. The stubs were written as a placeholder and not converted to real tests after implementation.

**Fix:** Remove the `@pytest.mark.skip` decorators and implement real tests using `fastapi.testclient.TestClient` with mocked boto3 and `get_embedding` dependencies. At minimum test: successful embedding, S3 download failure (HTTPException 500), invalid s3_key format (after CR-03 fix), and temp file cleanup on exception.

---

### IN-02: Typo in Environment Variable Name `DECOMPOSEDS3_ENDPOINT`

**File:** `worker/main.py:92` and `src/lib/s3.ts:12`

**Issue:** The custom S3 endpoint override environment variable is named `DECOMPOSEDS3_ENDPOINT` — a clear typo (likely meant to be `CUSTOM_S3_ENDPOINT`, `S3_ENDPOINT_URL`, or similar). This name appears consistently in both files, suggesting it was copy-pasted without being corrected. While consistently wrong is not broken, the name is confusing and will be a friction point for any operator configuring local development or alternative S3-compatible storage.

**Fix:** Rename to a clearer name such as `S3_ENDPOINT_URL` in both files and update `.env.local.example` accordingly.

---

_Reviewed: 2026-05-09_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
