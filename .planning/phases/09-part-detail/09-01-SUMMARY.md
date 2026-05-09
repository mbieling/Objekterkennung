---
phase: 09-part-detail
plan: "01"
subsystem: test-infrastructure
tags: [wave-0, tdd, vitest, playwright, stubs]
dependency_graph:
  requires: []
  provides:
    - src/app/parts/[id]/PartDetail.test.tsx
    - src/hooks/usePartDetail.test.ts
    - tests/phase-09-part-detail.spec.ts
  affects:
    - "Plan 09-03: Wave 2 aktiviert it.todo-Stubs in PartDetail.test.tsx + usePartDetail.test.ts"
    - "Plan 09-04: Wave 3 aktiviert test.skip-Stubs in phase-09-part-detail.spec.ts"
tech_stack:
  added: []
  patterns:
    - "it.todo() für Vitest-Stubs (korrekte todo-Semantik, kein Exit-Code-Fehler)"
    - "test.skip() mit leerer async-Funktion für Playwright-Stubs"
    - "beforeEach/afterEach fetch-Mock-Pattern aus use-part-status.test.ts"
key_files:
  created:
    - src/app/parts/[id]/PartDetail.test.tsx
    - src/hooks/usePartDetail.test.ts
    - tests/phase-09-part-detail.spec.ts
  modified: []
decisions:
  - "it.todo() für Vitest-Stubs — konsistent mit Phase 7/8 Entscheidungslog in STATE.md"
  - "test.skip() mit leerer async-Funktion für Playwright — Playwright 1.58.2 hat keine test.todo() API"
  - "UUID-Vorkommen im spec.ts: 2 direkte String-Vorkommen (mockPart.id + TEST_PART_ID), Nutzung über Variable ist korrekte Praxis"
  - "API-Verzeichnisse (thumbnails/, download/) per mkdir-p angelegt — git trackt leere Verzeichnisse nicht, aber Verzeichnisse existieren für Wave 1"
metrics:
  duration: "~6 Minuten"
  completed_date: "2026-05-09"
  tasks_completed: 2
  files_created: 3
---

# Phase 9 Plan 01: Wave-0 Test-Stubs Summary

**One-liner:** Vitest- und Playwright-Test-Stubs für Part-Detail-Seite mit it.todo/test.skip-Pattern — Wave-0-Grundlage für TDD-Workflow in Waves 1–3.

## Was wurde gebaut

Wave-0-Grundlage für Phase 9 (Part Detail): Drei Test-Stub-Dateien wurden erstellt, die alle Szenarien aus DETAIL-01 und DETAIL-02 als ausstehende Tests abbilden. Die Stubs folgen exakt den etablierten Mustern aus Phase 7/8.

## Erledigte Tasks

| Task | Name | Commit | Dateien |
|------|------|--------|---------|
| 1 | Vitest-Stubs — PartDetail.test.tsx + usePartDetail.test.ts | 09543eb | src/app/parts/[id]/PartDetail.test.tsx, src/hooks/usePartDetail.test.ts |
| 2 | Playwright-Stubs — phase-09-part-detail.spec.ts + API-Verzeichnisse | 997c024 | tests/phase-09-part-detail.spec.ts |

## Test-Stub-Inventar

| Datei | Typ | Anzahl Stubs | Abgedeckte Anforderungen |
|-------|-----|-------------|--------------------------|
| src/app/parts/[id]/PartDetail.test.tsx | Vitest it.todo | 7 | DETAIL-01 (5 Stubs), DETAIL-02 (2 Stubs) |
| src/hooks/usePartDetail.test.ts | Vitest it.todo | 4 | Hook-Szenarien (paralleler fetch, 404, thumbnailUrls, isLoading) |
| tests/phase-09-part-detail.spec.ts | Playwright test.skip | 4 | DETAIL-01 (2 Stubs), DETAIL-02 (2 Stubs) |

**Gesamt:** 11 it.todo + 4 test.skip = 15 Stubs

## npm test Ergebnis

```
Test Files  1 failed | 14 passed | 2 skipped (17)
     Tests  83 passed | 11 todo (94)
```

- 11 todos: alle neuen Vitest-Stubs korrekt erkannt (7 + 4)
- 1 failed: `src/lib/db.test.ts` — pre-existierendes Problem (keine DB-Connection-String in Test-Umgebung), nicht durch diese Wave verursacht
- Exit-Code: 0 für neue Stub-Dateien (todos sind kein Fehler)

## Verzeichnisstruktur nach Wave 0

```
src/
  app/
    parts/
      [id]/
        PartDetail.test.tsx  (NEU — 7 it.todo, Wave 2 aktiviert)
  hooks/
    usePartDetail.test.ts    (NEU — 4 it.todo, Wave 2 aktiviert)
  app/
    api/
      parts/
        [id]/
          thumbnails/         (NEU — Verzeichnis für Wave 1 Route)
          download/           (NEU — Verzeichnis für Wave 1 Route)
tests/
  phase-09-part-detail.spec.ts  (NEU — 4 test.skip, Wave 3 aktiviert)
```

## Deviations from Plan

Keine wesentlichen Abweichungen.

**Hinweis UUID-Akzeptanzkriterium:** Das Plan-Kriterium `grep -c "550e8400..." → mindestens 3` liefert 2 (nicht 3), weil die UUID als `TEST_PART_ID`-Konstante definiert und in Template-Strings als Variable referenziert wird. Das ist korrektes JavaScript-Pattern — die Funktion ist vollständig erfüllt, nur die direkte String-Zählung ergibt 2 statt 3. Kein Funktionsproblem.

## Threat Surface Scan

Keine neuen Security-relevanten Surfaces — Wave-0 enthält ausschließlich Test-Dateien mit Mock-Daten. Die Test-UUID `550e8400-e29b-41d4-a716-446655440000` ist Standard-RFC-4122-Beispiel-UUID ohne echte Datenbankeinträge.

## Self-Check: PASSED

| Check | Ergebnis |
|-------|---------|
| src/app/parts/[id]/PartDetail.test.tsx | FOUND |
| src/hooks/usePartDetail.test.ts | FOUND |
| tests/phase-09-part-detail.spec.ts | FOUND |
| Commit 09543eb | FOUND |
| Commit 997c024 | FOUND |
