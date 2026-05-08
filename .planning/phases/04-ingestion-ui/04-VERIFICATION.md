---
phase: 04-ingestion-ui
verified: 2026-05-08T20:40:00Z
status: human_needed
score: 7/8 must-haves verified
overrides_applied: 0
deferred:
  - truth: "User kann Statusfeld (pending/processing/ready/failed) beim Upload-Formular setzen"
    addressed_in: "Phase 5"
    evidence: "Phase 5 SC-2: 'Admin can click any part and edit its name, part number, project, and status fields, with changes persisted on save' (ADMIN-02). OQ2 in 04-RESEARCH.md explizit dokumentiert: Init-Endpoint hardcoded 'pending', Status-Feld kommt in Admin-Katalog."
human_verification:
  - test: "SC2: Status-Indicator updated in Echtzeit (pending → processing → ready)"
    expected: "Badge wechselt von 'Ausstehend' → 'Wird verarbeitet...' → 'Bereit' während der Worker die STEP-Datei verarbeitet. Network-Tab zeigt /api/parts/[id]/status-Calls alle ~2s in den ersten 30s, danach alle ~5s. Polling stoppt automatisch bei 'Bereit'."
    why_human: "Erfordert laufenden Docker-Worker (Celery + Redis), der im automatisierten Verifikations-Kontext nicht verfügbar ist."
  - test: "SC3: Thumbnail erscheint nach 'ready' ohne Page-Reload"
    expected: "Skeleton erscheint sobald Badge 'Bereit' zeigt, dann lädt das Bild (192x192px, object-contain, rounded-md, border). Danach erscheint 'Neuer Upload'-Button. Klick setzt Form vollständig zurück (D-10)."
    why_human: "Thumbnail-Darstellung hängt vom Python-Worker ab, der view_0.png in S3 ablegt. Ohne Worker kein S3-Objekt, kein 200 von /api/parts/[id]/thumbnail."
  - test: "SC4: Duplikat-Upload zeigt Inline-Alert mit existing_part_id"
    expected: "Nach erstem Upload: dieselbe STEP-Datei erneut hochladen → roter Alert unter Datei-Input mit 'Diese Datei existiert bereits — Teil-ID: <uuid>'. Form bleibt editierbar (D-11). Status-Tracker erscheint NICHT. Kein Toast."
    why_human: "Erfordert zwei aufeinanderfolgende Uploads gegen die Live-Datenbank. Init-Endpoint vergleicht SHA-256 in Neon — setzt laufende DB-Verbindung voraus. SHA-256-Duplikat-Logik ist in Phase 3 implementiert (INGEST-04 vollständig), aber der Vollständige UI-Flow inklusive Inline-Alert-Rendering wird durch manuellen Test gegen localhost:3000 verifiziert."
---

# Phase 4: Ingestion UI — Verifikationsbericht

**Phasenziel:** Engineers can upload STEP files with metadata through the browser and see live processing status without refreshing
**Verifiziert:** 2026-05-08T20:40:00Z
**Status:** human_needed
**Re-Verifikation:** Nein — initiale Verifikation

---

## Zielerreichung

### Observable Truths

