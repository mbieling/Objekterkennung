---
phase: 07-camera-ui
reviewed: 2026-05-09T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/app/page.tsx
  - src/app/search/CameraCapture.test.tsx
  - src/app/search/CameraCapture.tsx
  - src/app/search/page.tsx
  - tests/phase-07-camera-ui.spec.ts
findings:
  critical: 2
  warning: 4
  info: 3
  total: 9
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-05-09T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Geprüft wurden die Camera-UI-Komponenten für Phase 7: Landing-Page-Erweiterung (`page.tsx`), die Client-Komponente `CameraCapture.tsx` mit vollständiger State-Machine, die Server-Komponente `search/page.tsx`, sowie Unit- und E2E-Tests. Die Grundarchitektur ist solide, der facingMode-Ansatz korrekt und die AbortController-Logik sauber. Es wurden jedoch zwei kritische Sicherheits- bzw. Korrektheitsprobleme gefunden: ein Memory-Leak durch eine fehlerhafte `useEffect`-Closure und eine fehlende Dateigrößenbeschränkung beim Datei-Upload, die DoS-Angriffe ermöglicht. Zusätzlich gibt es vier Warnings, hauptsächlich um Robustheit und Fehlerbehandlung.

---

## Critical Issues

### CR-01: Memory-Leak im Cleanup-Effect durch veraltete Closure

**File:** `src/app/search/CameraCapture.tsx:104-113`

**Issue:** Der Cleanup-Effect (Zeilen 104–113) referenziert `previewUrl` aus dem Closure zum Zeitpunkt der ersten Render-Ausführung. Da der Effect absichtlich nur einmal gemountet wird (`deps: []`), liest er beim Unmount immer den initialen Wert `null`, selbst wenn `previewUrl` später auf eine echte `blob:`-URL gesetzt wurde. Das führt dazu, dass `URL.revokeObjectURL` nie aufgerufen wird und jede erstellte Object-URL leckt.

```tsx
// AKTUELL (fehlerhaft):
useEffect(() => {
  return () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (previewUrl) URL.revokeObjectURL(previewUrl)  // ← liest immer null
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [])
```

**Fix:** `previewUrl` in einen separaten Ref auslagern, damit der Cleanup-Handler immer den aktuellen Wert liest:

```tsx
const previewUrlRef = useRef<string | null>(null)

// In handleCapture und handleFileSelect:
const url = URL.createObjectURL(blob)
previewUrlRef.current = url
setPreviewUrl(url)

// In handleRetry und dem result-State-Reset:
if (previewUrlRef.current) {
  URL.revokeObjectURL(previewUrlRef.current)
  previewUrlRef.current = null
}
setPreviewUrl(null)

// Cleanup-Effect:
useEffect(() => {
  return () => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current)
  }
}, [])  // eslint-disable-next-line nicht mehr nötig
```

---

### CR-02: Fehlende Dateigrößenbeschränkung beim File-Input-Upload

**File:** `src/app/search/CameraCapture.tsx:155-166`

**Issue:** `handleFileSelect` prüft nur den MIME-Typ (`file.type.startsWith('image/')`), aber nicht die Dateigröße. Ein Angreifer oder ein Versehen eines Nutzers kann eine Bilddatei mit mehreren hundert MB hochladen. Dieser Blob wird sofort in den State geladen (`setCapturedBlob(file)`), eine Object-URL erstellt und später als FormData-Body an `/api/search` gesendet. Das erschöpft den Arbeitsspeicher des Browsers und kann den API-Server überlasten (kein serverseitiges Limit kann die clientseitige Last verhindern).

```tsx
// AKTUELL (fehlerhaft):
function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    setErrorMessage('Nur Bilddateien erlaubt.')
    return
  }
  // ← keine Größenprüfung
  setCapturedBlob(file)
  ...
}
```

**Fix:** Maximale Dateigröße definieren und prüfen (z. B. 20 MB, abgestimmt mit dem API-Limit):

```tsx
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024  // 20 MB

function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
  const file = e.target.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    setErrorMessage('Nur Bilddateien erlaubt.')
    return
  }
  if (file.size > MAX_FILE_SIZE_BYTES) {
    setErrorMessage('Datei zu groß. Maximale Dateigröße: 20 MB.')
    return
  }
  setCapturedBlob(file)
  setPreviewUrl(URL.createObjectURL(file))
  setPhase('captured')
}
```

