# Phase 8: Results UI - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 8-Results UI
**Areas discussed:** Ergebnis-Grid, Match-%-Darstellung, Threshold & Limit Controls, Leerzustand & Fehlerfall

---

## Ergebnis-Grid

| Option | Description | Selected |
|--------|-------------|----------|
| 1 Spalte | Vollbreite-Karten, gut lesbar auf Mobile, konsistent mit /upload und /admin | ✓ |
| 2 Spalten | Kompakteres Grid, Thumbnail wird kleiner | |

**User's choice:** 1 Spalte

---

| Option | Description | Selected |
|--------|-------------|----------|
| Thumbnail + Name + Match-% | Minimal, schnell zu scannen | ✓ |
| Thumbnail + Name + Part-Nr. + Match-% | Part-Nummer oft entscheidend | |
| Thumbnail + Name + Part-Nr. + Projekt + Match-% | Alle Metadaten auf der Karte | |

**User's choice:** Thumbnail + Name + Match-%

---

| Option | Description | Selected |
|--------|-------------|----------|
| Ja, Link auf die Karte | Navigiert zu /parts/[id] (Phase 9) | ✓ |
| Nein, nur Anzeige | Karten ohne Navigation | |

**User's choice:** Ja, Link auf die Karte

---

## Match-%-Darstellung

| Option | Description | Selected |
|--------|-------------|----------|
| Farbige Badge + Zahl | Shadcn Badge, kompakt, keine zusätzliche Höhe | ✓ |
| Progress-Bar + Zahl | Visuell auffälliger, mehr Platz | |
| Beides: Badge + Bar | Maximal visuell | |

**User's choice:** Farbige Badge + Zahl

---

| Option | Description | Selected |
|--------|-------------|----------|
| ≥80% grün, 60-79% gelb, <60% rot | Passend zu DINOv2-Realität | ✓ |
| ≥70% grün, 50-69% gelb, <50% rot | Konservativere Schwellen | |

**User's choice:** ≥80% grün, 60-79% gelb, <60% rot

---

## Threshold & Limit Controls

| Option | Description | Selected |
|--------|-------------|----------|
| Slider | Shadcn Slider (muss installiert werden), intuitiv auf Mobile | ✓ |
| Number-Input | Input vorhanden, präziser aber weniger intuitiv | |

**User's choice:** Slider

---

| Option | Description | Selected |
|--------|-------------|----------|
| Client-seitig filtern | Einmalige API-Anfrage, lokale Filterung | ✓ |
| Neue API-Anfrage | Genauere Serverresultate, aber langsam | |

**User's choice:** Client-seitig filtern (API mit threshold=0, limit=50; Slider filtert lokal)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Select-Dropdown (10/20/50) | Shadcn Select vorhanden, einfach und klar | ✓ |
| Slider parallel | Konsistentes UI, aber weniger intuitiv für Result-Count | |
| Du entscheidest | Claude wählt | |

**User's choice:** Select-Dropdown (10 / 20 / 50)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Direkt über dem Ergebnis-Grid | Sichtbar ohne Scrollen | ✓ |
| Collapsible 'Suchoptionen' | Standardmäßig eingeklappt | |

**User's choice:** Direkt über dem Ergebnis-Grid

---

## Leerzustand & Fehlerfall

| Option | Description | Selected |
|--------|-------------|----------|
| Nachricht + Slider-Hinweis | "Keine Treffer. Versuche den Schwellwert zu verringern." | ✓ |
| Nur Nachricht | Einfach und klar | |
| Leeres Grid-Layout | Grid bleibt sichtbar, aber leer | |

**User's choice:** Nachricht + Slider-Hinweis

---

| Option | Description | Selected |
|--------|-------------|----------|
| Ergebnisse zeigen bis neue Suche läuft | Kein abruptes Verschwinden | ✓ |
| Ergebnisse sofort leeren | Sauberer Zustandswechsel | |

**User's choice:** Ergebnisse zeigen bis neue Suche abgeschlossen

---

## Claude's Discretion

- Thumbnail-Skeleton-Placeholder: ob Skeleton beim Laden oder direktes img mit onError-Fallback
- Responsive Grid auf Desktop (>768px): 2 Spalten oder weiterhin 1 Spalte in max-w-md
- Tailwind-Klassen für Badge-Farben: über shadcn-Varianten oder direkte className

## Deferred Ideas

- Part-Detail-Seite `/parts/[id]` — kommt in Phase 9
- Erweiterte Metadaten auf der Karte (Part-Nummer, Projekt, Status)
- Vergleichsmodus: mehrere Treffer nebeneinander vergleichen