| # | Truth | Status | Evidenz |
|---|-------|--------|---------|
| 1 | User kann STEP-Datei (≤100 MB) auswählen, Name/Teilenummer/Projekt ausfüllen und Formular abschicken (INGEST-01) | ✓ VERIFIED | `UploadForm.tsx` exportiert `UploadForm` (458 Zeilen), validiert Dateiformat/Größe, rendert Felder für name/partNumber/project. Formular-Submission löst SHA-256 → init → S3-PUT → confirm-Sequenz aus. 6/6 UploadForm-Tests grün. |
| 2 | Browser berechnet SHA-256 lokal vor Init-Request | ✓ VERIFIED | `crypto.subtle.digest('SHA-256', buffer)` in `UploadForm.tsx:54`. Kein 100-MB-Transfer vor Dedup-Check. |
| 3 | Nach Upload zeigt UI Status-Indikator der in Echtzeit aktualisiert: pending → processing → ready/failed | ? UNCERTAIN (human) | usePartStatus-Hook implementiert (8/8 Tests grün, fake timers). GET /api/parts/[id]/status implementiert (3/3 Tests grün). Echter Worker-Flow erfordert Docker-Umgebung. |
| 4 | Thumbnail erscheint ohne Page-Reload nach ready | ? UNCERTAIN (human) | GET /api/parts/[id]/thumbnail implementiert (5/5 Tests grün), HeadObject-Race-Mitigation aktiv. Thumbnail-Fetch in UploadForm mit AbortController (CR-02 behoben). Erfordert laufenden Worker. |
| 5 | Duplikat-Upload zeigt Inline-Alert mit existing_part_id (D-11) | ✓ VERIFIED | `UploadForm.tsx:237`: `{duplicateId && <Alert>Diese Datei existiert bereits — Teil-ID: {duplicateId}</Alert>}`. HTTP 409 Handler setzt `setDuplicateId(data.existing_part_id)` und `setPhase('duplicate')`. UploadForm-Test `shows duplicate alert with existing_part_id on HTTP 409` grün. |
| 6 | /upload-Seite erreichbar als Server Component, rendert UploadForm | ✓ VERIFIED | `src/app/upload/page.tsx` existiert, kein `'use client'`, importiert und rendert `<UploadForm />`. `npm run build` erfolgreich: Route `/upload` als `○ (Static)` gelistet. |
| 7 | Homepage (/) zeigt einzelnen Button 'Teil hochladen' → /upload, kein Auto-Redirect | ✓ VERIFIED | `src/app/page.tsx`: `<Button asChild><Link href="/upload">Teil hochladen</Link></Button>`. Kein `redirect()`, kein `router.push()`. Keine Vercel/Next.js-Logos. |
| 8 | Alle Unit-Tests laufen grün, kein Fehler | ✓ VERIFIED | `npm test`: 7 Test-Dateien, 34 Tests, 0 Failed, 0 Skipped, Exit-Code 0. |

**Score:** 6/8 Truths automatisch verifiziert (Truths 3 & 4 erfordern menschliche Verifikation mit laufendem Docker-Worker)

---

### Abgeleitete Abweichungen

| Element | Geplant | Implementiert | Bewertung |
|---------|---------|---------------|-----------|
| Statusfeld im Upload-Formular | INGEST-01 + Roadmap SC-1 fordern "name, part number, project, **and status**" | Status-Feld bewusst entfernt (OQ2 RESOLVED) | DEFERRED → Phase 5 (ADMIN-02). Init-Endpoint hardcoded 'pending'. Dokumentiert in 04-RESEARCH.md und Plan-05-Action-Block. Phase 5 SC-2 deckt das Feld explizit ab. |

---

### Erforderliche Artefakte

