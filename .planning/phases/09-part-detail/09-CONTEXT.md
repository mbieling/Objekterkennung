# Phase 9: Part Detail - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 9 erstellt die `/parts/[id]`-Detailseite, auf die Nutzer von Suchergebnissen (Phase 8 SearchResultCard) landen. Die Seite zeigt alle Metadaten des Bauteils (Name, Teilenummer, Projekt, Status, Upload-Datum), eine Galerie mit allen 6–8 orthographischen Ansichten (Hauptbild + Thumbnail-Leiste) und einen Download-Button für die Original-STEP-Datei. Navigation zurück zur Suche via explizitem Header-Link.

</domain>

<decisions>
## Implementation Decisions

### Thumbnail-Galerie
- **D-01:** **Hauptbild + Thumbnail-Leiste** — Großes Hauptbild oben, darunter eine scrollbare horizontale Leiste mit Miniaturansichten (alle 6–8 Views). Klick auf Miniatur wechselt das Hauptbild. Klassisches Produktbild-Pattern.
- **D-02:** **Hauptbild: quadratisch, fixe Größe** — 320×320px auf Mobile, 480×480px auf Desktop (≥ 768px). Konsistent mit den 512×512 gerenderten Views. Claude entscheidet genaue Breakpoints.
- **D-03:** **Alle Views gleichzeitig laden** — Beim Seitenaufruf werden alle Presigned URLs in einer API-Anfrage geholt (kein Lazy-Loading). STEP-Thumbnails sind klein (< 100 KB), kein Grund für Lazy-Loading-Komplexität.
- **D-04:** **Skeleton-Placeholder** — Während die Presigned URLs geladen werden, zeigt das Hauptbild und jede Miniatur ein Skeleton. Nach dem Laden werden Bilder eingeblendet.

### STEP-Download
- **D-05:** **Presigned URL → Browser-Download** — Server erstellt eine Presigned S3-URL (ähnlich wie `/thumbnail`-Route) mit `response-content-disposition: attachment; filename="{name}.step"`. Browser lädt direkt von S3 — kein Proxy durch Next.js (verhindert Timeout-Probleme bei Dateien bis 100 MB).
- **D-06:** **Dateiname: `{name}.step`** — Der `name`-Wert aus der DB, sanitized für Dateinamen (Leerzeichen → `_`, Sonderzeichen entfernen). Beispiel: `Flansch_M12.step`.
- **D-07:** **Download-Button unten auf der Seite** — Primärer `<Button>` mit Label "STEP herunterladen". Disabled mit Hinweis "Datei wird verarbeitet" wenn status ≠ 'ready'.

### Navigation & Layout
- **D-08:** **`← Zurück zur Suche`-Link** — Im Seiten-Header als Link zu `/search`. Nutzt `router.back()` falls History vorhanden, sonst href='/search' als Fallback. Wichtig für Mobile-UX.
- **D-09:** **Layout (von oben nach unten):**
  1. `← Zurück zur Suche` (Header-Link)
  2. Hauptbild (320×320 → 480×480 auf Desktop)
  3. Thumbnail-Leiste (horizontal scrollbar)
  4. Name als `<h1>`
  5. Metadaten-Tabelle: Teilenummer, Projekt, Status (als Badge), Hochgeladen (formatiertes Datum)
  6. `STEP herunterladen`-Button
- **D-10:** **Status-Badge** — Wie in Admin-Katalog: `ready` → grüner Badge, `processing` → amber, `failed` → rot. Shadcn `<Badge>` Komponente.
- **D-11:** **Nicht-ready-State** — Seite zeigt immer alle verfügbaren Metadaten. Thumbnails zeigen Skeleton wenn `thumbnail_count = 0`. Download-Button ist disabled mit Tooltip/Subtitle "Datei wird noch verarbeitet".

### Neue API-Endpoints
- **D-12:** **`GET /api/parts/[id]`** — Neuer Endpoint (Metadaten). Der bestehende `route.ts` hat nur PATCH/DELETE; GET wird hinzugefügt. Gibt: `id, name, part_number, project, status, thumbnail_count, created_at` zurück.
- **D-13:** **`GET /api/parts/[id]/thumbnails`** — Neuer Endpoint (alle Views). Gibt ein Array von Presigned URLs zurück: `{ urls: string[] }` mit bis zu `thumbnail_count` Einträgen (view_0.png … view_N.png). 60-Sekunden-Ablaufzeit, analog zur bestehenden `/thumbnail`-Route.
- **D-14:** **`GET /api/parts/[id]/download`** — Neuer Endpoint (STEP-Download). Gibt `{ url: string, filename: string }` zurück — Presigned URL mit `response-content-disposition`-Header für direkten Browser-Download.

