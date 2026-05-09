# Phase 7: Camera UI — Research

**Recherchiert:** 2026-05-09
**Domain:** Browser Camera API (getUserMedia), Canvas Image Capture, Mobile Web UI
**Confidence:** HIGH

---

## Summary

Phase 7 implementiert die `/search`-Seite: eine mobile-first Client-Component, die per `getUserMedia` den Kamera-Stream aktiviert, ein Canvas-Capture macht, das Bild komprimiert und an `POST /api/search` schickt. Als dauerhafter Fallback (D-06) und bei Permission-Verweigerung (D-05) steht ein `<input type="file" accept="image/*" capture="environment">` bereit.

Alle kritischen Browser-APIs (`getUserMedia`, Canvas, `MediaDevices.enumerateDevices`) sind in den Ziel-Browsern (iOS Safari 16+, Android Chrome) verfügbar — **ausschliesslich über HTTPS**. Auf `localhost` funktioniert `getUserMedia` ebenfalls ohne HTTPS (secure context). Ein entscheidender Safari-Pitfall: `facingMode: { ideal: 'environment' }` wird von iOS Safari manchmal ignoriert; ein `enumerateDevices`-Fallback ist ratsam. Für Phase 7 ist `{ ideal: 'environment' }` jedoch ausreichend (D-04 spricht von "ideal", nicht "exact").

Der gesamte UI-Ablauf ist als Zustandsautomat umsetzbar: `idle` → `requesting` → `previewing` → `captured` → `searching` → `result | error`. Dieses Pattern ist analog zum UploadForm-Automaten aus Phase 4 und ist gut getestet.

**Primärempfehlung:** `CameraCapture.tsx` als eigenständige Client-Component neben `src/app/search/page.tsx` (Server-Component-Wrapper). State-Machine mit `useState<SearchPhase>`, kein externem State-Management nötig.

---

<user_constraints>
## User Constraints (aus CONTEXT.md)

### Gesperrte Entscheidungen (Locked)
- **D-01:** Eigene `/search`-Seite — `src/app/search/page.tsx`
- **D-02:** Homepage (`/`) bekommt beide Buttons nebeneinander: "Teil hochladen" (→ /upload) + "Teil suchen" (→ /search)
- **D-03:** Live-Vorschau mit getUserMedia — Video-Element + Canvas-Capture
- **D-04:** Hinterkamera bevorzugen — `getUserMedia({ video: { facingMode: { ideal: 'environment' } } })`
- **D-05:** Automatischer Fallback auf File-Upload bei getUserMedia-Fehler (Berechtigung verweigert, kein HTTPS, kein Kamerazugriff)
- **D-06:** File-Input als dauerhafter sekundärer Einstieg — immer sichtbar ("oder Foto aus Galerie wählen")
- **D-07:** Visueller Rahmen über Kamera-Stream — abgerundetes Rechteck als absolut positioniertes div, Tailwind, ~80% der Fläche
- **D-08:** Vorschau + Bestätigung nach Capture — "Suchen" + "Wiederholen"-Buttons
- **D-09:** Spinner auf /search während Suche läuft, kein Redirect, Timeout analog Phase 4 (30s)
- **D-10:** Placeholder-Ergebnis: rohe JSON-Ausgabe in `<pre>`-Block
- **D-11:** Fehlermeldung + "Neu aufnehmen"-Button bei Suchfehler

### Claude's Discretion
- Bildkompression: Canvas auf max. 1024px Breite skalieren vor FormData
- MIME-Typ: `image/jpeg` mit Qualität 0.85
- Komponentenstruktur: CameraCapture als eigenständige Client-Component (nicht alles in page.tsx)

