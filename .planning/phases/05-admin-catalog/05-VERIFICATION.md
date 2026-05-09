---
phase: 05-admin-catalog
verified: 2026-05-09T08:02:00Z
status: human_needed
score: 9/10 must-haves verified
overrides_applied: 0
deferred:
  - truth: "Archivierte Teile erscheinen nicht mehr in Suchergebnissen"
    addressed_in: "Phase 6"
    evidence: "ROADMAP.md Phase 6 Downstream-Constraint: 'Phase 6 MUSS WHERE status = \'ready\' als Filter verwenden. Das is_archived-Boolean-Feld wird in Phase 5 NICHT beschrieben — Phase 6 darf NICHT WHERE is_archived = false nutzen.'"
human_verification:
  - test: "Admin öffnet /admin, sieht eine Teile-Tabelle mit Thumbnails für status='ready'-Teile; Tabs filtern korrekt; Pagination erscheint ab >20 Einträgen"
    expected: "Tabelle mit 6 Spalten, 5 Status-Tabs, Suchfeld, Pagination-Text 'Zeige 1–N von M Teilen'"
    why_human: "Visuelles Rendering und Tabellen-Interaktion kann nicht programmatisch ohne laufenden Dev-Server verifiziert werden"
  - test: "Admin öffnet Edit-Sheet eines Teils, ändert Bezeichnung, klickt Speichern — Sheet bleibt offen (D-09), Toast 'Änderungen gespeichert.' erscheint, Tabellenzeile aktualisiert sich sofort"
    expected: "Optimistic Update sichtbar, Sheet offen, Sonner-Toast oben rechts"
    why_human: "Real-time UI-Verhalten und Toast-Sichtbarkeit"
  - test: "Admin klickt Archivieren — Row-Status wechselt sofort zu 'Archiviert'-Badge; Admin klickt Löschen — AlertDialog mit Text 'Bauteil unwiderruflich löschen?' erscheint; 'Endgültig löschen' entfernt die Zeile"
    expected: "Optimistic Update, korrekte Dialoge, Rollback bei API-Fehler"
    why_human: "Optimistic-Update-Timing und Dialog-Interaktion"
  - test: "Für ein Teil mit status='failed': Dropdown zeigt '↺ Neu starten'; für Teile mit anderem Status ist der Eintrag nicht sichtbar; nach Klick wechselt Status sofort zu 'Ausstehend'"
    expected: "Konditionale Sichtbarkeit korrekt, Optimistic Update funktioniert"
    why_human: "Status-abhängige UI-Kondition und Retry-Integration mit Worker"
---

# Phase 5: Admin Catalog Verifizierungsbericht

**Phase Goal:** Administrators can manage the full parts catalog — browsing, editing metadata, removing parts, and retrying failed ingestions
**Verified:** 2026-05-09T08:02:00Z
**Status:** human_needed
**Re-verification:** Nein — initiale Verifikation

## Zielerreichung

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Toaster ist im Root-Layout gemountet | VERIFIED | `src/app/layout.tsx` Zeile 3+19: Import und `<Toaster />` nach `{children}`, kein `use client` |
| 2 | GET /api/parts gibt alle Teile ohne embedding zurück | VERIFIED | `route.ts` SELECT ohne embedding, ORDER BY created_at DESC; 3 Tests grün |
| 3 | PATCH /api/parts/[id] aktualisiert Metadaten, lehnt status='archived' ab | VERIFIED | `route.ts` PatchSchema ohne 'archived'; 4 Tests grün |
| 4 | DELETE /api/parts/[id] löscht S3-Objekte (Batch, plural) vor DB-Zeile | VERIFIED | `DeleteObjectsCommand` 2x (BUCKET_STEPS, BUCKET_THUMBNAILS) vor `db DELETE`; 3 Tests grün |
| 5 | POST /api/parts/[id]/archive setzt status='archived', schreibt kein is_archived | VERIFIED | `archive/route.ts` Zeile 33: `SET status = 'archived'`; kein is_archived; 3 Tests grün |
| 6 | POST /api/parts/[id]/retry setzt status='pending' in DB vor Worker-Enqueue; 409 wenn nicht 'failed' | VERIFIED | `retry/route.ts`: DB-Update Zeile 42 vor fetch Zeile 49; status-Check Zeile 33; 5 Tests grün |
| 7 | Admin kann alle Teile mit Tabelle, Tabs, Suche, Pagination sehen | VERIFIED (Code) | `CatalogTable.tsx`: fetch('/api/parts'), 5 Tabs, Debounce-Suche 300ms, ROWS_PER_PAGE=20, Pagination-Caption — visuell human_needed |
| 8 | Edit-Sheet bleibt nach Speichern offen; Optimistic Update mit Rollback | VERIFIED (Code) | `handleSave`: kein `setSheetOpen(false)` nach Erfolg; rollback auf `editPart` bei Fehler — Verhalten human_needed |
| 9 | Archivieren/Löschen mit Optimistic Update; AlertDialog mit korrektem Deutsch-Copy; "↺ Neu starten" nur bei status='failed' | VERIFIED (Code) | `handleArchive`/`handleDeleteConfirm`/`handleRetry` mit Rollback; `AlertDialogTitle` = "Bauteil unwiderruflich löschen?"; Zeile 526: `{part.status === 'failed' && ...}` — Verhalten human_needed |
| 10 | Archivierte Teile erscheinen nicht in Suchergebnissen | DEFERRED | Phase 6 Downstream-Constraint — search pipeline noch nicht implementiert |

