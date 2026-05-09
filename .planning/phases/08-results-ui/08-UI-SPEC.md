---
phase: 8
slug: results-ui
status: draft
shadcn_initialized: true
preset: style=default, baseColor=slate, cssVariables=true
created: 2026-05-09
---

# Phase 8 — UI Design Contract: Results UI

> Visual and interaction contract für Phase 8 (Results UI). Generiert von gsd-ui-researcher, verifiziert von gsd-ui-checker.
>
> Diese Phase ersetzt den `<pre>`-JSON-Placeholder in `CameraCapture.tsx` (result-State) durch ein vollständiges Ergebnis-Grid mit Threshold-Slider, Limit-Select und klickbaren Trefferkarten.

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn/ui |
| Preset | style=default, baseColor=slate, cssVariables=true (aus components.json) |
| Component library | Radix UI (via shadcn) |
| Icon library | lucide-react (bereits in Projekt) |
| Font | System-Font-Stack (Next.js default, kein expliziter Google Font) |

### Zu installierende Komponenten

| Komponente | Status | Befehl |
|-----------|--------|--------|
| badge | installiert | — |
| card | installiert | — |
| skeleton | installiert | — |
| select | installiert | — |
| button | installiert | — |
| alert | installiert | — |
| slider | **fehlt** | `npx shadcn@latest add slider --yes` |

---

## Spacing Scale

Deklarierte Werte (Vielfache von 4 — konsistent mit CameraCapture.tsx):

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Icon-Gaps innerhalb Buttons (`mr-2`), Badge-Innenabstand |
| sm | 8px | Kompakter Elementabstand, Controls-Zeile intern |
| md | 16px | Standard-Elementabstand — `gap-4` (dominantes Gap-Pattern) |
| lg | 24px | Section-Padding, `py-6` in CardContent |
| xl | 32px | Layout-Gaps, `mb-8` unter der Seitenüberschrift |
| 2xl | 48px | — (nicht verwendet in dieser Phase) |
| 3xl | 64px | — (nicht verwendet in dieser Phase) |

Ausnahmen:
- Touch-Target für Karten-Links: mindestens 44px Klickfläche (durch volle Kartenbreite erfüllt)
- Slider-Thumb: Radix-Standard 20px, per Tailwind auf 20px belassen (kein Override nötig)

---

## Layout

### Seitenstruktur (erbt von `/search` page.tsx)

```
<main class="min-h-screen bg-background py-8 px-4">
  <div class="max-w-md mx-auto">
    <h1 class="text-2xl font-semibold mb-8">Bauteil fotografieren</h1>
    <CameraCapture />          ← enthält result-State
  </div>
</main>
```

### Responsive Grid-Entscheidung (Claude's Discretion — D-01)

- **Mobile (< 768px):** 1 Spalte, Vollbreite innerhalb `max-w-md` Container — Quelle: D-01
- **Desktop (≥ 768px):** 1 Spalte bleibt, da der Container auf `max-w-md` (448px) begrenzt ist. Ein 2-Spalten-Grid würde auf 448px zu schmale Karten erzeugen (ca. 200px netto). Entscheidung: 1 Spalte durchgängig — konsistenter mit `/upload`- und `/admin`-Pattern des Projekts.

### Controls-Zeile (D-09)

```
[Ähnlichkeit: ──●────── 50%]  [Ergebnisse: 10 ▼]
```

- `flex flex-row items-center gap-4 flex-wrap` — passt auf 375px ohne Überlauf
- Slider-Sektion: `flex items-center gap-2` mit Label links, Prozentwert rechts
- Select-Sektion: Label + Select nebeneinander, `flex items-center gap-2`
- Kompakte Höhe: kein `py` auf der Zeile selbst — Innenabstand kommt von Slider/Select

### Ergebnis-Grid (D-01, D-02)

- `flex flex-col gap-3` — 12px zwischen Karten (leicht kompakter als Standard-gap-4, da Karten selbst bereits Höhe haben)
- Jede Karte: volle Breite, `<Link href="/parts/[id]">` als Wrapper

---

## Komponenten-Anatomie

### Trefferkarte (SearchResultCard)

