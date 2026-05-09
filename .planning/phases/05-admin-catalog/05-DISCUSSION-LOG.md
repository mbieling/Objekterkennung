# Phase 5: Admin Catalog - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 5-Admin Catalog
**Areas discussed:** Listenlayout, Bearbeiten-UI, Filterung & Status, Archivieren vs. Löschen

---

## Listenlayout

| Option | Description | Selected |
|--------|-------------|----------|
| Tabelle mit Mini-Thumbnail | Shadcn Table: 48×48px Thumbnail + Name + Teilenr. + Projekt + Status + Datum + Aktionen | ✓ |
| Kachel-Grid | Cards mit 192×192px Thumbnail, weniger Teile auf einen Blick | |

**User's choice:** Tabelle mit Mini-Thumbnail

---

| Option | Description | Selected |
|--------|-------------|----------|
| Dropdown-Menü | DropdownMenu: Bearbeiten / Archivieren / Löschen / Retry | ✓ |
| Direkte Buttons | Icon-Buttons inline in der Zeile | |
| Zeile anklicken = Bearbeiten | Klick öffnet Edit, Hover-Buttons für Aktionen | |

**User's choice:** Dropdown-Menü

---

| Option | Description | Selected |
|--------|-------------|----------|
| 20 pro Seite, alle Felder | Thumbnail, Name, Teilenr., Projekt, Status, Datum, Aktionen | ✓ |
| 20 pro Seite, kompakt | Ohne Datum und Projekt | |
| 50 pro Seite, kompakt | Mehr Zeilen, gleiche Spalten | |

**User's choice:** 20 pro Seite, alle Felder

---

## Bearbeiten-UI

| Option | Description | Selected |
|--------|-------------|----------|
| Sheet (Seitenleiste) | Schiebt sich von rechts, Liste bleibt sichtbar | ✓ |
| Dialog (Modal) | Zentriert, blockiert Hintergrund | |

**User's choice:** Sheet

---

| Option | Description | Selected |
|--------|-------------|----------|
| Thumbnail + alle Felder | Thumbnail oben, darunter Name/Teilenr./Projekt/Status/Erstellt-am | ✓ |
| Nur Formularfelder | Ohne Thumbnail | |
| Thumbnail + Felder + Aktionen | Bearbeiten + Archivieren/Löschen/Retry im Sheet | |

**User's choice:** Thumbnail + alle Felder

---

| Option | Description | Selected |
|--------|-------------|----------|
| Sheet bleibt offen, Zeile live aktualisieren | State-Sync, kein Sheet-Close nach Speichern | ✓ |
| Sheet schließt, Tabelle lädt neu | Einfacher, zuverlässiger | |

**User's choice:** Sheet bleibt offen, Zeile aktualisiert sich live

---

## Filterung & Status

| Option | Description | Selected |
|--------|-------------|----------|
| Tabs über der Tabelle | Alle / Bereit / Ausstehend / Fehler / Archiviert mit Zahl-Badge | ✓ |
| Filter-Dropdown | Select-Dropdown, kompakter | |

**User's choice:** Tabs

---

| Option | Description | Selected |
|--------|-------------|----------|
| Tab "Alle" + Freitext-Suche | Standard: Alle; Suchfeld filtert Name/Teilenummer | ✓ |
| Tab "Alle", keine Suche | Nur Tabs, kein Suchfeld | |
| Tab "Fehler" zuerst | Priorisiert fehlerhafte Teile | |

**User's choice:** Tab "Alle" + Freitext-Suche

---

## Archivieren vs. Löschen

| Option | Description | Selected |
|--------|-------------|----------|
| Archivieren = Soft-Delete, Löschen = Hard-Delete | Archivieren: status='archived'; Löschen: DB + S3 entfernt | ✓ |
| Nur Archivieren (kein echtes Löschen) | Hard-Delete auf später verschieben | |

**User's choice:** Soft-Delete + Hard-Delete

---

| Option | Description | Selected |
|--------|-------------|----------|
| Bestätigungs-Dialog vor Löschen | AlertDialog mit Warnung | ✓ |
| Sofort löschen ohne Bestätigung | Direktes Hard-Delete | |

**User's choice:** Bestätigungs-Dialog

---

| Option | Description | Selected |
|--------|-------------|----------|
| Status zurück auf pending, Worker neu einreihen | Direkt ohne Dialog, nur bei failed sichtbar | ✓ |
| Erst bestätigen, dann Retry | Confirm-Dialog vor Retry | |

**User's choice:** Direkter Retry ohne Dialog

---

## Claude's Discretion

- URL-Struktur: `/admin` oder `/catalog`
- API-Routen-Prefix: `/api/admin/parts` vs. `/api/parts`
- Debounce-Timing Suchfeld
- Thumbnail-Placeholder wenn status != 'ready'
- Paginierung: URL-Query-Parameter oder React-State

## Deferred Ideas

- Queue-Übersicht (ADMIN-V2-01)
- Systemweite Konfiguration (ADMIN-V2-02)
- Server-seitige Suche für 1000+ Teile → Phase 10
- Bulk-Aktionen → Phase 10