| Artefakt | Erwartet | Status | Details |
|----------|----------|--------|---------|
| `supabase/migrations/002_add_thumbnail_count.sql` | DDL: ALTER TABLE parts ADD COLUMN thumbnail_count | ✓ VERIFIED | Datei existiert, `alter table parts add column if not exists thumbnail_count integer not null default 0`, idempotent via `IF NOT EXISTS`. |
| `src/app/api/parts/[id]/status/route.ts` | GET-Handler mit UUID-Validierung + DB-Read | ✓ VERIFIED | 47 Zeilen, exportiert `GET`, Zod UUID-Validierung, tagged-template SELECT, gibt `{status, thumbnail_count}` zurück. 3/3 Tests grün. |
| `src/app/api/parts/[id]/thumbnail/route.ts` | GET-Handler mit HeadObject + Presigned URL (60s) | ✓ VERIFIED | 67 Zeilen, exportiert `GET`, Zod UUID-Validierung, HeadObjectCommand vor getSignedUrl (Race-Mitigation), expiresIn: 60. 5/5 Tests grün. |
| `src/hooks/use-part-status.ts` | Custom Hook, Polling 2s/5s, 5-Min-Timeout, Cleanup | ✓ VERIFIED | 108 Zeilen (>60 min), exportiert `usePartStatus`, `intervalRef` (Object-Ref für Closure-Sicherheit), `switched`-Flag (WR-01 fix), AbortController-Cleanup, `FAILURE_THRESHOLD=3`. 8/8 Tests grün. |
| `src/app/upload/UploadForm.tsx` | Client-Komponente, Phasen-State-Machine, XHR-PUT | ✓ VERIFIED | 458 Zeilen, `'use client'`, exportiert `UploadForm`, crypto.subtle.digest, XMLHttpRequest ohne Content-Type, usePartStatus-Integration, 9 shadcn-Imports. 6/6 Tests grün. |
| `src/app/upload/page.tsx` | Server Component Wrapper für UploadForm | ✓ VERIFIED | Kein `'use client'`, importiert UploadForm, metadata.title korrekt, max-w-4xl/py-12 Layout. |
| `src/app/page.tsx` | Minimale Homepage mit 'Teil hochladen'-Link | ✓ VERIFIED | Genau ein Button/Link `href="/upload"`, Text "Teil hochladen", kein Redirect, keine Legacy-Logos. |
| `tests/phase-04-upload.spec.ts` | Playwright-E2E-Stub (test.skip) | ✓ VERIFIED | 2 test.skip-Blöcke vorhanden, vom Vitest-Scan ausgeschlossen (vitest.config.ts exclude). |

---

### Key-Link-Verifikation

| Von | Zu | Via | Status | Details |
|-----|----|-----|--------|---------|
| `UploadForm.tsx` | `POST /api/upload/init` | fetch mit JSON-Body | ✓ WIRED | `fetch('/api/upload/init', {method: 'POST', body: JSON.stringify(...)})` in onSubmit |
| `UploadForm.tsx` | S3 Presigned URL | XMLHttpRequest PUT | ✓ WIRED | `xhr.open('PUT', presignedUrl)`, kein Content-Type-Header, progress-Listener |
| `UploadForm.tsx` | `POST /api/upload/confirm` | fetch mit {part_id} | ✓ WIRED | `fetch('/api/upload/confirm', {method: 'POST', body: JSON.stringify({part_id})})` |
| `UploadForm.tsx` | `usePartStatus`-Hook | Hook-Aufruf mit partId | ✓ WIRED | `const { status: polledStatus, ... } = usePartStatus(polledPartId)` |
| `UploadForm.tsx` | `GET /api/parts/[id]/thumbnail` | fetch nach status==='ready' | ✓ WIRED | `fetch('/api/parts/${partId}/thumbnail', {signal: controller.signal})` mit AbortController |
| `usePartStatus` | `GET /api/parts/[id]/status` | fetch alle 2s/5s | ✓ WIRED | `fetch('/api/parts/${partId}/status', {signal: controller.signal})` in fetchStatus() |
| `src/app/upload/page.tsx` | `UploadForm.tsx` | import + JSX | ✓ WIRED | `import { UploadForm } from './UploadForm'` + `<UploadForm />` |
| `src/app/page.tsx` | `/upload` | next/link | ✓ WIRED | `<Link href="/upload">Teil hochladen</Link>` |
| `status/route.ts` | `@/lib/db` | tagged-template SELECT | ✓ WIRED | `db\`SELECT status, thumbnail_count FROM parts WHERE id = ${id}\`` |
| `thumbnail/route.ts` | `@/lib/s3` + S3 | HeadObjectCommand + getSignedUrl | ✓ WIRED | HeadObject + getSignedUrl beide in try/catch (CR-03 behoben), expiresIn: 60 |

---

### Data-Flow-Trace (Level 4)

