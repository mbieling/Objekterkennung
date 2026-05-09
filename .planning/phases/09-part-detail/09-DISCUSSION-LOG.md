# Phase 9: Part Detail - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 9-Part Detail
**Areas discussed:** Thumbnail-Galerie, STEP-Download, Navigation & Layout

---

## Thumbnail-Galerie

| Option | Description | Selected |
|--------|-------------|----------|
| Hauptbild + Thumbnail-Leiste | Großes Hauptbild, scrollbare Miniatur-Leiste, Klick wechselt Hauptbild | ✓ |
| Gleichmäßiges Grid (2–3 Spalten) | Alle Views gleich groß, kein aktives Bild | |
| Einzelbild + Prev/Next | Immer ein View, Pfeile zum Blättern | |

**User's choice:** Hauptbild + Thumbnail-Leiste
**Notes:** Klassisches Produktbild-Pattern, gut auf Mobile.

| Option | Description | Selected |
|--------|-------------|----------|
| Quadratisch, fixe Größe | 320×320 Mobile / 480×480 Desktop | ✓ |
| Vollbreite mit Aspect Ratio | Container-Breite, aspect-ratio 1:1 | |

**User's choice:** Quadratisch, fixe Größe
**Notes:** Konsistent mit den 512×512 gerenderten Views.

| Option | Description | Selected |
|--------|-------------|----------|
| Alle auf einmal laden | Alle Presigned URLs in einer Anfrage | ✓ |
| Lazy — nur sichtbare Views | Nur aktiver View + sichtbare Thumbnails | |

**User's choice:** Alle auf einmal laden
**Notes:** STEP-Thumbnails sind klein (< 100 KB), Lazy-Loading nicht nötig.

---

## STEP-Download

| Option | Description | Selected |
|--------|-------------|----------|
| Presigned URL — Browser-Redirect | Server erstellt Presigned URL, Browser lädt direkt von S3 | ✓ |
| Server-Proxy — Stream durch Next.js | Next.js streamt Datei — riskant bei 100-MB-Dateien (Vercel Timeout) | |

**User's choice:** Presigned URL — Browser-Redirect
**Notes:** Konsistent mit Thumbnail-Pattern. Ideal für große Dateien.

| Option | Description | Selected |
|--------|-------------|----------|
| {name}.step | Lesbar, aus Metadaten, sanitized | ✓ |
| {part_number}.step | Technischer, Fallback auf name | |
| original.step | Immer gleicher Name (S3-Key) | |

**User's choice:** {name}.step
**Notes:** Benutzerfreundlich, direkt erkennbar.

---

## Navigation & Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Ja — "← Zurück zur Suche"-Link | router.back() oder href='/search', wichtig für Mobile | ✓ |
| Nein — nur Browser-Back | Kein expliziter Link | |

**User's choice:** Ja — expliziter Header-Link
**Notes:** Mobile-UX-Anforderung, konsistent mit App-Navigation.

| Option | Description | Selected |
|--------|-------------|----------|
| Thumbnail oben, Metadaten darunter | Mobile-first gestapeltes Layout | ✓ |
| Side-by-Side auf Desktop | 2-Spalten-Layout auf Desktop | |

**User's choice:** Thumbnail oben, Metadaten darunter
**Notes:** Vom Nutzer bestätigtes Mockup: Back-Link → Hauptbild → Thumbnail-Leiste → H1 → Metadaten → Download-Button.

| Option | Description | Selected |
|--------|-------------|----------|
| Metadaten anzeigen, Download disabled | Seite zeigt immer Daten, Button disabled mit Hinweis | ✓ |
| Separate "Noch nicht bereit"-Meldung | Info-Seite wenn status ≠ ready | |

**User's choice:** Metadaten anzeigen, Download-Button deaktiviert
**Notes:** Besser als tote Seite — Nutzer sieht Name/Projekt auch während Verarbeitung.

---

## Claude's Discretion

- Tailwind-Klassen für Thumbnail-Leiste (overflow-x-auto, gap, Miniatur-Größe ~64px)
- `usePartDetail`-Hook vs. inline API-Calls in der Seite
- Datumsformatierung: de-DE Locale oder ISO-String
- Metadaten-Tabelle: `<dl>` oder `<table>`

## Deferred Ideas

Keine.