### Deferred (OUT OF SCOPE)
- Bild-Crop/Rotate vor dem Senden
- QR/Barcode-Scan
- Suchhistorie
- PWA / Kamera-Access ohne HTTPS auf localhost (ist Browser-Standard)
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Beschreibung | Research-Unterstützung |
|----|-------------|----------------------|
| SEARCH-01 | Nutzer kann ein Bauteil direkt mit der Handy-Kamera im Browser fotografieren | getUserMedia + Canvas-Capture-Pattern verifiziert; iOS Safari 11+ unterstützt, HTTPS erforderlich |
| SEARCH-02 | Nutzer kann alternativ ein vorhandenes Foto als Datei hochladen (Fallback) | `<input type="file" accept="image/*" capture="environment">` deckt alle mobilen Browser ohne JS-API-Abhängigkeit |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Kamera-Stream aktivieren | Browser/Client | — | getUserMedia ist reines Browser-API, kein Server-Involvement |
| Canvas-Screenshot + Komprimierung | Browser/Client | — | CPU-seitige Canvas-Operation, clientseitig günstiger als Server-Round-Trip |
| File-Upload Fallback | Browser/Client | — | `<input type="file">` ist rein clientseitig |
| Bild an API senden | Browser/Client → API/Backend | — | `fetch()` mit FormData aus Client, empfangen von POST /api/search |
| Embedding + Suche | API/Backend | Python Worker | Bereits implementiert in Phase 6 |
| Ergebnis-Darstellung (Placeholder) | Browser/Client | — | `<pre>` JSON-Dump, vollständige Darstellung kommt Phase 8 |

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | ^16.2.6 | App Router, Server Component Wrapper | Projekt-Standard [VERIFIED: npm view next version] |
| React | ^19.0.0 | Client-Components, useState-State-Machine | Projekt-Standard |
| TypeScript | ^5 | Typsicherheit, strict mode | Projekt-Standard |
| Tailwind CSS | ^3.4.1 | Utility-first Styling, responsive, Overlay-Klassen | Projekt-Standard [VERIFIED: STACK.md] |
| shadcn/ui | aktuelle Komponenten | Button, Card, Alert, Skeleton | Exklusiv per Projektregel — NIEMALS custom |
| lucide-react | ^1.14.0 | Camera, Upload, RotateCcw, Search, Loader2 Icons | Bereits installiert [VERIFIED: npm view lucide-react version] |

### Browser APIs (keine npm-Installation)
| API | Zweck | Support-Status |
|-----|-------|---------------|
| `navigator.mediaDevices.getUserMedia` | Kamera-Stream | iOS Safari 11+, Android Chrome 53+ — nur HTTPS/localhost [CITED: MDN] |
| `HTMLVideoElement` | Stream-Vorschau | Universal |
| `HTMLCanvasElement.toBlob()` | JPEG-Capture + Komprimierung | Universal, asynchron [CITED: MDN] |
| `canvas.drawImage()` | Frame aus Video extrahieren | Universal |
| `MediaDevices.enumerateDevices()` | Kamera-Enumeration als Safari-Fallback | iOS 16.3+ mit vollem Label-Zugriff nach Permission [VERIFIED: WebSearch] |

### Keine zusätzlichen npm-Pakete nötig
Alle Browser-APIs für getUserMedia, Canvas und File-Handling sind nativ verfügbar. Kein `compressorjs` oder ähnliches notwendig — die Canvas-Komprimierung (max. 1024px + `toBlob('image/jpeg', 0.85)`) erledigt alles, was Phase 7 braucht.

**Installation:** Keine neuen Abhängigkeiten erforderlich.

---

## Architecture Patterns

### System Architecture Diagram

```
Mobiles Gerät (Browser)
        │
        ▼
  /search (page.tsx — Server Component)
        │ rendert
        ▼
  CameraCapture.tsx ("use client")
        │
   ┌────┴────────────────────────────────┐
   │         State Machine               │
   │  idle → requesting → previewing     │
   │       → captured → searching        │
   │       → result | error              │
   └──────────────────────────────────── ┘
        │                    │
        ▼                    ▼
  getUserMedia()      <input type="file">
  Video + Canvas      (immer sichtbar,
  Capture             Fallback bei Fehler)
        │                    │
        └──────────┬─────────┘
                   ▼
        canvas.toBlob('image/jpeg', 0.85)
        + Resize auf max. 1024px Breite
                   │
                   ▼
        fetch('POST /api/search',
              FormData { image: Blob })
                   │
         ┌─────────┴──────────┐
         ▼                    ▼
    200 OK                 Fehler
    JSON in <pre>          Alert + "Neu aufnehmen"
    (Placeholder Phase 7)
```

