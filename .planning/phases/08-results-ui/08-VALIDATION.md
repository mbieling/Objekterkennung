---
phase: 8
slug: results-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-09
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest (unit) + Playwright (E2E) |
| **Config file** | `vitest.config.ts` / `playwright.config.ts` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm run test:all` |
| **Estimated runtime** | ~30–60 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm run test:all`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | Status |
|---------|------|------|-------------|-----------|-------------------|--------|
| 08-01-01 | 01 | 0 | — | unit-stub | `npm test` | ⬜ pending |
| 08-01-02 | 01 | 0 | — | e2e-fix | `npm run test:e2e` | ⬜ pending |
| 08-02-01 | 02 | 1 | SEARCH-03 | unit | `npm test` | ⬜ pending |
| 08-02-02 | 02 | 1 | SEARCH-03 | unit | `npm test` | ⬜ pending |
| 08-03-01 | 03 | 2 | SEARCH-04 | unit | `npm test` | ⬜ pending |
| 08-03-02 | 03 | 2 | SEARCH-05 | unit | `npm test` | ⬜ pending |
| 08-04-01 | 04 | 3 | SEARCH-03/04/05 | e2e | `npm run test:e2e` | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `npx shadcn@latest add slider --yes` — Slider-Komponente installieren
- [ ] `tests/phase-08-results-ui.spec.ts` — Playwright-Stubs für SEARCH-03/04/05
- [ ] `src/app/search/SearchResults.test.tsx` — Vitest-Stubs für SearchResults-Komponente
- [ ] `tests/phase-07-camera-ui.spec.ts` — `locator('pre')` auf neue Selektoren aktualisieren (Phase-7-Breaking-Change)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Thumbnail erscheint korrekt (lazy load) | SEARCH-03 | Benötigt echte DB-Einträge mit S3-Thumbnails | Bauteil hochladen, suchen, Thumbnail in Karte prüfen |
| Slider-Filterung in Echtzeit | SEARCH-04 | Slider-Interaktion schwer automatisierbar ohne echte Resultate | Slider verschieben, Karten werden ge-/entfiltern |
| Spinner-Overlay bei Re-Suche | — | Visuelles Verhalten, timing-abhängig | Foto aufnehmen → Suche → Neu aufnehmen → altes Grid + Spinner sichtbar |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