**Score:** 9/10 Truths verifiziert (1 deferred)

### Deferred Items

Items noch nicht erfüllt, aber explizit in einer späteren Milestone-Phase adressiert.

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | Archivierte Teile erscheinen nicht in Suchergebnissen | Phase 6 | ROADMAP.md Downstream-Constraint: "Phase 6 MUSS `WHERE status = 'ready'` als Filter verwenden" — Archivierung via status='archived' korrekt vorbereitet |

### Required Artifacts

| Artifact | Erwartet | Status | Details |
|----------|----------|--------|---------|
| `src/app/layout.tsx` | Toaster-Mount | VERIFIED | Import + `<Toaster />` nach `{children}`, kein use client |
| `src/app/api/parts/route.ts` | GET-Handler | VERIFIED | Exportiert `GET`, SELECT ohne embedding, 17 Zeilen |
| `src/app/api/parts/[id]/route.ts` | PATCH + DELETE | VERIFIED | Exportiert `PATCH` und `DELETE`, 119 Zeilen |
| `src/app/api/parts/[id]/archive/route.ts` | POST Soft-Delete | VERIFIED | Exportiert `POST`, setzt status='archived' |
| `src/app/api/parts/[id]/retry/route.ts` | POST Retry | VERIFIED | Exportiert `POST`, DB vor Worker, 409 bei nicht-failed |
| `src/app/admin/page.tsx` | Server Component Shell | VERIFIED | Kein use client, importiert CatalogTable, max-w-7xl |
| `src/app/admin/CatalogTable.tsx` | Client-Komponente (alle Interactions) | VERIFIED | 761 Zeilen, 'use client', alle 4 ADMIN-Anforderungen |
| `src/app/api/parts/route.test.ts` | 3 Tests grün | VERIFIED | 3 passed |
| `src/app/api/parts/[id]/route.test.ts` | 7 Tests grün | VERIFIED | 7 passed (4 PATCH + 3 DELETE) |
| `src/app/api/parts/[id]/archive/route.test.ts` | 3 Tests grün | VERIFIED | 3 passed |
| `src/app/api/parts/[id]/retry/route.test.ts` | 5 Tests grün | VERIFIED | 5 passed |
| `tests/admin-catalog.spec.ts` | 4 Playwright-Tests aktiviert | VERIFIED | 4 Tests ohne test.todo, 4x page.goto('/admin') |

### Key Link Verifikation

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `src/app/layout.tsx` | `src/components/ui/sonner.tsx` | `import { Toaster }` | WIRED | Zeile 3+19 bestätigt |
| `src/app/api/parts/route.ts` | `src/lib/db.ts` | `db Tagged Template` | WIRED | `db\`SELECT ... FROM parts ORDER BY created_at DESC\`` |
| `src/app/api/parts/[id]/route.ts` | `@/lib/s3` | `DeleteObjectsCommand` | WIRED | 2x `s3.send(new DeleteObjectsCommand(...))` |
| `src/app/api/parts/[id]/retry/route.ts` | `WORKER_URL/enqueue` | `fetch POST` | WIRED | `fetch(\`${workerUrl}/enqueue\`, ...)` ohne NEXT_PUBLIC_ |
| `src/app/admin/CatalogTable.tsx` | `/api/parts` | `fetch in useEffect` | WIRED | Zeile 177: `fetch('/api/parts')` |
| `src/app/admin/CatalogTable.tsx` | `/api/parts/[id]/archive` | `fetch POST in handleArchive` | WIRED | Zeile 313: `fetch(\`/api/parts/${id}/archive\`, { method: 'POST' })` |
| `src/app/admin/CatalogTable.tsx` | `/api/parts/[id]/retry` | `fetch POST in handleRetry` | WIRED | Zeile 344: `fetch(\`/api/parts/${id}/retry\`, { method: 'POST' })` |
| `src/app/admin/page.tsx` | `CatalogTable.tsx` | Import + JSX | WIRED | Import Zeile 6 + `<CatalogTable />` Zeile 17 |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| `CatalogTable.tsx` | `parts` | `fetch('/api/parts')` → `GET route.ts` → `db\`SELECT ... FROM parts\`` | DB-Query vorhanden, echte rows zurückgegeben | FLOWING |
| `GET /api/parts` | `rows` | `db\`SELECT id, name, part_number, project, status, thumbnail_count, created_at FROM parts\`` | Keine statische Rückgabe, echter DB-Call | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| GET /api/parts — 3 Tests | `npm test -- --run src/app/api/parts/route.test.ts` | 3 passed | PASS |
| PATCH/DELETE — 7 Tests | `npm test -- --run "...route.test.ts"` | 7 passed | PASS |
| archive — 3 Tests | `npm test -- --run "...archive/route.test.ts"` | 3 passed | PASS |
| retry — 5 Tests | `npm test -- --run "...retry/route.test.ts"` | 5 passed | PASS |
| Gesamte Test-Suite | `npm test -- --run` | 52 passed (11 files) | PASS |
| TypeScript Build | `npm run build` | Exit-Code 0; /admin, /api/parts, /api/parts/[id], /archive, /retry alle registriert | PASS |