---

## Warnings

### WR-01: Non-null-Assertion auf `canvas.getContext('2d')` kann zur Laufzeit werfen

**File:** `src/app/search/CameraCapture.tsx:64`

**Issue:** `canvas.getContext('2d')!` verwendet eine TypeScript Non-null-Assertion. In seltenen Fällen (sehr alte Browser, OffscreenCanvas-Einschränkungen, Hardware-Fehler) kann `getContext('2d')` trotzdem `null` zurückgeben, was dann zu einem ungefangenen TypeError (`Cannot read properties of null`) führt. Der Fehler würde den Promise-Caller (`handleCapture`) unbehandelt abstürzen lassen, da kein `try/catch` die synchrone Null-Dereferenzierung abfängt — der `catch`-Block in `handleCapture` fehlt ebenfalls (WR-02).

```tsx
// AKTUELL:
canvas.getContext('2d')!.drawImage(video, 0, 0, w, h)
```

**Fix:**

```tsx
const ctx = canvas.getContext('2d')
if (!ctx) throw new Error('2D-Kontext nicht verfügbar')
ctx.drawImage(video, 0, 0, w, h)
```

---

### WR-02: `handleCapture` hat kein Error-Handling — unbehandelte Promise-Ablehnung möglich

**File:** `src/app/search/CameraCapture.tsx:136-145`

**Issue:** `handleCapture` ist eine `async`-Funktion, die `captureFrame(videoRef.current)` aufruft. Wenn `captureFrame` wirft (z. B. durch `canvas.toBlob` → `null`, Null-Kontext aus WR-01, oder einen anderen Fehler), propagiert der Fehler unbehandelt. Da `handleCapture` direkt als `onClick`-Handler verwendet wird, gibt es keinen umschließenden `try/catch`, der den Fehler abfangen würde. Die Komponente bleibt dann im `previewing`-State stecken.

```tsx
// AKTUELL:
async function handleCapture() {
  if (!videoRef.current) return
  const blob = await captureFrame(videoRef.current)  // ← kein try/catch
  ...
}
```

**Fix:**

```tsx
async function handleCapture() {
  if (!videoRef.current) return
  try {
    const blob = await captureFrame(videoRef.current)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCapturedBlob(blob)
    setPreviewUrl(URL.createObjectURL(blob))
    setPhase('captured')
  } catch {
    setErrorMessage('Aufnahme fehlgeschlagen. Bitte versuche es erneut.')
    setPhase('idle')
  }
}
```

---

### WR-03: HTTP-Fehlerantworten von `/api/search` werden nicht im Error-State angezeigt

**File:** `src/app/search/CameraCapture.tsx:184`

**Issue:** Bei einem HTTP-Fehler (`!res.ok`) wird eine generische `Error('HTTP 4xx')`-Exception geworfen. Der `catch`-Block setzt jedoch immer die gleiche generische Meldung "Suche fehlgeschlagen. Bitte überprüfe deine Verbindung..." — unabhängig davon, ob der Fehler ein Netzwerkfehler, ein Timeout (AbortError) oder ein HTTP-4xx/5xx-Fehler ist. Der Code unterscheidet lediglich zwischen `AbortError` und "allem anderen", behandelt HTTP-Fehler also identisch mit Netzwerkfehlern. Das kann bei z. B. HTTP 413 (Payload Too Large) oder HTTP 422 (Unprocessable Content) zu irreführenden Fehlermeldungen führen.

**Fix:** HTTP-Fehler separat behandeln und den Statuscode in der Fehlermeldung berücksichtigen:

```tsx
if (!res.ok) {
  const statusMsg = res.status === 413
    ? 'Bild zu groß für die Suche.'
    : res.status === 422
    ? 'Bild konnte nicht verarbeitet werden.'
    : `Serverfehler (HTTP ${res.status}).`
  throw new Error(statusMsg)
}
// Im catch-Block:
const msg = err instanceof DOMException && err.name === 'AbortError'
  ? 'Suche hat zu lange gedauert...'
  : (err instanceof Error ? err.message : 'Suche fehlgeschlagen.')
```