### Empfohlene Projektstruktur

```
src/app/search/
├── page.tsx              # Server Component Wrapper (Metadata, Layout)
├── CameraCapture.tsx     # Client Component — gesamte Camera/Upload-Logik
└── CameraCapture.test.tsx # Vitest Unit Tests

tests/
└── phase-07-camera-ui.spec.ts  # Playwright E2E (Chromium + Mobile Safari)
```

### Pattern 1: SearchPhase Zustandsautomat

Analog zu `UploadPhase` in `src/app/upload/UploadForm.tsx` (Phase-4-Pattern).

```typescript
// src/app/search/CameraCapture.tsx
'use client'

type SearchPhase =
  | 'idle'        // Startbildschirm: Camera-Button + File-Input sichtbar
  | 'requesting'  // getUserMedia läuft — kurzer Übergang
  | 'previewing'  // Video-Stream läuft, Capture-Button sichtbar
  | 'captured'    // Standbild aufgenommen, Vorschau + Bestätigung
  | 'searching'   // POST /api/search läuft — Spinner
  | 'result'      // Ergebnis vorhanden — JSON <pre>
  | 'error'       // Suche fehlgeschlagen — Fehlermeldung + "Neu aufnehmen"

// Source: Analogie zu src/app/upload/UploadForm.tsx (VERIFIED: codebase)
```

### Pattern 2: getUserMedia mit Rear-Camera-Preference

```typescript
// D-04: facingMode: { ideal: 'environment' } — fällt auf Frontkamera zurück,
// falls Hinterkamera nicht verfügbar (nicht 'exact' — kein Hard-Fail).
// Source: MDN MediaDevices.getUserMedia [CITED: developer.mozilla.org]

async function startCamera(videoRef: React.RefObject<HTMLVideoElement>) {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: 'environment' },
    },
    audio: false,
  })
  if (videoRef.current) {
    videoRef.current.srcObject = stream
    await videoRef.current.play()
  }
  return stream
}
```

### Pattern 3: Canvas-Capture mit Komprimierung (Claude's Discretion)

```typescript
// Komprimierung: max. 1024px Breite, JPEG 0.85 — reduziert Payload ohne
// sichtbaren Qualitätsverlust für DINOv2-Embedding.
// Source: CONTEXT.md <specifics> + MDN HTMLCanvasElement.toBlob
// [CITED: developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob]

function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  const MAX_WIDTH = 1024
  const scale = Math.min(1, MAX_WIDTH / video.videoWidth)
  const w = Math.round(video.videoWidth * scale)
  const h = Math.round(video.videoHeight * scale)

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(video, 0, 0, w, h)

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('toBlob lieferte null')),
      'image/jpeg',
      0.85
    )
  })
}
```

### Pattern 4: Stream-Cleanup (Memory-Leak-Prävention)

```typescript
// useEffect-Cleanup MUSS den Stream stoppen — sonst bleibt Kamera-Indikator aktiv.
// Source: Analog zu use-part-status.ts AbortController-Cleanup (VERIFIED: codebase)

useEffect(() => {
  return () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
  }
}, [])
```

### Pattern 5: File-Input als dauerhafter Fallback (D-06)

```typescript
// accept="image/*" capture="environment" — Hint für Mobilbrowser, direkt Kamera zu öffnen
// Fallback auf Galerie wenn capture nicht unterstützt wird.
// Source: MDN HTMLInputElement [ASSUMED — allgemeines HTML5-Wissen]

<input
  ref={fileInputRef}
  type="file"
  accept="image/*"
  capture="environment"   // Hint für direkte Kamera auf Mobile
  className="hidden"
  onChange={handleFileSelect}
/>
```

