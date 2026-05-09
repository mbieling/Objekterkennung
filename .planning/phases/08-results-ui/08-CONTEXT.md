# Phase 8: Results UI - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 8 ersetzt den `<pre>`-JSON-Placeholder aus Phase 7 durch eine vollständige Ergebnisdarstellung auf `/search`: ein einspaltig gestacktes Grid aus Trefferkarten (Thumbnail + Name + farbkodiertes Match-%), Threshold-Slider und Limit-Select direkt über dem Grid. Thumbnail-Loading via `GET /api/parts/[id]/thumbnail` (lazy, bereits vorhanden). Neue Suche löscht Ergebnisse erst wenn die neue Antwort vorliegt. Navigation zu Part-Detail (Phase 9) per Klick auf die Karte.

</domain>

<decisions>
## Implementation Decisions

### Ergebnis-Grid
- **D-01:** **1 Spalte** auf Mobile (375px) — Vollbreite-Karten, konsistent mit `/upload` und `/admin`. Auf größeren Screens: Claude entscheidet (max-w-md Container wie /search).
- **D-02:** **Karteninhalt: Thumbnail + Name + Match-%** — kompakte Darstellung. Part-Nummer und Projekt sind secondary und kommen in der Part-Detail-Seite (Phase 9).
- **D-03:** **Karten sind anklickbar** — jede Karte ist ein Next.js `<Link href="/parts/[id]">`. Phase 9 erstellt die Zielseite; bis dahin 404 als Placeholder akzeptiert.

### Match-%-Darstellung
- **D-04:** **Farbige Badge + Prozentzahl** — Shadcn `<Badge>` Komponente. Farb-Schwellwerte:
  - ≥ 80%: grün (variant oder custom className `bg-green-500 text-white`)
  - 60–79%: gelb/amber (`bg-amber-500 text-white`)
  - < 60%: rot (`bg-red-500 text-white`)
  - Hinweis: Similarity 0–1 Float aus API → ×100 für Anzeige (Phase 6 D-09).
- **D-05:** Badge-Position: rechts unten auf der Karte (nach Name-Text, nicht über Thumbnail).

### Threshold & Limit Controls
- **D-06:** **Threshold-Slider** — `npx shadcn@latest add slider` installieren. Range 0.0–1.0, Step 0.05. Default 0.0 für die initiale Suchanfrage (alle Treffer holen), Anzeige-Default 0.5 (zeigt Ergebnisse ab 50%). Wert daneben als Prozentsatz angezeigt (z.B. "50%").
- **D-07:** **Client-seitige Filterung** — POST /api/search wird einmalig mit `threshold=0&limit=50` aufgerufen um alle möglichen Treffer zu holen. Slider filtert die gespeicherte Liste lokal (`results.filter(r => r.similarity >= sliderValue)`). Sofortiges Feedback, kein zusätzlicher Netzwerk-Roundtrip.
- **D-08:** **Limit-Select-Dropdown** — Shadcn `<Select>` mit Optionen: 10 / 20 / 50 Ergebnisse. Bestimmt den `limit`-Parameter der initialen API-Anfrage. Default: 10. Wenn Nutzer auf 20 wechselt → neue API-Anfrage mit limit=20.
- **D-09:** **Position: direkt über dem Ergebnis-Grid** — kompakte Zeile: `[Ähnlichkeit: Slider 50%] [Ergebnisse: Select]`. Sichtbar ohne Scrollen.

### Leerzustand & Übergänge
- **D-10:** **Kein Treffer über Threshold** → Nachricht "Keine ähnlichen Teile gefunden." + Hinweis "Versuche den Ähnlichkeitsschwellwert zu verringern." mit optionalem Pfeil auf den Slider.
- **D-11:** **Neue Suche** — beim Klick auf "Neu aufnehmen" bleiben alte Ergebnisse sichtbar bis die neue Suche abgeschlossen ist. Spinner überlagert die Ergebnisse (oder ersetzt Grid temporär). Kein abruptes Leeren.

### Claude's Discretion
- Thumbnail-Skeleton-Placeholder: ob Skeleton-Komponente beim Laden des Thumbnails angezeigt wird oder direktes `<img>` mit `onError`-Fallback. Claude entscheidet.
- Responsive Grid auf Desktop (> 768px): ob 2 Spalten oder weiterhin 1 Spalte im max-w-md Container. Claude entscheidet.
- Genaue Tailwind-Klassen für Badge-Farben: ob über shadcn-Varianten oder direkte className. Claude entscheidet.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Projektkontext & Anforderungen
- `.planning/PROJECT.md` — Core Value, Zielgruppe (Ingenieure), Constraints
- `.planning/REQUIREMENTS.md` — SEARCH-03 (Ranked Results), SEARCH-04 (Configurable Threshold), SEARCH-05 (Configurable Result Count)
- `.planning/ROADMAP.md` — Phase 8 Goal + Success Criteria (4 Punkte)

### Phase 6 — Search Pipeline API (direkte Abhängigkeit)
- `src/app/api/search/route.ts` — POST /api/search: erwartet multipart/form-data mit `image`-Feld, Query-Params `threshold` + `limit`, gibt `{results[], query}` zurück
- `.planning/phases/06-search-pipeline/06-CONTEXT.md` — D-05 bis D-11 (Score als Float, Response-Shape, Defaults)

### Phase 7 — Camera UI (direkte Abhängigkeit)
- `src/app/search/CameraCapture.tsx` — hält `searchResult`-State; Phase 8 liest diesen State oder Phase 8 baut auf der gleichen Seite auf. `SearchResponse`-Interface dort definiert.
- `src/app/search/page.tsx` — Server Component Wrapper für `/search`
- `.planning/phases/07-camera-ui/07-CONTEXT.md` — D-10 (Placeholder `<pre>` wird ersetzt), D-09 (Spinner bleibt auf /search)

### Phase 4 — Thumbnail-Muster
- `src/app/api/parts/[id]/thumbnail/route.ts` — GET endpoint für Thumbnail-Bild; gibt Image-Bytes zurück
- `src/app/admin/CatalogTable.tsx` — zeigt Lazy-Thumbnail-Loading Pattern (useEffect + img src)

### Verfügbare shadcn/ui-Komponenten
- `src/components/ui/badge.tsx` — für Match-%-Anzeige (D-04)
- `src/components/ui/card.tsx` — Trefferkarten-Wrapper (D-01/02)
- `src/components/ui/skeleton.tsx` — Thumbnail-Placeholder-Loading
- `src/components/ui/select.tsx` — Limit-Select-Dropdown (D-08)
- ⚠ Slider **muss installiert werden**: `npx shadcn@latest add slider --yes` (D-06)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/search/CameraCapture.tsx` — enthält `SearchResponse`-Interface und `searchResult`-State; Phase 8 erweitert oder wraps diesen State
- `src/app/admin/CatalogTable.tsx` — Thumbnail-Loading Pattern (useEffect, img src → /api/parts/[id]/thumbnail, Fallback)
- `src/components/ui/badge.tsx` — direkt nutzbar für Match-%-Badge (D-04)
- `src/components/ui/card.tsx` — CardContent, CardHeader für Trefferkarten (D-01)
- `src/components/ui/skeleton.tsx` — Thumbnail-Skeleton-Placeholder
- `src/components/ui/select.tsx`, `SelectTrigger`, `SelectContent`, `SelectItem` — für Limit-Dropdown (D-08)
- `src/hooks/use-part-status.ts` — AbortController-Pattern als Referenz

### Established Patterns
- **State Machine in CameraCapture.tsx** — Phase 8 muss `SearchPhase`-Typ und `searchResult`-State erweitern oder eine separate `ResultsView`-Komponente einführen
- **shadcn/ui first** — Badge, Card, Select, Skeleton sind installiert; Slider muss via CLI nachinstalliert werden
- **`cn()` aus `@/lib/utils`** — für bedingte Tailwind-Klassen (Badge-Farben)
- **`use client` + useState** — Client Component für interaktive Controls (Slider, Select)

### Integration Points
- **`/search` Seite**: Phase 8 ersetzt den `result`-State in `CameraCapture.tsx` — entweder durch Erweiterung der Komponente oder Extraktion einer `SearchResults`-Komponente
- **`POST /api/search`** — wird mit `threshold=0&limit=50` (oder konfigurierbarem Limit) aufgerufen; Query-Params bereits implementiert in Phase 6
- **`GET /api/parts/[id]/thumbnail`** — für jeden Treffer lazy geladen; Route existiert seit Phase 4

</code_context>

<specifics>
## Specific Ideas

- Badge-Farben: grün ≥80%, amber 60–79%, rot <60% (exakt diese Schwellwerte)
- Slider mit Prozentwert-Anzeige daneben ("50%") statt Dezimalwert ("0.50")
- Initiale API-Anfrage mit `threshold=0` und `limit=50` (oder gewähltem Limit) um alle Kandidaten zu holen; lokale Filterung per Slider
- Karten-Klick navigiert zu `/parts/[id]` als Vorwegnahme der Phase-9-Route

</specifics>

<deferred>
## Deferred Ideas

- **Part-Detail-Seite** — Klick auf Karte navigiert zu `/parts/[id]`, aber die Seite selbst kommt in Phase 9
- **Erweiterte Metadaten auf Karte** (Part-Nummer, Projekt, Status) — bewusst auf Minimal gehalten; Phase 9 oder Phase 10 kann erweitern wenn gewünscht
- **Vergleichsmodus** (mehrere Treffer nebeneinander vergleichen) — spannend, aber eigene Phase

</deferred>

---

*Phase: 8-Results UI*
*Context gathered: 2026-05-09*