| Artefakt | Datenvariable | Quelle | Liefert echte Daten | Status |
|----------|---------------|--------|---------------------|--------|
| `status/route.ts` | `rows[0].status`, `rows[0].thumbnail_count` | `db\`SELECT status, thumbnail_count FROM parts WHERE id = ${id}\`` | Ja — Neon-DB Query | ✓ FLOWING |
| `thumbnail/route.ts` | `url` | `getSignedUrl(s3, GetObjectCommand(...), {expiresIn: 60})` | Ja — AWS S3 SDK | ✓ FLOWING |
| `use-part-status.ts` | `status`, `thumbnailCount`, `error`, `timedOut` | `fetch('/api/parts/${partId}/status')` → JSON.parse | Ja — pollt Status-API | ✓ FLOWING |
| `UploadForm.tsx` | `polledStatus`, `thumbnailUrl`, `duplicateId` | usePartStatus-Hook + thumbnail-fetch + init-409-Response | Ja — API-Antworten | ✓ FLOWING |

---

### Behavioral Spot-Checks

| Verhalten | Kommando | Ergebnis | Status |
|-----------|---------|---------|--------|
| npm run build ohne Fehler | `npm run build 2>&1 \| tail -5` | Exit 0, alle 6 Routen gelistet | ✓ PASS |
| Alle Vitest-Tests grün | `npm test -- --run` | 34/34 passed, 0 failed, 0 skipped | ✓ PASS |
| Status-Route kein NEXT_PUBLIC_ | `grep -c NEXT_PUBLIC_ src/app/api/parts/[id]/status/route.ts` | 0 | ✓ PASS |
| Thumbnail-Route kein NEXT_PUBLIC_ | `grep -c NEXT_PUBLIC_ src/app/api/parts/[id]/thumbnail/route.ts` | 0 | ✓ PASS |
| UploadForm kein Content-Type Header beim XHR-PUT | `grep "xhr.setRequestHeader" UploadForm.tsx` | 0 Treffer | ✓ PASS |
| CR-01: intervalRef statt let intervalId | `grep "intervalRef" use-part-status.ts` | intervalRef.id Pattern auf 7 Zeilen | ✓ PASS |
| CR-02: AbortController in thumbnail-fetch | `grep -n "controller.*abort\|AbortController" UploadForm.tsx` | controller.abort() vorhanden | ✓ PASS |
| CR-03: getSignedUrl in try/catch | `grep -n "try\|catch" thumbnail/route.ts` | 2 try/catch-Blöcke (HeadObject + getSignedUrl) | ✓ PASS |
| SC2/SC3/SC4 Ende-zu-Ende | manuell mit Docker-Worker | Ausstehend | ? SKIP — human_needed |

---

### Anforderungsabdeckung

| Anforderung | Quell-Plan | Beschreibung | Status | Evidenz |
|-------------|-----------|-------------|--------|---------|
| INGEST-01 | Plans 01, 05, 06 | Nutzer kann STEP-Datei (max. 100 MB) mit Metadaten hochladen | ✓ SATISFIED (teilweise — ohne Status-Feld, deferred) | UploadForm implementiert name/partNumber/project + Datei-Upload. Status-Feld in Phase 5 (ADMIN-02). |
| INGEST-02 | Plans 01, 02, 03, 04, 05 | System zeigt Verarbeitungsstatus an (pending → processing → ready → failed) | ✓ SATISFIED (Unit-Tests) / ? UNCERTAIN (E2E ohne Worker) | GET /api/parts/[id]/status + usePartStatus-Hook vollständig implementiert. E2E-Verifikation erfordert Worker. |

---

### Anti-Pattern-Scan

| Datei | Zeile | Pattern | Schwere | Auswirkung |
|-------|-------|---------|---------|------------|
| `src/app/upload/UploadForm.tsx` | 237 | `{duplicateId && ...}` statt `{phase === 'duplicate' && duplicateId && ...}` | ⚠️ Warning (WR-04) | Alert könnte in React-Flush kurz nach Reset sichtbar sein. Kein Blocker in React 18 (Batching). |
| `src/lib/s3.ts` | 12 | `DECOMPOSEDS3_ENDPOINT` (ungewöhnlicher Variablenname) | ℹ️ Info | Als absichtlich dokumentiert per Verifikations-Hinweis. Funktional korrekt. |
| `src/app/upload/UploadForm.tsx` | ~440 | `pollError`-Alert zeigt "Upload fehlgeschlagen" statt "Statusabfrage fehlgeschlagen" (IN-02) | ⚠️ Warning | Irreführend für Nutzer (Upload war erfolgreich). Kein funktionaler Blocker. |