### Requirements-Abdeckung

| Anforderung | Source Plan | Beschreibung | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| ADMIN-01 | 05-02, 05-04 | Katalog-Liste mit Status und Thumbnail | SATISFIED | GET /api/parts, CatalogTable mit Tabs/Suche/Pagination/Thumbnails |
| ADMIN-02 | 05-03, 05-04 | Metadaten bearbeiten | SATISFIED | PATCH /api/parts/[id] + Edit-Sheet in CatalogTable |
| ADMIN-03 | 05-03, 05-04 | Archivieren oder löschen | SATISFIED | POST /archive (Soft-Delete), DELETE (Hard-Delete + S3-Cleanup) + UI-Aktionen |
| ADMIN-04 | 05-03, 05-04 | Retry für fehlgeschlagene Teile | SATISFIED | POST /retry mit 409-Guard + "↺ Neu starten" nur bei status='failed' |

### Anti-Patterns

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `CatalogTable.tsx` | 201 | `eslint-disable-next-line react-hooks/exhaustive-deps` | Info | Bewusste Entscheidung zur Vermeidung von Thumbnail-Fetch-Endlosschleifen; dokumentiert |

Keine Blocker-Anti-Patterns gefunden. Keine TODO/FIXME/Placeholder-Kommentare. Keine leeren Return-Statements in Implementierungs-Code.

### Human Verification Required

#### 1. ADMIN-01: Tabellen-Ansicht im Browser

**Test:** `npm run dev` starten, http://localhost:3000/admin öffnen
**Expected:** Tabelle mit Spalten Vorschau | Bezeichnung | Teilenummer | Projekt | Status | Erstellt am; 5 Status-Tabs (Alle/Bereit/Ausstehend/Fehler/Archiviert) mit Zahl-Badges; Suchfeld mit Placeholder "Nach Bezeichnung oder Teilenummer suchen…"; für status='ready' Teile ein 48×48px Thumbnail; Pagination "Zeige 1–N von M Teilen" bei >20 Einträgen
**Why human:** Visuelles Rendering, Thumbnail-Anzeige und Pagination-Verhalten erfordern einen laufenden Dev-Server mit Daten in der Datenbank

#### 2. ADMIN-02: Edit-Sheet Interaktion

**Test:** Aktionen-Dropdown öffnen → "Bearbeiten" klicken → Wert ändern → "Speichern"
**Expected:** Sheet öffnet von rechts; Formularfelder vorausgefüllt; nach Speichern erscheint Sonner-Toast "Änderungen gespeichert." oben rechts; Sheet bleibt offen (D-09); Tabellenzeile zeigt sofort den neuen Wert (Optimistic Update)
**Why human:** Toast-Sichtbarkeit, Sheet-Zustand nach Speichern und Optimistic-Update-Timing

#### 3. ADMIN-03: Archivieren und Löschen

**Test:** "Archivieren" klicken; dann für ein anderes Teil "Löschen" klicken
**Expected:** Archivieren: Row-Badge wechselt sofort zu "Archiviert"; Löschen: AlertDialog mit Titel "Bauteil unwiderruflich löschen?" und Button "Endgültig löschen"; nach Bestätigung verschwindet die Zeile sofort
**Why human:** Optimistic Update, Dialog-Anzeige und Rollback-Verhalten bei Fehler

#### 4. ADMIN-04: Retry für failed Parts

**Test:** Teil mit status='failed' im Dropdown prüfen; "↺ Neu starten" klicken
**Expected:** "↺ Neu starten" nur im Dropdown für status='failed' sichtbar; nach Klick wechselt Badge sofort zu "Ausstehend"; bei laufendem Worker wird Job re-enqueued
**Why human:** Konditionale Tab-Sichtbarkeit und Worker-Integration

### Gaps Summary

Keine Gaps gefunden. Alle API-Routes sind vollständig implementiert und getestet (52/52 Tests grün, Build fehlerfrei). Die CatalogTable-Komponente ist vollständig verdrahtet. Die einzige deferred Truth (SC3: "archivierte Teile nicht in Suchergebnissen") ist bewusst in Phase 6 delegiert und wurde in ROADMAP.md als Downstream-Constraint dokumentiert.

4 Verhaltenspunkte erfordern manuelle Verifikation mit laufendem Dev-Server.

---

_Verified: 2026-05-09T08:02:00Z_
_Verifier: Claude (gsd-verifier)_
