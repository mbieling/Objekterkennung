---
phase: 1
slug: database-foundation
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-05-07
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest ^4.1.2 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npm test` |
| **Full suite command** | `npm run test:all` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm test`
- **After every plan wave:** Run `npm run test:all`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| supabase-admin-client | 01 | 0 | Infrastructure | T-1-01 | Service Role Key nur server-seitig, nie im Client-Bundle | integration | `npm test src/lib/supabase.test.ts` | ❌ W0 | ⬜ pending |
| sql-migration | 01 | 1 | Infrastructure | — | RLS bewusst deaktiviert mit Kommentar in Migration | manual-sql | Manuell im Supabase SQL Editor | ❌ W0 | ⬜ pending |
| hnsw-index | 01 | 1 | Infrastructure | — | HNSW (nie IVFFlat) | manual-sql | `SELECT * FROM pg_indexes WHERE tablename = 'parts'` | ❌ W0 | ⬜ pending |
| storage-buckets | 01 | 2 | Infrastructure | — | parts-steps privat, parts-thumbnails getrennt | manual-dashboard | Supabase Dashboard > Storage | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/lib/supabase.test.ts` — Minimal-Test: `supabaseAdmin` Client kann `parts`-Tabelle abfragen (gibt leere Liste zurück ohne Fehler)
- [ ] `.env.local` muss `SUPABASE_SERVICE_ROLE_KEY` enthalten (manueller Setup-Schritt)

*Die eigentliche SQL-Migration ist manuell — die Migrations-Datei selbst braucht keinen automatisierten Test. Der supabaseAdmin-Client-Test ist der einzige automatisierbare Verifikationsschritt.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `parts`-Tabelle mit korrektem Schema | Infrastructure | Supabase SQL Editor, kein direktes DB-Zugriff aus Tests ohne Live-DB | `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'parts' ORDER BY ordinal_position;` |
| pgvector Extension aktiv + `<=>` Operator | Infrastructure | Extension-Status nur im Live-Supabase prüfbar | `SELECT extname FROM pg_extension WHERE extname = 'vector'; SELECT '[1,2,3]'::vector <=> '[1,2,3]'::vector;` |
| HNSW-Index aktiv auf `embedding`-Spalte | Infrastructure | Index-Erstellung in Live-DB nötig | `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'parts' AND indexname LIKE '%embedding%';` |
| Storage-Buckets `parts-steps` + `parts-thumbnails` | Infrastructure | Buckets via Dashboard (kein direktes SQL-Insert) | Supabase Dashboard > Storage — beide Buckets sichtbar |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