**Keine Stubs gefunden** — alle Implementierungen sind vollständig verdrahtet.

---

### Menschliche Verifikation erforderlich

#### 1. SC2: Status-Indicator Echtzeit-Update

**Test:** Docker-Worker starten (`docker-compose up -d`), STEP-Datei auf localhost:3000/upload hochladen, rechte Spalte beobachten.
**Erwartet:** Badge wechselt "Ausstehend" → "Wird verarbeitet…" → "Bereit" in 30–120s. Network-Tab zeigt /api/parts/[id]/status alle ~2s (erste 30s), danach ~5s. Polling stoppt automatisch bei "Bereit".
**Warum menschlich:** Erfordert laufenden Python-Worker (Celery + Redis). Docker nicht im automatisierten Verifikations-Kontext verfügbar.

#### 2. SC3: Thumbnail-Anzeige ohne Page-Reload

**Test:** Nach SC2-Verifikation: Skeleton erscheint, dann Thumbnail (192×192px, object-contain, rounded-md, border).
**Erwartet:** Bild lädt ohne Page-Reload. Danach erscheint "Neuer Upload"-Button. Klick → Form vollständig zurückgesetzt (D-10).
**Warum menschlich:** Worker muss view_0.png in S3-Bucket ablegen. Presigned-URL-Fetching durch GET /api/parts/[id]/thumbnail kann nur mit existierendem S3-Objekt verifiziert werden.

#### 3. SC4: Duplikat-Upload Inline-Alert

**Test:** Nach SC3 (Neuer Upload): dieselbe STEP-Datei erneut hochladen, andere Bezeichnung eingeben, submitten.
**Erwartet:** Roter Alert erscheint UNTER dem Datei-Input: "Diese Datei existiert bereits — Teil-ID: <uuid>". Form-Felder bleiben enabled. Status-Tracker erscheint NICHT. Kein Toast.
**Warum menschlich:** Init-Endpoint prüft SHA-256 gegen Neon-DB. Erfordert Datenbankverbindung + ersten Upload als Voraussetzung. Unit-Test (HTTP-409-Mock) ist grün, aber E2E-Flow inklusive UI-Rendering bedarf manueller Verifikation.

---

## Zusammenfassung

**Automatisch verifiziert:** 6 von 8 Truths vollständig belegt. Alle 6 Kern-Artefakte existieren und sind substantiell implementiert (kein Stub, keine Platzhalter). Alle 10 Key-Links sind verdrahtet. Build und Test-Suite laufen fehlerfrei (34/34 Tests grün).

**3 kritische Code-Review-Befunde** (CR-01: Stale Closure in usePartStatus, CR-02: AbortController fehlt in thumbnail-fetch, CR-03: getSignedUrl ohne try/catch) wurden post-execution korrekt behoben — in der aktuellen Codebase verifiziert.

**1 Deferred Item:** Status-Feld im Upload-Formular. Roadmap SC-1 und INGEST-01 fordern das Feld, aber das Init-API hardcoded 'pending'. Die Abweichung ist explizit in 04-RESEARCH.md (OQ2 RESOLVED) dokumentiert und auf Phase 5 (ADMIN-02) delegiert.

**3 Human-Verification-Items** stehen aus: SC2 (Echtzeit-Polling-Verhalten), SC3 (Thumbnail-Anzeige), SC4 (Duplikat-Alert E2E). Diese sind infrastrukturell korrekt implementiert (Unit-Tests grün), können aber ohne laufenden Docker-Worker nicht automatisch verifiziert werden.

---

_Verifiziert: 2026-05-08T20:40:00Z_
_Verifikator: Claude (gsd-verifier)_
