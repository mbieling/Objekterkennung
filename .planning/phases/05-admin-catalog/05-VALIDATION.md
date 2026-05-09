---
phase: 5
slug: admin-catalog
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-09
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.2 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- --run` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- --run <betroffene Testdatei>`
- **After every plan wave:** Run `npm test` (vollständige Vitest-Suite)
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 5-W0-01 | 01 | 0 | ADMIN-01 | — | UUID-Validierung vor DB-Zugriff | unit | `npm test -- --run src/app/api/parts/route.test.ts` | ❌ W0 | ⬜ pending |
| 5-W0-02 | 01 | 0 | ADMIN-02 | — | PATCH lehnt status='archived' ab | unit | `npm test -- --run "src/app/api/parts/[id]/route.test.ts"` | ❌ W0 | ⬜ pending |
| 5-W0-03 | 01 | 0 | ADMIN-03 | — | DELETE ruft S3 DeleteObjectsCommand auf | unit | `npm test -- --run "src/app/api/parts/[id]/route.test.ts"` | ❌ W0 | ⬜ pending |
| 5-W0-04 | 01 | 0 | ADMIN-03 | — | POST /archive setzt status='archived' | unit | `npm test -- --run "src/app/api/parts/[id]/archive/route.test.ts"` | ❌ W0 | ⬜ pending |
| 5-W0-05 | 01 | 0 | ADMIN-04 | — | POST /retry setzt status='pending' + enqueued | unit | `npm test -- --run "src/app/api/parts/[id]/retry/route.test.ts"` | ❌ W0 | ⬜ pending |
| 5-W1-01 | 02 | 1 | ADMIN-01 | — | N/A | unit | `npm test -- --run src/app/api/parts/route.test.ts` | ❌ W0 | ⬜ pending |
| 5-W2-01 | 03 | 2 | ADMIN-02 | — | N/A | unit | `npm test -- --run "src/app/api/parts/[id]/route.test.ts"` | ❌ W0 | ⬜ pending |
| 5-W3-01 | 04 | 3 | ADMIN-03 | — | S3 zuerst, dann DB | unit | `npm test -- --run "src/app/api/parts/[id]/route.test.ts"` | ❌ W0 | ⬜ pending |
| 5-W3-02 | 04 | 3 | ADMIN-04 | — | N/A | unit | `npm test -- --run "src/app/api/parts/[id]/retry/route.test.ts"` | ❌ W0 | ⬜ pending |
| 5-W4-01 | 05 | 4 | ADMIN-01 | — | Tabelle zeigt alle Teile mit korrekten Badges | smoke | `npm run test:e2e` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/app/api/parts/route.test.ts` — Stubs für GET /api/parts (ADMIN-01)
- [ ] `src/app/api/parts/[id]/route.test.ts` — Stubs für PATCH (ADMIN-02) und DELETE (ADMIN-03)
- [ ] `src/app/api/parts/[id]/archive/route.test.ts` — Stubs für POST /archive (ADMIN-03)
- [ ] `src/app/api/parts/[id]/retry/route.test.ts` — Stubs für POST /retry (ADMIN-04)
- [ ] `tests/admin-catalog.spec.ts` — Playwright E2E Smoke-Test (kann in Wave 4 aktiviert werden)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Optimistic UI-Updates (Tabelle aktualisiert sich sofort nach Aktion) | ADMIN-01–04 | DOM-State-Machine schwer unit-testbar | Manuell in Browser: Archivieren/Löschen/Retry ausführen, Row-Update beobachten |
| Sheet bleibt nach Speichern offen (D-09) | ADMIN-02 | Interaction-State | Manuell: Bearbeiten klicken, Speichern klicken, Sheet beobachten |
| Sonner-Toast erscheint bei Fehler | ADMIN-01–04 | Toast-Infrastruktur | Manuell: API-Fehler simulieren (z.B. Worker down), Toast beobachten |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