```
<Link href="/parts/{id}" className="block">
  <Card className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
    <div className="flex gap-3 p-3">
      <!-- Thumbnail-Bereich: 64×64px quadratisch -->
      <div className="relative w-16 h-16 shrink-0 rounded-md overflow-hidden bg-muted">
        {thumbnailLoaded
          ? <img src="/api/parts/{id}/thumbnail" className="w-full h-full object-cover" />
          : <Skeleton className="w-full h-full" />
        }
      </div>
      <!-- Text-Bereich -->
      <div className="flex flex-col justify-between flex-1 min-w-0 py-0.5">
        <p className="text-sm font-medium leading-tight truncate">{name}</p>
        <!-- Badge rechts unten (D-05) -->
        <div className="flex justify-end">
          <Badge className="{matchBadgeClass}">{matchPercent}%</Badge>
        </div>
      </div>
    </div>
  </Card>
</Link>
```

**Thumbnail-Loading-Strategie (Claude's Discretion):** Skeleton-Komponente beim Laden, `<img>` mit `onError`-Fallback auf ein leeres Muted-Quadrat (kein Bild-Icon). Muster identisch mit CatalogTable.tsx.

### Match-%-Badge Farbklassen (D-04)

Direkte Tailwind-className (kein shadcn-Variant-Override — einfacher und transparent):

| Schwellwert | className |
|-------------|-----------|
| similarity ≥ 0.80 | `bg-green-500 text-white hover:bg-green-500` |
| 0.60 ≤ similarity < 0.80 | `bg-amber-500 text-white hover:bg-amber-500` |
| similarity < 0.60 | `bg-red-500 text-white hover:bg-red-500` |

`hover:bg-*` Override nötig, da shadcn Badge-Default einen Hover-State hat.

Anzeige: `Math.round(similarity * 100)` → "83%"

### Threshold-Slider (D-06)

- shadcn `<Slider>` — Radix Slider Primitive
- `min={0}` `max={1}` `step={0.05}` `value={[displayThreshold]}`
- Anzeige-Default: 0.5 (zeigt Ergebnisse ≥ 50%)
- API-Aufruf immer mit `threshold=0` (alle Treffer holen), Slider filtert lokal
- Prozentwert rechts neben dem Slider: `{Math.round(displayThreshold * 100)}%` — `text-sm font-medium w-10 text-right`
- Label links: `text-sm text-muted-foreground` — "Ähnlichkeit"

### Limit-Select (D-08)

- shadcn `<Select>` mit Optionen: 10 / 20 / 50
- Default: `"10"`
- Wenn Nutzer auf andere Zahl wechselt → neue POST /api/search-Anfrage mit neuem `limit`
- Label links: `text-sm text-muted-foreground` — "Ergebnisse"

### Spinner-Overlay bei neuer Suche (D-11)

Wenn `phase === 'searching'` und bereits Ergebnisse vorhanden:
- Altes Ergebnis-Grid bleibt sichtbar
- `relative`-Wrapper mit `absolute inset-0 bg-background/70 flex items-center justify-center rounded-lg z-10`
- `<Loader2 className="animate-spin h-8 w-8" aria-label="Neue Suche läuft" />`

---

## Typography

Quelle: Bestehende Tailwind-Token aus globals.css (Slate-Basis, CSS-Variablen).

| Role | Size | Weight | Line Height | Tailwind |
|------|------|--------|-------------|---------|
| Body | 14px | 400 (regular) | 1.5 | `text-sm` |
| Label | 14px | 500 (medium) | 1.5 | `text-sm font-medium` |
| Card-Titel (Name) | 14px | 500 (medium) | 1.25 (tight) | `text-sm font-medium leading-tight` |
| Seitenüberschrift | 24px | 600 (semibold) | 1.2 | `text-2xl font-semibold` |

Zwei Gewichte: 400 (regular) + 500 (medium) für kompakte Karten. 600 (semibold) nur für die Seitenüberschrift (erbt von page.tsx — wird nicht neu definiert).

---

## Color

Quelle: CSS-Variablen aus globals.css — Slate-Palette, kein Dark-Mode-Toggle in Phase 8.

| Role | CSS-Variable | Hex (Light) | Usage |
|------|-------------|------------|-------|
| Dominant (60%) | `--background` | #ffffff | Seitenhintergrund, Karten-Hintergrund |
| Secondary (30%) | `--muted` | #f1f5f9 | Thumbnail-Placeholder, Skeleton, leerer Thumbnail-Slot |
| Accent (10%) | `--primary` | #0f172a | Primär-Buttons ("Suchen", "Kamera starten") |
| Destructive | `--destructive` | #ef4444 | Nicht in dieser Phase verwendet |

Accent (primary) reserviert für: primäre Action-Buttons. Slider-Thumb und Select-Focus-Ring erben `--ring` (Slate).

**Semantische Farben außerhalb der 60/30/10-Logik (Pflicht für Match-%):**

| Zustand | Farbe | Tailwind |
|---------|-------|---------|
| Sehr ähnlich (≥ 80%) | Grün | `bg-green-500` |
| Ähnlich (60–79%) | Amber | `bg-amber-500` |
| Niedrig (< 60%) | Rot | `bg-red-500` |

Diese Farben sind ausschließlich für Match-%-Badges reserviert.

---

## Copywriting Contract

| Element | Copy |
|---------|------|
| Primäre CTA (Suche starten) | "Suchen" (Button mit Search-Icon) |
| CTA (neue Suche) | "Neu aufnehmen" (Button mit RotateCcw-Icon) — bereits in Phase 7 |
| Controls-Label Slider | "Ähnlichkeit" |
| Controls-Label Select | "Ergebnisse" |
| Slider-Wert-Anzeige | "{N}%" (z.B. "50%") |
| Leer-Zustand Überschrift | "Keine ähnlichen Teile gefunden." |
| Leer-Zustand Body | "Versuche den Ähnlichkeitsschwellwert zu verringern." |
| Leer-Zustand Hinweis | Optional: Pfeil-Icon + "Schieberegler oben anpassen" |
| Searching-Overlay Text | "Neue Suche läuft..." (aria-label auf Loader2) |
| Thumbnail-Fallback Alt | "{name} Thumbnail" (img alt-Attribut) |
| Karten-Link ARIA | `aria-label="Bauteil {name} anzeigen, Ähnlichkeit {N}%"` |

Destruktive Aktionen: keine in Phase 8.

---

## Interaction Contract

### State-Machine-Erweiterung (CameraCapture.tsx)

Phase 8 erweitert den `result`-State in CameraCapture.tsx. Kein neuer State-Typ nötig — der `result`-State erhält eine vollständige UI statt des `<pre>`-Placeholders.

Neue State-Variablen in CameraCapture.tsx:

| Variable | Typ | Initialwert | Beschreibung |
|---------|-----|------------|-------------|
| `displayThreshold` | `number` | `0.5` | Slider-Wert für lokale Filterung |
| `displayLimit` | `number` | `10` | Limit für API-Anfrage |

### Client-seitige Filterung (D-07)

```
API-Aufruf: threshold=0, limit=Math.max(50, displayLimit)
Angezeigte Ergebnisse: searchResult.results
  .filter(r => r.similarity >= displayThreshold)
  .slice(0, displayLimit)
  .sort(a → b nach similarity DESC)  ← API liefert bereits sortiert
```

Der Limit-Select steuert, wie viele der gefilterten Ergebnisse angezeigt werden. Bei Limit-Wechsel auf 20 oder 50: neue API-Anfrage mit `limit=50` (immer maximal 50 laden, lokal slicen).

### Hover/Focus-States

- Karten: `hover:shadow-md transition-shadow` (100ms ease, Tailwind default)
- Links: `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring` — shadcn-Standard
- Slider: Radix-Standard-Focus-Ring, kein Override
- Select: shadcn-Standard

### Accessibility

- `aria-live="polite"` auf dem Ergebnis-Container für Screen-Reader-Ankündigungen
- Karten-Links mit explizitem `aria-label` (Name + Ähnlichkeit)
- Slider mit `aria-label="Ähnlichkeitsschwellwert"` und `aria-valuetext="{N}%"`
- Leerzustand: `role="status"` auf dem Meldungscontainer

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | badge, card, skeleton, select, button, alert, slider | not required |

Keine Drittanbieter-Registries. Slider ist offizieller shadcn-Block.

---

## Komponenten-Inventar (für Planner)

| Neue Komponente | Datei | Typ |
|----------------|-------|-----|
| SearchResultCard | `src/app/search/SearchResultCard.tsx` | Client Component |
| SearchResults | `src/app/search/SearchResults.tsx` | Client Component |
| (kein neues UI-Primitiv) | — | — |

CameraCapture.tsx wird erweitert (kein neues File für result-State-Rendering nötig — `SearchResults` wird inline importiert).

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending
