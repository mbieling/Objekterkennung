---
phase: 6
slug: search-pipeline
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-09
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 2.x |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test -- src/app/api/search/route.test.ts` |
| **Full suite command** | `npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test -- src/app/api/search/route.test.ts`
- **After every plan wave:** Run `npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 0 | SEARCH-03,04,05 | — | Stubs vorhanden | unit | `npm test -- src/app/api/search/route.test.ts` | ❌ Wave 0 | ⬜ pending |
| 06-02-01 | 02 | 1 | SEARCH-03 | T-6-01 | /embed Endpunkt akzeptiert S3-Key | unit | `pytest worker/tests/test_embed.py` | ❌ Wave 0 | ⬜ pending |
| 06-03-01 | 03 | 1 | SEARCH-03,04,05 | T-6-02 | Threshold/Limit validiert | unit | `npm test -- src/app/api/search/route.test.ts` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/app/api/search/route.test.ts` — Vitest-Stubs für SEARCH-03/04/05 (mocked db, s3, fetch)
- [ ] Bestehende `vitest.config.ts` + `src/test/setup.ts` decken die Tests ab (kein neues Setup)

*Kein neues Test-Framework-Setup nötig — bestehende Infrastruktur aus Phase 3/4/5 ausreichend.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Latenz < 5s gegen 100+ Teile | SEARCH-03 | Erfordert echte DB + Worker | curl POST /api/search mit JPEG + Stoppuhr |
| Kamera-Foto liefert sinnvolle Treffer | SEARCH-03 | Bildqualitäts-Urteil | Handy-Foto eines Bauteils aus Testdaten |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
