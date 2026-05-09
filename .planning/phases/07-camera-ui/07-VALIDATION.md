---
phase: 7
slug: camera-ui
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-05-09
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 4.1.5 + @testing-library/react |
| **Config file** | `vitest.config.ts` (jsdom, globals: true) |
| **Quick run command** | `npm test -- --reporter=verbose src/app/search/CameraCapture.test.tsx` |
| **Full suite command** | `npm test` |
| **E2E Framework** | Playwright 1.59.1 |
| **E2E Quick run** | `npx playwright test tests/phase-07-camera-ui.spec.ts --project=chromium` |
| **E2E Full** | `npx playwright test tests/phase-07-camera-ui.spec.ts` (Chromium + Mobile Safari) |
| **Estimated runtime** | ~15s unit, ~30s E2E Chromium |

---

## Sampling Rate

- **Nach jedem Task-Commit:** `npm test -- src/app/search/CameraCapture.test.tsx`
- **Nach jedem Wave-Abschluss:** `npm test && npx playwright test tests/phase-07-camera-ui.spec.ts --project=chromium`
- **Vor `/gsd-verify-work`:** Beide Suiten grün (Vitest + Playwright inkl. Mobile Safari)
- **Max feedback latency:** ~15 Sekunden (Unit), ~30 Sekunden (E2E Chromium)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 0 | SEARCH-01, SEARCH-02 | — | `getUserMedia`-Mock verhindert echten Kamera-Zugriff in Tests | unit stub | `npm test -- src/app/search/CameraCapture.test.tsx` | ❌ Wave 0 | ⬜ pending |
| 7-01-02 | 01 | 0 | SEARCH-01, SEARCH-02 | — | E2E-Stub mit `test.skip` für Kamera-Permission (nicht CI-fähig ohne Device) | e2e stub | `npx playwright test tests/phase-07-camera-ui.spec.ts --project=chromium` | ❌ Wave 0 | ⬜ pending |
| 7-02-01 | 02 | 1 | SEARCH-01 | T-7-01 | `file.type.startsWith('image/')` Client-Validierung | unit | `npm test -- src/app/search/CameraCapture.test.tsx` | ❌ Wave 0 | ⬜ pending |
| 7-02-02 | 02 | 1 | SEARCH-02 | — | File-Input immer sichtbar (D-06) | unit | `npm test -- src/app/search/CameraCapture.test.tsx` | ❌ Wave 0 | ⬜ pending |
| 7-02-03 | 02 | 1 | SEARCH-01 | T-7-01 | getUserMedia-Fehler → File-Input eingeblendet (D-05) | unit | `npm test -- src/app/search/CameraCapture.test.tsx` | ❌ Wave 0 | ⬜ pending |
| 7-02-04 | 02 | 1 | SEARCH-01 | — | Capture → Vorschau + "Suchen" + "Wiederholen" sichtbar (D-08) | unit | `npm test -- src/app/search/CameraCapture.test.tsx` | ❌ Wave 0 | ⬜ pending |
| 7-02-05 | 02 | 1 | SEARCH-01, SEARCH-02 | — | Spinner sichtbar während Suche läuft (D-09) | unit | `npm test -- src/app/search/CameraCapture.test.tsx` | ❌ Wave 0 | ⬜ pending |
| 7-02-06 | 02 | 1 | SEARCH-01, SEARCH-02 | — | JSON in `<pre>` nach erfolgreicher Suche (D-10) | unit | `npm test -- src/app/search/CameraCapture.test.tsx` | ❌ Wave 0 | ⬜ pending |
| 7-02-07 | 02 | 1 | SEARCH-01, SEARCH-02 | — | Fehler-Alert + "Neu aufnehmen"-Button (D-11) | unit | `npm test -- src/app/search/CameraCapture.test.tsx` | ❌ Wave 0 | ⬜ pending |
| 7-03-01 | 03 | 2 | SEARCH-01, SEARCH-02 | — | /search E2E erreichbar, File-Input vorhanden | e2e | `npx playwright test tests/phase-07-camera-ui.spec.ts` | ❌ Wave 0 | ⬜ pending |
| 7-03-02 | 03 | 2 | D-02 | — | Homepage zeigt beide Buttons ("Teil hochladen" + "Teil suchen") | e2e | `npx playwright test tests/phase-07-camera-ui.spec.ts` | ❌ Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `src/app/search/CameraCapture.test.tsx` — stubs für SEARCH-01, SEARCH-02, D-05 bis D-11 (getUserMedia-Mock inline)
- [ ] `tests/phase-07-camera-ui.spec.ts` — E2E-Stub (Chromium + Mobile Safari), deckt Seitennavigation + File-Input-Sichtbarkeit + Homepage-Buttons

*(Kein Framework-Install nötig — Vitest + Playwright bereits konfiguriert)*

**Hinweis zum Mocking:** `navigator.mediaDevices.getUserMedia` ist in jsdom nicht verfügbar — via `Object.defineProperty(global.navigator, 'mediaDevices', { value: { getUserMedia: vi.fn() } })` mocken. Analog zu `global.fetch = vi.fn()` in `UploadForm.test.tsx`.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Hinterkamera-Aktivierung (facingMode: ideal 'environment') | SEARCH-01 | Kein echter Browser-Device in CI; jsdom simuliert kein getUserMedia | Auf echtem iOS/Android-Gerät testen: Kamera-Button → Hinterkamera öffnet sich |
| `playsInline` verhindert iOS-Fullscreen | SEARCH-01 | Nur auf echtem iPhone testbar | iOS Safari: Kamera öffnet sich in-page, kein Fullscreen-Player |
| Stream-Cleanup: Kamera-LED erlischt bei Navigation | SEARCH-01 | Kein Test-API für Kamera-LED | Auf iPhone: /search → anderer Tab → LED-Indikator weg |
| Canvas-Frame nicht schwarz nach `play()` | SEARCH-01 | Timing-abhängig, nur auf echtem Gerät verlässlich | Capture-Bild prüfen: kein schwarzes Bild in Vorschau |

---

## Validation Sign-Off

- [ ] Alle Tasks haben `<automated>` verify oder Wave 0 Dependencies
- [ ] Sampling-Kontinuität: keine 3 aufeinanderfolgenden Tasks ohne automated verify
- [ ] Wave 0 deckt alle MISSING-Referenzen
- [ ] Keine Watch-Mode-Flags
- [ ] Feedback-Latenz < 15s (Unit), < 30s (E2E Chromium)
- [ ] `nyquist_compliant: true` in Frontmatter setzen

**Approval:** pending