---

### WR-04: Unit-Test mockt `navigator.mediaDevices` ohne Restore zwischen Tests

**File:** `src/app/search/CameraCapture.test.tsx:18-27`

**Issue:** `mockGetUserMedia` verwendet `Object.defineProperty` mit `configurable: true` und `writable: true`. Der `afterEach`-Block ruft `vi.restoreAllMocks()` auf, was aber nur `vi.spyOn`-Mocks zurücksetzt, nicht `Object.defineProperty`-Überschreibungen. Das bedeutet, dass der `navigator.mediaDevices`-Wert nach einem Test der ihn auf `success=true` gesetzt hat, in einem nachfolgenden Test nicht automatisch auf den vorherigen Zustand zurückgesetzt wird. Tests, die `mockGetUserMedia` nicht selbst aufrufen (z. B. der SEARCH-02-Test in Zeile 222), laufen unter der Annahme, dass kein `mediaDevices`-Mock aktiv ist — das kann zu schwer debuggbaren, reihenfolgeabhängigen Testfehlern führen.

**Fix:** In `beforeEach` explizit einen sicheren Default-Zustand setzen oder `mockGetUserMedia` am Ende jedes Tests zurücksetzen:

```ts
afterEach(() => {
  vi.restoreAllMocks()
  // mediaDevices zurücksetzen (Object.defineProperty wird von restoreAllMocks nicht erfasst)
  Object.defineProperty(global.navigator, 'mediaDevices', {
    value: undefined,
    writable: true,
    configurable: true,
  })
})
```

---

## Info

### IN-01: `captureFrame` skaliert auf `MAX_WIDTH` wenn `video.videoWidth === 0`

**File:** `src/app/search/CameraCapture.tsx:58-60`

**Issue:** Der Fallback `|| MAX_WIDTH` (Zeile 59) und `|| Math.round(MAX_WIDTH * 0.75)` (Zeile 60) greifen, wenn `video.videoWidth === 0`. Das kann passieren, wenn `captureFrame` aufgerufen wird bevor das Video vollständig geladen hat. Das Ergebnis wäre ein leeres Standbild mit 1024×768 px. Da `handleCapture` keine Validierung von `video.videoWidth` enthält, ist dieses Szenario möglich, wenn ein Nutzer sehr schnell auf "Aufnehmen" klickt.

**Fix:** Kurzprüfung vor der Skalierung:

```tsx
if (!video.videoWidth || !video.videoHeight) {
  throw new Error('Videostream noch nicht bereit.')
}
```

---

### IN-02: `FileInputTrigger` als JSX-Variable statt Komponente definiert

**File:** `src/app/search/CameraCapture.tsx:202-207`

**Issue:** `FileInputTrigger` ist als `const FileInputTrigger = (...)` im Funktionskörper definiert — also eine JSX-Variable, keine React-Komponente. Das widerspricht React-Konventionen (Hooks-Regeln: falls `FileInputTrigger` jemals Hooks enthielte, würde es als Regelverletzung gewertet) und wird von ESLint/React-Tooling ggf. falsch analysiert. Dieser Ansatz ist technisch funktional, erschwert aber Testbarkeit und Refactoring.

**Fix:** Als eigenständige Komponente (inline oder ausgelagert) definieren:

```tsx
function FileInputTrigger({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" className="w-full" onClick={onClick}>
      <Upload className="mr-2 h-4 w-4" />
      Foto aus Galerie wählen
    </Button>
  )
}
// Verwendung: <FileInputTrigger onClick={() => fileInputRef.current?.click()} />
```

---

### IN-03: E2E-Test für Spinner setzt `Suchen`-Button per Text statt per Role voraus

**File:** `tests/phase-07-camera-ui.spec.ts:79`

**Issue:** `page.getByText('Suchen').click()` ist fragil, da es auch Teilstring-Matches findet (z. B. wenn ein Ergebnis den Text "Suchen" enthält). Konsistenter wäre `page.getByRole('button', { name: 'Suchen' })`, wie im vorangehenden Test in Zeile 42 korrekt verwendet.

**Fix:**

```ts
await page.getByRole('button', { name: 'Suchen' }).click()
```

---

_Reviewed: 2026-05-09T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
