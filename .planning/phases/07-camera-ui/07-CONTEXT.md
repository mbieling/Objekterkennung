# Phase 7: Camera UI - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Die Camera UI ermöglicht Ingenieuren, auf /search ein Bauteil direkt per Kamera im Browser zu fotografieren oder ein vorhandenes Foto als Datei hochzuladen — beides wird an POST /api/search gesendet. Nach der Suche zeigt /search ein Placeholder-Ergebnis (rohe JSON-Ausgabe). Ergebnisdarstellung und Schwellwert-Konfiguration kommen in Phase 8.

</domain>

<decisions>
## Implementation Decisions

### Routing & Navigation
- **D-01:** Eigene `/search`-Seite — `src/app/search/page.tsx`. Klare URL, bookmarkbar, symmetrisch zu `/upload` und `/admin`.
- **D-02:** Homepage (`/`) bekommt beide Buttons nebeneinander: "Teil hochladen" (→ /upload) + "Teil suchen" (→ /search). `src/app/page.tsx` wird entsprechend aktualisiert.

### Kamera-Flow
- **D-03:** **Live-Vorschau mit getUserMedia** — Video-Element zeigt Kamera-Stream, Capture-Button nimmt Screenshot via Canvas. Gibt dem Nutzer volle Kontrolle und ermöglicht Framing-Overlay.
- **D-04:** **Hinterkamera bevorzugen** — `getUserMedia({ video: { facingMode: { ideal: 'environment' } } })`. Fällt auf Frontkamera zurück falls nicht verfügbar.
- **D-05:** **Automatischer Fallback auf File-Upload** — wenn getUserMedia fehlschlägt (Berechtigung verweigert, kein HTTPS, kein Kamerazugriff), wird die Fehlermeldung angezeigt und sofort ein File-Input eingeblendet. Kein Dead-End für den Nutzer.
- **D-06:** File-Input als dauerhafter sekundärer Einstieg (SEARCH-02) — neben dem Kamera-Button immer sichtbar ("oder Foto aus Galerie wählen").

### Framing-Overlay
- **D-07:** **Visueller Rahmen über dem Kamera-Stream** — ein abgerundetes Rechteck (SVG oder absolut positioniertes div) über dem Video-Element, ca. 80% der Fläche. Gibt Nutzer die Orientierung "Bauteil hier positionieren". Kein zusätzlicher Text darunter (minimalistisch).

### Nach dem Capture
- **D-08:** **Vorschau + Bestätigung** — nach Capture wird das aufgenommene Bild als Vorschau angezeigt. Nutzer sieht zwei Buttons: "Suchen" (abschicken) und "Wiederholen" (neu aufnehmen). Verhindert versehentliche Fehlaufnahmen.
- **D-09:** **Spinner auf /search während Suche läuft** — nach "Suchen" wird die Kamera-UI ersetzt durch Spinner + "Suche läuft..."-Text. Kein Redirect — alles auf /search. Timeout analog Phase 4 (30s Vercel-Limit).
- **D-10:** **Placeholder-Ergebnis nach Suche** — nach erfolgreicher Antwort von POST /api/search zeigt /search die rohe JSON-Ausgabe in einem `<pre>`-Block (results.length + JSON). Phase 8 ersetzt diesen Block mit der echten Ergebnisdarstellung.
- **D-11:** Bei Fehler (Suche schlägt fehl, Timeout, Netzwerkfehler) — Fehlermeldung anzeigen + "Neu aufnehmen"-Button. Kein stiller Fail.

### Claude's Discretion
- Bildkompression vor dem Upload: optional (z.B. Canvas auf max. 1024px Breite skalieren bevor FormData). Claude entscheidet basierend auf typischer Mobilkamera-Auflösung vs. Worker-Performance.
- MIME-Typ des Canvas-Screenshots: `image/jpeg` mit Qualität 0.85 (kleinere Payload). Claude entscheidet.
- Komponentenstruktur: ob CameraCapture als eigenständige Client-Komponente ausgelagert wird oder alles in page.tsx.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Projektkontext & Anforderungen
- `.planning/PROJECT.md` — Core Value, Out-of-Scope-Liste, Constraints (HTTPS, Mobilfähigkeit)
- `.planning/REQUIREMENTS.md` — SEARCH-01 (Kamera-Capture), SEARCH-02 (File-Upload-Fallback)
- `.planning/ROADMAP.md` — Phase 7 Success Criteria (4 Punkte), Phase 7 Depends on Phase 6

### Phase 6 — Search Pipeline (direkte Abhängigkeit)
- `src/app/api/search/route.ts` — POST /api/search: erwartet multipart/form-data mit Bild, gibt `{results[], query}` zurück
- `.planning/phases/06-search-pipeline/06-CONTEXT.md` — D-09 (Score 0–1 Float), D-10 (keine Thumbnail-URL in Response), D-11 (Response-Shape)

### Phase 4 — Ingestion UI (Pattern-Referenz)
- `src/app/upload/page.tsx` — Seitenstruktur, shadcn/ui-Nutzung, Client Component Pattern
- `src/hooks/use-part-status.ts` — Polling-Hook als Referenz für Ladezustand-Pattern

### Phase 3 — Upload Pattern
- `src/app/api/upload/init/route.ts` — FormData + S3 Pattern (zum Verständnis, nicht direkt wiederverwendet)

### Aktuelle Homepage
- `src/app/page.tsx` — wird in Phase 7 mit zweitem Button ergänzt (D-02)

### Stack & Konventionen
- `.planning/codebase/CONVENTIONS.md` — Namenskonventionen, shadcn/ui-Exklusivität
- `.planning/codebase/STACK.md` — Tailwind, shadcn/ui, Playwright Mobile Safari in Tests

</canonical_refs>

<code_context>
## Existing Code Insights

### Wiederverwendbare Assets
- `src/components/ui/button.tsx` — shadcn/ui Button, inkl. `disabled`-State und `asChild` für Links
- `src/components/ui/badge.tsx` — für Status-Badges (falls in Phase 7 gebraucht)
- Lucide-Icons: `Camera`, `Upload`, `RotateCcw`, `Search` — alle verfügbar via `lucide-react`
- `src/app/page.tsx` — Homepage mit bestehendem Button; wird für D-02 erweitert (nicht ersetzt)

### Etablierte Muster
- Client Components: `"use client"` am Anfang, kein RSC wenn Browser-APIs (getUserMedia, Canvas) gebraucht werden
- Server-only Env-Vars: kein `NEXT_PUBLIC_`-Prefix für Search-API-interne Werte (aber /api/search ist öffentlich über fetch() erreichbar)
- shadcn/ui exklusiv — keine custom UI-Primitiven (Button, Spinner via Lucide Loader2, etc.)
- Vitest-Tests co-lokiert (`.test.ts` neben Quellfile), Playwright E2E in `tests/`
- Playwright-Config enthält Mobile Safari — Camera UI MUSS auf Mobile Safari getestet werden

### Integration Points
- **POST /api/search** — multipart/form-data Body mit `image`-Feld (File-Objekt). Response: `{results: [...], query: {...}}`
- **Canvas API** — `video.captureStream()` → Canvas `drawImage()` → `canvas.toBlob('image/jpeg', 0.85)` → FormData-Anhang
- **getUserMedia** — `navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })`
- **GET /api/parts/[id]/thumbnail** — wird von Phase 8 für Lazy-Loading der Thumbnails genutzt (Phase 7 muss das nicht selbst aufrufen)

### Nicht-Scope-Konflikte
- Threshold/Limit-Parameter an /api/search: Phase 7 sendet keine (Defaults werden verwendet) — Phase 8 fügt Konfiguration hinzu (D-08 aus Phase 6 CONTEXT)

</code_context>

<specifics>
## Specific Ideas

- Canvas-Screenshot als JPEG mit 0.85 Qualität und max. 1024px Breite — reduziert Payload und Worker-Last ohne sichtbaren Qualitätsverlust für Embedding-Berechnung
- Framing-Overlay als absolut positioniertes `div` mit `border-2 border-white/70 rounded-xl` über dem Video-Element (kein SVG nötig, Tailwind reicht)
- `<pre className="text-xs overflow-auto">` für JSON-Placeholder-Ergebnis (D-10)

</specifics>

<deferred>
## Deferred Ideas

- Bild-Crop/Rotate vor dem Senden — deutlich mehr Aufwand, kein eindeutiger Nutzen für Bauteil-Fotos
- QR/Barcode-Scan — explizit Out of Scope (PROJECT.md)
- Suchhistorie — v2-Anforderung
- Progressive Web App (PWA) / Kamera-Access ohne HTTPS auf localhost — Browser-Standard, kein Phase-7-Scope

</deferred>

---

*Phase: 7-Camera UI*
*Context gathered: 2026-05-09*
