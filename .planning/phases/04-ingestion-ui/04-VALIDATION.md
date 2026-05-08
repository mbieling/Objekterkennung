---
phase: 4
slug: ingestion-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-08
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.2 (Unit + Integration) + Playwright 1.58.2 (E2E) |
| **Config file** | `vitest.config.ts` (jsdom environment, `@/`-alias) + `playwright.config.ts` |
| **Quick run command** | `npm test -- --run src/app/api/parts src/hooks/use-part-status src/app/upload` |
| **Full suite command** | `npm run test:all` |
| **Estimated runtime** | ~30 seconds (Vitest) |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run src/app/api/parts src/hooks/use-part-status src/app/upload`
- **After every plan wave:** Run `npm test` (volle Vitest-Suite — bestätigt keine Regressionen)
- **Before `/gsd-verify-work`:** `npm run test:all` muss grün sein
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 4-01-01 | 01 | 0 | INGEST-01, INGEST-02 | — | Test-Stubs ohne Logik + Migration 002_add_thumbnail_count.sql | unit | `npm test -- --run src/app/api/parts src/hooks src/app/upload` | ❌ Wave 0 | ⬜ pending |
| 4-02-01 | 02 | 1 | INGEST-02 | SSRF via [id] | UUID-Validierung vor DB-Query (Status-Route) | integration | `npm test -- src/app/api/parts/\[id\]/status/route.test.ts` | ❌ Wave 0 | ⬜ pending |
| 4-03-01 | 03 | 1 | INGEST-02 | Presigned URL leak | 60s Lifetime, HeadObject-Pre-Check (Thumbnail-Route) | integration | `npm test -- src/app/api/parts/\[id\]/thumbnail/route.test.ts` | ❌ Wave 0 | ⬜ pending |
| 4-04-01 | 04 | 2 | INGEST-02 | DoS via Endlos-Polling | Cleanup bei partId=null und unmount, 5-Min-Timeout (usePartStatus) | unit (fake timers) | `npm test -- src/hooks/use-part-status.test.ts` | ❌ Wave 0 | ⬜ pending |
| 4-05-01 | 05 | 3 | INGEST-01 | Tampering via Content-Type | Form-Validierung + Duplikat-Alert + KEIN Content-Type-Header bei XHR-PUT (UploadForm) | integration | `npm test -- src/app/upload/UploadForm.test.tsx` | ❌ Wave 0 | ⬜ pending |
| 4-06-01 | 06 | 4 | INGEST-01, INGEST-02 | — | Page rendert ohne Fehler + Build grün | unit | `npm run build && npm test` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/app/api/parts/[id]/status/route.test.ts` — Stubs für INGEST-02 Status-Route
- [ ] `src/app/api/parts/[id]/thumbnail/route.test.ts` — Stubs für INGEST-02 Thumbnail-Route
- [ ] `src/hooks/use-part-status.test.ts` — Stubs für INGEST-02 Polling-Hook (fake timers)
- [ ] `src/app/upload/UploadForm.test.tsx` — Stubs für INGEST-01 Formular-Verhalten
- [ ] `tests/phase-04-upload.spec.ts` — E2E-Stub (manuell bis Live-Worker vorhanden)
- [ ] **DB-Verify:** `thumbnail_count`-Spalte in `parts`-Tabelle prüfen (ggf. Migration `002_add_thumbnail_count.sql`)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| S3-PUT mit XHR-Progress bei realem Upload | INGEST-01 | Braucht echten S3-Endpunkt + Datei ≥ 1 MB | 1. npm run dev starten 2. STEP-Datei >1 MB wählen 3. Progress-Bar auf Increment prüfen |
| Status-Transition pending → processing → ready | INGEST-02 | Braucht laufenden Worker | 1. Upload starten 2. Status-Badge alle ~5s beobachten 3. Thumbnail erscheint nach ready |
| Polling-Timeout-Warnung nach 5 Minuten | INGEST-02 | Zu lang für automatisierten Test | 1. Upload starten 2. Worker stoppen 3. Nach 5 Min auf Timeout-Meldung warten |
| Responsive 2-Spalten → 1-Spalte auf Mobile | INGEST-01 | Visual test | DevTools → Mobilansicht → Formular oben, Status-Tracker darunter |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
