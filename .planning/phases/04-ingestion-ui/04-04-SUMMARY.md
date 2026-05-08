---
phase: 04-ingestion-ui
plan: "04"
subsystem: hooks
tags: [polling, react-hook, timing, abort-controller, fake-timers]
dependency_graph:
  requires: [04-02]
  provides: [usePartStatus]
  affects: [04-05]
tech_stack:
  added: []
  patterns: [variables-interval-polling, abortcontroller-cleanup, failure-threshold-buffering]
key_files:
  created:
    - src/hooks/use-part-status.ts
  modified:
    - src/hooks/use-part-status.test.ts
decisions:
  - "stopped-Flag + controller.abort() in Cleanup statt nur clearInterval — verhindert Race-Conditions bei langsamen Responses nach Stop"
  - "tick()-Funktion enthält elapsed-Check für Intervall-Wechsel, statt zweier separater setInterval-Aufrufe von Anfang an"
metrics:
  duration: "12 Minuten"
  completed_date: "2026-05-08"
  tasks_completed: 1
  tasks_total: 1
---

# Phase 4 Plan 04: usePartStatus-Hook Summary

**One-liner:** Polling-Hook mit variablem 2s/5s-Intervall, 5-Min-Timeout und 3er-Failure-Threshold via AbortController + Cleanup.

## What Was Built

`usePartStatus(partId)` — ein React-Hook, der `/api/parts/[id]/status` wiederholt abfragt und sich selbst stoppt:

- **Intervall-Logik (D-04):** Erste 30s alle 2s (`FAST_INTERVAL_MS`), danach alle 5s (`SLOW_INTERVAL_MS`). Wechsel erfolgt via `Date.now()`-Tracking im `tick()`-Callback, kein zweiter `useEffect`.
- **Stop-Bedingung (D-04):** Bei `status === 'ready'` oder `status === 'failed'` wird `stopped = true` gesetzt und Interval + Timeout werden geclearet. Nachfolgende Timer-Ticks prüfen `stopped` vor jedem Fetch.
- **Timeout (D-06):** `setTimeout(TIMEOUT_MS)` nach 5 Minuten setzt `timedOut = true` und stoppt das Polling.
- **Failure-Threshold (UI-SPEC):** `failuresRef.current` zählt konsekutive Fehler. Erst ab `>= FAILURE_THRESHOLD` (3) wird `setError()` aufgerufen. Bei erstem Erfolg Reset auf 0.
- **Cleanup (Pitfall 2 aus RESEARCH.md):** `useEffect`-Return clearet `clearInterval` + `clearTimeout` + `controller.abort()` und setzt `stopped = true`. Aborted Fetches werden via `controller.signal.aborted`-Check still dropped.
- **partId=null:** Hook setzt State zurück, kein Polling, kein Cleanup-Issue.

## Test Results

8/8 Tests grün (Vitest, fake timers):

| Test | Ergebnis |
|------|---------|
| polls every 2s in first 30s | PASS |
| switches to 5s after 30s | PASS |
| stops on ready | PASS |
| stops on failed | PASS |
| timeouts after 5 minutes | PASS |
| cleans up timers on unmount | PASS |
| does not poll when partId is null | PASS |
| surfaces error only after 3 consecutive failures | PASS |

## Commits

| Hash | Beschreibung |
|------|-------------|
| 5b6c956 | feat(04-04): implement usePartStatus polling hook + activate 8 tests |

## Deviations from Plan

Keine — Plan exakt wie geschrieben ausgeführt. Hook-Implementierung entspricht dem RESEARCH.md Pattern 2 mit dem in der Planaction vorgegebenen Code.

## Known Stubs

Keine. Der Hook ist vollständig implementiert und liefert echte Polling-Daten aus `/api/parts/[id]/status`.

## Threat Surface Scan

Keine neuen Netzwerk-Endpunkte oder Auth-Pfade eingeführt. Der Hook konsumiert ausschließlich den bereits in Plan 04-02 erstellten `GET /api/parts/[id]/status`-Endpoint. Alle im `<threat_model>` definierten Mitigationen wurden implementiert:

- **T-04-13** (DoS: Endlos-Polling): 5-Minuten-Timeout implementiert.
- **T-04-14** (Memory-Leak): Cleanup-Return mit `clearInterval` + `clearTimeout` + `controller.abort()`.
- **T-04-15** (Race-Condition): `stopped`-Flag + `controller.signal.aborted`-Check.
- **T-04-16** (Error-Spam): `FAILURE_THRESHOLD = 3` implementiert.

## Self-Check: PASSED

- [x] `src/hooks/use-part-status.ts` existiert (108 Zeilen > min 60)
- [x] `src/hooks/use-part-status.test.ts` aktualisiert (kein `it.skip` mehr)
- [x] Commit 5b6c956 existiert
- [x] 8/8 Tests grün
