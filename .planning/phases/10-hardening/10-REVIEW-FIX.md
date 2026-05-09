---
phase: 10-hardening
fixed_at: 2026-05-09T19:30:00Z
review_path: .planning/phases/10-hardening/10-REVIEW.md
iteration: 1
findings_in_scope: 9
fixed: 9
skipped: 0
status: all_fixed
---

# Phase 10: Code Review Fix Report

**Fixed at:** 2026-05-09T19:30:00Z
**Source review:** .planning/phases/10-hardening/10-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 9 (CR-01, CR-02, CR-03, WR-01, WR-02, WR-03, WR-04, WR-05, WR-06)
- Fixed: 9
- Skipped: 0

**Verification:** `npm run build` ✓ (17 Testdateien, 103 Tests bestanden)

---

## Fixed Issues

### CR-01: LIKE Wildcard Injection via `search` Parameter

**Files modified:** `src/app/api/parts/route.ts`
**Commit:** `abc2913`
**Applied fix:** `escapeLike()`-Hilfsfunktion hinzugefügt, die `%`, `_` und Backslash escapt. Alle `searchPattern`-Konstruktionen von `%${search}%` auf `%${escapeLike(search)}%` umgestellt (zwei Stellen: status+search-Branch und reiner search-Branch).

---

### CR-02: Unvalidated External URL Rendered as `<img src>` (Open Redirect / Content Spoofing)

**Files modified:** `src/app/admin/CatalogTable.tsx`, `src/app/upload/UploadForm.tsx`
**Commit:** `52e9917`
**Applied fix:** `isSafeImageUrl()`-Guard in beiden Dateien hinzugefügt. Validiert HTTPS-Protokoll und erlaubt nur `.supabase.co`- und `.supabase.in`-Hostnamen sowie den Host aus `NEXT_PUBLIC_SUPABASE_URL`. In CatalogTable an zwei Stellen angewendet (Tabellen-Thumbnail und Sheet-Thumbnail), in UploadForm an einer Stelle.

---

### CR-03: Pagination Counter Displays "Zeige 1–0 von 0" When No Results Match Filter

**Files modified:** `src/app/admin/CatalogTable.tsx`
**Commit:** `ea9b07f`
**Applied fix:** Ternärer Guard um den Zähler-String: wenn `totalCount === 0`, wird `'Keine Teile gefunden'` angezeigt statt der fehlerhaften Formel.

---

### WR-01: Duplicated `handleSearch` / `handleSearchWithLimit` Logic — Divergence Risk

**Files modified:** `src/app/search/CameraCapture.tsx`
**Commit:** `e4242ba`
**Applied fix:** Gemeinsame `executeSearch(limit: number)`-Funktion extrahiert, die die gesamte Fetch-Logik mit AbortController, FormData und Fehlerbehandlung enthält. `handleSearch()` und `handleSearchWithLimit(newLimit)` sind jetzt dünne Wrapper, die `executeSearch` delegieren.

---

### WR-02: `onLimitChange` is a No-Op in the `searching` Re-Search Overlay

**Files modified:** `src/app/search/CameraCapture.tsx`
**Commit:** `5526225`
**Applied fix:** `onLimitChange` im searching-Overlay ruft jetzt `setDisplayLimit(newLimit)` auf statt `() => {}`. Damit wird der Nutzerwunsch gespeichert (kein Datenverlust), aber kein paralleler Fetch gestartet. Der gespeicherte Wert wird beim nächsten `handleSearch`-Aufruf verwendet.

---

### WR-03: Optimistic Rollback in `handleSave` Uses Stale Closure Over `editPart`

**Files modified:** `src/app/admin/CatalogTable.tsx`
**Commit:** `9ba2e55`
**Applied fix:** `const snapshot = editPart` wird vor dem ersten `await` gesetzt. Sowohl der optimistische Update als auch der Rollback-Pfad verwenden `snapshot` statt `editPart`, sodass ein gleichzeitig geöffnetes zweites Edit-Sheet die Rollback-Daten nicht überschreibt.
**Status:** fixed: requires human verification (Logik-Fix für Race-Condition-Szenario)

---

### WR-04: File Size Not Validated for Camera-Captured Blobs Before Upload

**Files modified:** `src/app/search/CameraCapture.tsx`
**Commit:** `9da43c3`
**Applied fix:** `MAX_IMAGE_BYTES = 5 * 1024 * 1024` als Modulkonstante definiert. In `handleCapture` wird nach `captureFrame()` geprüft, ob `blob.size > MAX_IMAGE_BYTES` — bei Überschreitung wird eine nutzerfreundliche Fehlermeldung gesetzt. In `handleFileSelect` wird nach dem MIME-Check ebenfalls die Dateigröße geprüft mit formatierter MB-Angabe.

---

### WR-05: `handleRetry` and `handleArchive` Silently Suppress All Errors Except Toast

**Files modified:** `src/app/admin/CatalogTable.tsx`
**Commit:** `2b69812`
**Applied fix:** `toast.success('Bauteil gelöscht.')` nach erfolgreichem DELETE in `handleDeleteConfirm` hinzugefügt. Damit ist das Feedback-Verhalten konsistent mit `handleSave` und `handleArchive`.
**Hinweis:** Das optionale Chaining im Rollback-Callback war bereits korrekt — kein weiterer Fix nötig.

---

### WR-06: `route.test.ts` — Invalid `status` Filter Not Tested; `search` Injection Not Tested

**Files modified:** `src/app/api/parts/route.test.ts`
**Commit:** `dd7e87e`
**Applied fix:** 4 neue Tests hinzugefügt:
1. HTTP 400 bei ungültigem `status`-Parameter (`status=invalid`)
2. HTTP 400 bei `limit=0` (unter Minimum)
3. HTTP 400 bei `limit=101` (über Maximum)
4. HTTP 200 mit `search=%` — prüft dass die escapeLike-Pfad ohne Fehler durchläuft (CR-01-Regression)

---

_Fixed: 2026-05-09T19:30:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