### Pattern 6: Framing-Overlay (D-07)

```tsx
// Absolut positioniertes div über dem Video — kein SVG nötig.
// Source: CONTEXT.md <specifics> (VERIFIED: 07-CONTEXT.md)

<div className="relative w-full aspect-[4/3] max-w-sm mx-auto">
  <video ref={videoRef} className="w-full h-full object-cover rounded-lg" playsInline muted />
  {/* Framing-Overlay — 80% der Fläche */}
  <div className="absolute inset-[10%] border-2 border-white/70 rounded-xl pointer-events-none" />
</div>
```

**Wichtig:** `playsInline` ist auf iOS Safari **zwingend** — ohne dieses Attribut öffnet Safari das Video im Vollbild und blockiert die Canvas-Capture. [VERIFIED: WebSearch iOS Safari getUserMedia]

### Anti-Patterns vermeiden

- **`facingMode: { exact: 'environment' }`** — würde auf Geräten ohne Hinterkamera einen Hard-Error werfen; `ideal` ist korrekt (D-04)
- **`setRequestHeader('Content-Type', ...)`** beim FormData-fetch — Next.js setzt den Boundary automatisch; manuelles Setzen bricht multipart
- **Stream nicht stoppen bei Komponentenunmount** — Kamera-Indikator bleibt aktiv, Memory-Leak
- **Canvas-Capture synchron ohne `await play()`** — auf iOS kann `drawImage()` einen schwarzen Frame liefern, wenn das Video noch nicht spielt
- **`<video autoPlay>` ohne `playsInline`** — iOS Safari öffnet Vollbild-Player

---

## Don't Hand-Roll

| Problem | Nicht bauen | Stattdessen | Warum |
|---------|-------------|-------------|-------|
| Spinner/Loading-UI | Custom Spinner | `Loader2` aus lucide-react + Tailwind `animate-spin` | Bereits im Projekt etabliert (Phase 4 Pattern) |
| Error-Alert | Custom Alert-Box | `Alert`, `AlertDescription` aus shadcn/ui | Projektregel: shadcn exklusiv |
| Button-States | Custom disabled/hover | `Button` aus shadcn/ui mit `disabled`-Prop | Projektregel |
| Image-Komprimierung | Externe Library | Canvas `toBlob('image/jpeg', 0.85)` nativ | Keine zusätzliche npm-Abhängigkeit nötig |
| Camera-Bibliothek | `react-webcam` o.ä. | Natives `getUserMedia` + Canvas | Volle Kontrolle, keine Abhängigkeit, D-03 entschieden |

**Key insight:** getUserMedia + Canvas ist für diesen Use-Case vollständig — keine externe Kamera-Library nötig oder von CONTEXT.md gewünscht.

---

## Common Pitfalls

### Pitfall 1: iOS Safari — `playsInline` fehlt
**Was passiert:** iOS Safari öffnet das Video im systemweiten Fullscreen-Player, Canvas-Capture ist nicht möglich, `drawImage()` kann schwarzen Frame liefern.
**Warum:** iOS Safari-Standard vor playsInline-Attribut war Vollbild-Erzwingung.
**Vermeidung:** `<video playsInline muted autoPlay ref={videoRef}>` — alle drei Attribute setzen.
**Warnsignal:** Kamera öffnet sich in einem separaten Fenster, nicht im Inline-Element.
[VERIFIED: WebSearch iOS Safari getUserMedia]

### Pitfall 2: Stream-Leak bei Komponentenunmount
**Was passiert:** Kamera-Indikator (roter Punkt) bleibt dauerhaft aktiv, auch nachdem der Nutzer die Seite verlässt.
**Warum:** `MediaStream.getTracks()` müssen explizit gestoppt werden — React räumt Browser-APIs nicht automatisch auf.
**Vermeidung:** `useEffect`-Cleanup immer mit `stream.getTracks().forEach(t => t.stop())`.
**Warnsignal:** Kamera-LED leuchtet auf Folgeseiten weiter.
[ASSUMED — allgemeines WebRTC-Wissen, Analogie zu use-part-status.ts cleanup]

### Pitfall 3: `facingMode` auf iOS Safari oft ignoriert
**Was passiert:** iOS Safari ignoriert `facingMode`-Constraint in bestimmten Versionen — Frontkamera wird geöffnet trotz `{ ideal: 'environment' }`.
**Warum:** Safari-Implementation des Constraints ist unvollständig; Privacy-Einschränkungen limitieren `enumerateDevices`-Label-Zugriff vor Permission.
**Vermeidung:** `ideal` statt `exact` verwenden (D-04). Nach Permission kann `enumerateDevices()` + Label-Filter verwendet werden — für Phase 10 (Hardening) reservieren.
**Warnsignal:** Frontalkamera wird auf iOS-Gerät geöffnet.
[VERIFIED: WebSearch — mehrere Quellen bestätigen]

### Pitfall 4: `drawImage()` vor `video.play()` gibt schwarzen Frame
**Was passiert:** Canvas-Screenshot ist komplett schwarz — kein Bild übertragen.
**Warum:** Auf iOS muss das Video tatsächlich abgespielt werden bevor Frames verfügbar sind; `srcObject` setzen allein reicht nicht.
**Vermeidung:** `await videoRef.current.play()` vor Capture; `video.readyState >= 2` prüfen oder auf `canplay`-Event warten.
**Warnsignal:** API-Aufruf liefert schwarzes Bild, Worker gibt unerwartetes Embedding zurück.
[ASSUMED — bekanntes iOS WebRTC/Canvas-Problem]

### Pitfall 5: FormData Content-Type manuell setzen
**Was passiert:** Server empfängt leere/fehlerhafte FormData; `request.formData()` schlägt fehl.
**Warum:** `fetch()` mit FormData setzt automatisch den richtigen `multipart/form-data`-Header inkl. Boundary; manuelles Überschreiben zerstört die Boundary-Information.
**Vermeidung:** Kein `headers: { 'Content-Type': ... }` setzen beim FormData-fetch.
**Warnsignal:** Server antwortet mit 400 "FormData konnte nicht gelesen werden".
[VERIFIED: Analog zu Phase 4 S3-PUT Pitfall — codebase Kommentar bestätigt]

### Pitfall 6: getUserMedia auf HTTP (nicht localhost) — SecurityError
**Was passiert:** `navigator.mediaDevices` ist `undefined` oder wirft `NotAllowedError`/`SecurityError`.
**Warum:** Browser erlauben getUserMedia nur in Secure Contexts (HTTPS oder localhost).
**Vermeidung:** Deployment immer über HTTPS (Vercel = automatisch HTTPS). Lokale Entwicklung über `localhost:3000` (kein HTTP-Problem). File-Input-Fallback greift automatisch (D-05).
**Warnsignal:** `TypeError: Cannot read properties of undefined (reading 'getUserMedia')`.
[VERIFIED: MDN — Secure Contexts requirement]

---

## Code Examples

### Vollständiger State-Machine-Überblick
```typescript
// Source: Pattern aus src/app/upload/UploadForm.tsx (VERIFIED: codebase)
// Adaption für Camera-Flow

type SearchPhase = 'idle' | 'requesting' | 'previewing' | 'captured' | 'searching' | 'result' | 'error'

// Transitions:
// idle → requesting:  Kamera-Button click
// requesting → previewing: getUserMedia success
// requesting → idle: getUserMedia error + File-Input einblenden (D-05)
// previewing → captured: Capture-Button click
// captured → previewing: "Wiederholen"-Button click (D-08)
// captured → searching: "Suchen"-Button click (D-08)
// searching → result: API 200 OK (D-10)
// searching → error: API-Fehler, Timeout (D-11)
// error → idle: "Neu aufnehmen"-Button click (D-11)
```

