---
phase: 9
slug: part-detail
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-09
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (Unit) + Playwright (E2E) |
| **Config file** | `vitest.config.ts` / `playwright.config.ts` |
| **Quick run command** | `npm test -- --testPathPattern="PartDetail\|usePartDetail"` |
| **Full suite command** | `npm run test:all` |
| **Estimated runtime** | ~15 seconds (Unit) / ~60 seconds (E2E) |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --testPathPattern="PartDetail|usePartDetail"`
- **After every plan wave:** Run `npm run test:all`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 9-01-01 | 01 | 0 | DETAIL-01 | — | N/A | stub | `npm test -- PartDetail.test` | ❌ W0 | ⬜ pending |
| 9-01-02 | 01 | 0 | DETAIL-02 | — | N/A | stub | `npm test -- PartDetail.test` | ❌ W0 | ⬜ pending |
| 9-01-03 | 01 | 0 | DETAIL-01+02 | — | N/A | stub | `npm run test:e2e -- phase-09` | ❌ W0 | ⬜ pending |
| 9-02-01 | 02 | 1 | DETAIL-01 | T-09-01 | UUID-Validierung vor DB-Query | unit | `npm test -- PartDetail.test` | ❌ W0 | ⬜ pending |
| 9-02-02 | 02 | 1 | DETAIL-01 | T-09-01 | UUID-Validierung vor S3-Key | unit | `npm test -- PartDetail.test` | ❌ W0 | ⬜ pending |
| 9-02-03 | 02 | 1 | DETAIL-02 | T-09-01 | UUID-Validierung + Content-Disposition | unit | `npm test -- PartDetail.test` | ❌ W0 | ⬜ pending |
| 9-03-01 | 03 | 2 | DETAIL-01 | — | N/A | unit | `npm test -- PartDetail.test` | ❌ W0 | ⬜ pending |
| 9-03-02 | 03 | 2 | DETAIL-02 | — | Download-Button disabled bei status≠ready | unit | `npm test -- PartDetail.test` | ❌ W0 | ⬜ pending |
| 9-04-01 | 04 | 3 | DETAIL-01+02 | — | N/A | E2E | `npm run test:e2e -- phase-09` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/app/parts/[id]/PartDetail.test.tsx` — Vitest-Stubs für DETAIL-01 (Metadaten, Skeleton, 404-Error, StatusBadge-Farben) und DETAIL-02 (Download-Button States, window.location.href)
- [ ] `src/hooks/usePartDetail.test.ts` — Vitest-Stubs für API-Mocking (beide fetch-Calls parallel)
- [ ] `tests/phase-09-part-detail.spec.ts` — Playwright E2E-Stubs: Navigation von /search → /parts/[id], Metadaten-Anzeige, Download-Button

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Browser-Save-Dialog erscheint beim Download | DETAIL-02 | Playwright kann Downloads prüfen, aber MIME-Type/Disposition-Verhalten browser-abhängig | 1. Navigiere zu /parts/[ready-part-id], 2. Klicke "STEP herunterladen", 3. Verifiziere: Save-Dialog erscheint mit Dateiname "{name}.step" |
| router.back() ohne History (direkter URL-Aufruf) | DETAIL-01 | window.history.length kann in Tests nicht realistisch simuliert werden | 1. Öffne direkt /parts/[id] ohne vorherige Navigation, 2. Klicke "← Zurück zur Suche", 3. Verifiziere: Weiterleitung zu /search (nicht Browser-Back) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