### Claude's Discretion
- Genaue Tailwind-Klassen für Thumbnail-Leiste (overflow-x-auto, gap, Miniatur-Größe ~64px). Claude entscheidet.
- Ob ein `usePartDetail`-Custom-Hook die API-Anfragen kapselt oder inline in der Seite passiert. Claude entscheidet.
- Formatierung des Upload-Datums: `de-DE` Locale oder ISO-String. Claude entscheidet.
- Breite der Metadaten-Tabelle: ob `<dl>` (description list) oder `<table>`. Claude entscheidet.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Projektkontext & Anforderungen
- `.planning/PROJECT.md` — Core Value, Zielgruppe (Ingenieure), Constraints
- `.planning/REQUIREMENTS.md` — DETAIL-01 (Metadaten-Ansicht), DETAIL-02 (STEP-Download)
- `.planning/ROADMAP.md` — Phase 9 Goal + Success Criteria (3 Punkte)

### Bestehende API-Routes (zu erweitern / als Muster)
- `src/app/api/parts/[id]/route.ts` — PATCH/DELETE-Handlers; GET wird hier hinzugefügt
- `src/app/api/parts/[id]/thumbnail/route.ts` — Presigned-URL-Pattern für S3; direkt übernehmen für `/thumbnails` und `/download`
- `src/app/api/parts/route.ts` — GET /api/parts — zeigt welche Felder die DB zurückgibt

### Phase 8 — Einstiegspunkt (direkte Abhängigkeit)
- `src/app/search/SearchResultCard.tsx` — Link href="/parts/[id]" — das ist die Quelle des Navigationsflows
- `.planning/phases/08-results-ui/08-CONTEXT.md` — D-03 (Karte ist anklickbar Link zu /parts/[id])

### Phase 5 — Admin Katalog (Pattern-Referenz)
- `src/app/admin/CatalogTable.tsx` — zeigt Status-Badge-Pattern, Thumbnail-Loading, Metadaten-Darstellung
- `src/app/api/parts/[id]/archive/route.ts` — zeigt wie ein separater Sub-Route neben PATCH/DELETE aussieht

### Verfügbare shadcn/ui-Komponenten
- `src/components/ui/badge.tsx` — Status-Badge (D-10)
- `src/components/ui/card.tsx` — optionaler Container
- `src/components/ui/skeleton.tsx` — Thumbnail-Skeleton-Placeholder (D-04)
- `src/components/ui/button.tsx` — Download-Button (D-07)

### S3 & Datenbankstruktur
- `src/lib/s3.ts` — S3-Client, BUCKET_STEPS, BUCKET_THUMBNAILS Konstanten
- `src/lib/db.ts` — Datenbankzugriff (Neon/postgres)
- STATE.md (Accumulated Context) — Pfadkonvention: `{id}/view_{i}.png` für Thumbnails, `{id}/original.step` für STEP-Dateien

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/app/api/parts/[id]/thumbnail/route.ts` — vollständiges Muster für Presigned URL (HeadObject + GetSignedUrl + UUID-Validierung + Status-Check). Direkt für `/thumbnails` und `/download` übernehmen.
- `src/components/ui/skeleton.tsx` — bereits installiert, für Thumbnail-Placeholder
- `src/components/ui/badge.tsx` — bereits installiert, Status-Badge
- `src/app/admin/CatalogTable.tsx` — zeigt Lazy-Thumbnail-Loading via useEffect + img src

### Established Patterns
- **Params als Promise**: Next.js 16: `{ params }: { params: Promise<{ id: string }> }` — `const { id } = await params`. In allen bestehenden [id]-Routes konsequent verwendet.
- **UUID-Validierung vor S3**: Zod `z.string().uuid()` als erste Operation — Pitfall T-04-08 (Path-Traversal). Bereits in thumbnail/route.ts und [id]/route.ts.
- **S3-Pfadkonvention**: Thumbnails: `{id}/view_{i}.png` (i = 0..thumbnail_count-1). STEP: `{id}/original.step`.
- **`"use client"`-Direktive**: Alle Seiten mit useState/useEffect/hooks benötigen sie. Server Components für statische Teile bevorzugen.

### Integration Points
- `/parts/[id]` Page → `GET /api/parts/[id]` (neue GET-Route) + `GET /api/parts/[id]/thumbnails` (neue Route)
- Download-Button → `GET /api/parts/[id]/download` (neue Route) → Presigned S3-URL → Browser
- `SearchResultCard.tsx` → `<Link href="/parts/${id}">` ist bereits implementiert (Phase 8)

</code_context>

<specifics>
## Specific Ideas

- Layout-Mockup (vom Nutzer bestätigt):
  ```
  [← Zurück zur Suche]

  [ Hauptbild 320×320 ]
  [v0][v1][v2][v3][v4][v5] →

  Flansch M12          (H1)
  Teilenummer: FL-042
  Projekt: Getriebe
  Status: [ready ●]
  Hochgeladen: 09.05.2026

  [ STEP herunterladen ]
  ```

</specifics>

<deferred>
## Deferred Ideas

Keine — Diskussion blieb vollständig im Phase-9-Scope.

</deferred>

---

*Phase: 9-Part Detail*
*Context gathered: 2026-05-09*