### POST /api/search aufrufen
```typescript
// Source: Ablesen aus src/app/api/search/route.ts (VERIFIED: codebase)

async function searchWithBlob(blob: Blob): Promise<SearchResult> {
  const formData = new FormData()
  formData.append('image', blob, 'capture.jpg')  // Dateinamen für Content-Disposition

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30_000) // D-09: 30s Timeout

  try {
    const res = await fetch('/api/search', {
      method: 'POST',
      body: formData,
      // KEIN Content-Type Header! Browser setzt Boundary automatisch.
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } finally {
    clearTimeout(timeoutId)
  }
}
```

### Response-Shape (aus Phase 6 D-11)
```typescript
// Source: .planning/phases/06-search-pipeline/06-CONTEXT.md D-11 (VERIFIED)

interface SearchResponse {
  results: Array<{
    id: string
    name: string
    part_number: string | null
    project: string | null
    status: 'ready'
    similarity: number   // 0–1 Float; Phase 8 rechnet in Prozent um
    created_at: string   // ISO 8601
  }>
  query: {
    threshold: number
    limit: number
    results_count: number
  }
}
```

### Placeholder-Ergebnis (D-10)
```tsx
// Source: CONTEXT.md <specifics> (VERIFIED)

{phase === 'result' && searchResult && (
  <pre className="text-xs overflow-auto bg-muted p-4 rounded-lg">
    {JSON.stringify(searchResult, null, 2)}
  </pre>
)}
```

---

## State of the Art

| Alter Ansatz | Aktueller Ansatz | Geändert seit | Impact |
|--------------|-----------------|---------------|--------|
| `navigator.getUserMedia()` (legacy) | `navigator.mediaDevices.getUserMedia()` | 2015 (W3C) | Altes API deprecated, nicht mehr verwenden |
| `<input capture="camera">` als einzige Kamera-Option | getUserMedia + Canvas für Live-Vorschau | 2013+ | Volle Kontrolle über Stream, Framing möglich (D-03) |
| `canvas.toDataURL()` | `canvas.toBlob()` | 2014 | toBlob ist speichereffizienter, async, direkter Blob für FormData |

**Deprecated/veraltet:**
- `navigator.getUserMedia()` (ohne `mediaDevices`): Nicht mehr verwenden — in allen modernen Browsern durch `navigator.mediaDevices.getUserMedia()` ersetzt [CITED: MDN]
- `URL.createObjectURL(stream)` als Video-Src: Veraltet — `video.srcObject = stream` ist der korrekte Weg [CITED: MDN]

---

## Assumptions Log

| # | Claim | Abschnitt | Risiko wenn falsch |
|---|-------|-----------|-------------------|
| A1 | Stream-Leak ohne `getTracks().stop()` ist realer Bug auf iOS | Pitfall 2 | Kamera-Indikator bleibt aktiv — schlechte UX, kein Datenverlust |
| A2 | `drawImage()` auf schwarzem Frame wenn `play()` noch nicht abgeschlossen | Pitfall 4 | Schwarzes Foto wird an API gesendet — schlechte Suchergebnisse |
| A3 | `<input capture="environment">` öffnet direkt Kamera-App auf iOS Safari | Pattern 5 | Galerie öffnet sich statt Kamera — funktional, nicht ideal |

**Alle anderen Claims sind VERIFIED (codebase) oder CITED (offizielle Quellen).**

---

## Open Questions

1. **Safari facingMode-Zuverlässigkeit**
   - Was bekannt ist: `{ ideal: 'environment' }` kann auf iOS ignoriert werden (mehrere Quellen)
   - Was unklar ist: Betrifft das aktuelle iOS 18.x noch?
   - Empfehlung: Mit `ideal` implementieren (D-04). Testen auf echtem iPhone-Gerät in Phase 10 (Hardening).

2. **`video.play()` auf iOS ohne User-Gesture**
   - Was bekannt ist: iOS erlaubt `autoplay` nur für `muted` Videos
   - Was unklar ist: Ob `await video.play()` nach getUserMedia immer ohne User-Gesture funktioniert
   - Empfehlung: `muted` + `playsInline` setzen (bereits in Pattern berücksichtigt); `play()` im getUserMedia-Callback aufrufen (nach Kamera-Button-Click = User Gesture vorhanden)

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js Dev-Server | ✓ | 25.6.0 | — |
| Playwright + Mobile Safari | E2E Tests | ✓ | 1.59.1 | — |
| Vitest | Unit Tests | ✓ | 4.1.5 | — |
| lucide-react (Camera Icon) | UI | ✓ | 1.14.0 | — |
| shadcn/ui Button, Alert, Card, Skeleton | UI | ✓ | installiert | — |
| getUserMedia (HTTPS) | SEARCH-01 | ✓ auf localhost/Vercel | Browser-API | File-Input (D-05/D-06) |

**Kein Missing Dependency ohne Fallback.** getUserMedia-Fehler werden durch File-Input abgefangen (D-05).

---

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.5 + @testing-library/react |
| Config file | `vitest.config.ts` (jsdom, globals: true) |
| Quick run command | `npm test -- --reporter=verbose src/app/search/CameraCapture.test.tsx` |
| Full suite command | `npm test` |
| E2E Framework | Playwright 1.59.1 |
| E2E Quick run | `npx playwright test tests/phase-07-camera-ui.spec.ts --project=chromium` |
| E2E Full | `npx playwright test tests/phase-07-camera-ui.spec.ts` (Chromium + Mobile Safari) |

### Phase Requirements → Test Map

| Req ID | Verhalten | Test-Typ | Automated Command | File vorhanden? |
|--------|----------|-----------|-------------------|-----------------|
| SEARCH-01 | Kamera-Button startet getUserMedia, Video sichtbar | unit | `npm test -- src/app/search/CameraCapture.test.tsx` | ❌ Wave 0 |
| SEARCH-01 | Capture-Button liefert Bild an POST /api/search | unit | `npm test -- src/app/search/CameraCapture.test.tsx` | ❌ Wave 0 |
| SEARCH-01 | getUserMedia-Fehler → File-Input wird eingeblendet (D-05) | unit | `npm test -- src/app/search/CameraCapture.test.tsx` | ❌ Wave 0 |
| SEARCH-02 | File-Input immer sichtbar (D-06) | unit | `npm test -- src/app/search/CameraCapture.test.tsx` | ❌ Wave 0 |
| SEARCH-02 | File auswählen → POST /api/search wird aufgerufen | unit | `npm test -- src/app/search/CameraCapture.test.tsx` | ❌ Wave 0 |
| D-08 | Capture-Vorschau: "Suchen" + "Wiederholen" sichtbar | unit | `npm test -- src/app/search/CameraCapture.test.tsx` | ❌ Wave 0 |
| D-09 | Spinner sichtbar während Suche | unit | `npm test -- src/app/search/CameraCapture.test.tsx` | ❌ Wave 0 |
| D-10 | JSON in `<pre>` nach erfolgreicher Suche | unit | `npm test -- src/app/search/CameraCapture.test.tsx` | ❌ Wave 0 |
| D-11 | Fehler-Alert + "Neu aufnehmen"-Button | unit | `npm test -- src/app/search/CameraCapture.test.tsx` | ❌ Wave 0 |
| SEARCH-01+02 | E2E: /search erreichbar, File-Input vorhanden | e2e | `npx playwright test tests/phase-07-camera-ui.spec.ts` | ❌ Wave 0 |
| D-02 | Homepage zeigt beide Buttons | e2e | `npx playwright test tests/phase-07-camera-ui.spec.ts` | ❌ Wave 0 |

**Hinweis zum Mocking:** `navigator.mediaDevices.getUserMedia` ist in jsdom nicht verfügbar — muss in Tests via `vi.stubGlobal('navigator', ...)` oder `Object.defineProperty` gemockt werden. Analoges Pattern wie `global.fetch = vi.fn()` in UploadForm.test.tsx.

### Sampling Rate
- **Pro Task-Commit:** `npm test -- src/app/search/CameraCapture.test.tsx`
- **Pro Wave-Merge:** `npm test && npx playwright test tests/phase-07-camera-ui.spec.ts --project=chromium`
- **Phase Gate:** Beide Suiten grün vor `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/app/search/CameraCapture.test.tsx` — deckt SEARCH-01, SEARCH-02, D-05 bis D-11
- [ ] `tests/phase-07-camera-ui.spec.ts` — E2E-Stub (Mobile Safari), deckt Seitennavigation + File-Input-Sichtbarkeit
- [ ] getUserMedia-Mock-Helper (in CameraCapture.test.tsx inline, kein separates Fixture)

*(Kein Framework-Install nötig — Vitest + Playwright bereits konfiguriert)*

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | nein | — (keine Auth in Phase 7) |
| V3 Session Management | nein | — |
| V4 Access Control | nein | — (POST /api/search ist öffentlich, Phase 10 entscheidet Auth) |
| V5 Input Validation | ja | `image instanceof File` Check; MIME-Typ-Prüfung via `file.type.startsWith('image/')` empfohlen |
| V6 Cryptography | nein | — |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Nicht-Bild-Datei als `image` hochladen | Tampering | Client-seitig: `accept="image/*"` + JS `file.type`-Check; Server-seitig: POST /api/search validiert bereits `image instanceof File` |
| Exzessiv große Datei (DoS via Canvas) | DoS | Max. 1024px Resize auf Canvas begrenzt Memory-Spike; kein explizites Filesize-Limit nötig (Canvas skaliert) |
| getUserMedia ohne HTTPS (Man-in-Middle) | Spoofing | Browser erzwingt Secure Context — kein Code-Aufwand nötig |

---

## Sources

### Primary (HIGH confidence)
- Codebase `src/app/upload/UploadForm.tsx` — State-Machine Pattern (Phase 4, VERIFIED)
- Codebase `src/app/api/search/route.ts` — API-Contract (Phase 6, VERIFIED)
- Codebase `.planning/phases/07-camera-ui/07-CONTEXT.md` — Alle Locked Decisions (VERIFIED)
- Codebase `.planning/phases/06-search-pipeline/06-CONTEXT.md` — Response-Shape D-11 (VERIFIED)
- Codebase `playwright.config.ts` — Mobile Safari Konfiguration (VERIFIED)
- [MDN: HTMLCanvasElement.toBlob()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob) — CITED

### Secondary (MEDIUM confidence)
- [blog.addpipe.com: getUserMedia Getting Started](https://blog.addpipe.com/getusermedia-getting-started/) — iOS Safari HTTPS-Anforderung
- [progressier.com: Choose Front/Back Camera](https://progressier.com/choose-front-back-camera-stream) — facingMode-Workaround
- [dominikschilling.de: iOS 16.3 all back cameras](https://dominikschilling.de/notes/ios-access-all-back-cameras-mediadevices-api/) — enumerateDevices nach Permission

### Tertiary (LOW confidence)
- `canvas.toBlob()` → schwarzer Frame auf iOS bei fehlendem `play()` — A2: ASSUMED, kein offizieller Beleg gefunden

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — Alle Libraries im Projekt vorhanden, keine neuen Abhängigkeiten
- Architecture: HIGH — Pattern direkt aus Phase-4-Codebase abgeleitet, API-Contract aus Phase-6-Codebase
- Browser-API Pitfalls: MEDIUM — getUserMedia-iOS-Verhalten aus mehreren Quellen bestätigt, einzelne Punkte ASSUMED
- Test-Architektur: HIGH — Analogie zu bestehenden Vitest/Playwright-Tests im Projekt

**Research date:** 2026-05-09
**Valid until:** 2026-06-09 (Browser-APIs sind stabil; iOS Safari-Verhalten kann sich mit iOS-Updates ändern)
