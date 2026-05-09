# Phase 5: Admin Catalog - Context

**Gathered:** 2026-05-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Der Admin-Katalog gibt Administratoren eine vollständige Verwaltungsoberfläche für die Teile-Datenbank: Übersichtsliste mit Paginierung und Suche, Metadaten-Bearbeitung per Sheet, Archivieren (Soft-Delete) und Löschen (Hard-Delete inkl. S3), sowie Retry für fehlerhafte Verarbeitungs-Jobs. Keine Suche per Kamera (Phase 7), keine Queue-Übersicht (V2).

</domain>

<decisions>
## Implementation Decisions

### Listenlayout (ADMIN-01)

- **D-01:** **Tabelle mit Mini-Thumbnail** — shadcn/Table mit Spalten: Thumbnail (48×48px) | Name | Teilenummer | Projekt | Status-Badge | Erstellt-am | Aktionen-Dropdown.
- **D-02:** **20 Zeilen pro Seite** — shadcn/Pagination darunter.
- **D-03:** **Aktionen via shadcn/DropdownMenu** pro Zeile — Einträge: Bearbeiten / Archivieren / Löschen / ↺ Neu starten (nur sichtbar wenn status='failed').
- **D-04:** **Freitext-Suchfeld** über der Tabelle — filtert nach Name oder Teilenummer. Einfache client-seitige Filterung für Phase 5 (skaliert auf 1000+ Teile muss in Phase 10 geprüft werden).

### Filterung & Status-Tabs

- **D-05:** **Tabs über der Tabelle** mit shadcn/Tabs: Alle | Bereit | Ausstehend | Fehler | Archiviert. Jeder Tab zeigt Zahl-Badge mit Anzahl der Teile im jeweiligen Status.
- **D-06:** **Standard-Tab: "Alle"** beim ersten Laden.

### Metadaten-Bearbeitung (ADMIN-02)

- **D-07:** **shadcn/Sheet** öffnet von rechts beim Klick auf "Bearbeiten". Liste bleibt im Hintergrund sichtbar (gedimmt).
- **D-08:** **Sheet-Inhalt:** Thumbnail oben (192×192px, Skeleton wenn nicht verfügbar), darunter Formular mit react-hook-form + Zod: Name (required), Teilenummer (optional), Projekt (optional), Status-Select (alle Werte außer 'archived'). Erstellt-am als read-only Feld. Speichern + Abbrechen-Buttons.
- **D-09:** **Nach Speichern: Sheet bleibt offen**, Tabellenzeile aktualisiert sich live (optimistic update oder refetch der betroffenen Zeile).

### Archivieren & Löschen (ADMIN-03)

- **D-10:** **Archivieren = Soft-Delete** — setzt `status='archived'`. Teil bleibt in DB und S3, erscheint nicht in Suchergebnissen (Phase 6 filtert archived). Rückgängig machbar (Status manuell zurücksetzen via Edit-Sheet).
- **D-11:** **Löschen = Hard-Delete** — entfernt DB-Eintrag + STEP-Datei aus S3 (`parts-steps`) + alle Thumbnails aus S3 (`parts-thumbnails`). Nicht rückgängig. Vorher shadcn/AlertDialog zur Bestätigung: *"Dieses Teil und alle zugehörigen Dateien werden permanent gelöscht. Fortfahren?"*

### Retry (ADMIN-04)

- **D-12:** **Retry ohne Bestätigungs-Dialog** — Klick auf "↺ Neu starten" setzt `status='pending'` und ruft denselben `/enqueue`-Endpoint wie Confirm auf. Nur im Aktionen-Dropdown sichtbar wenn `status='failed'`.

### Claude's Discretion

- Genaue URL-Struktur: `/admin` oder `/catalog` — Claude entscheidet basierend auf Konventionen der bestehenden Routes
- API-Routen: `/api/admin/parts` vs. `/api/parts` — Claude entscheidet (konsistent mit Phase 3/4)
- Debounce-Timing für Suchfeld (z.B. 300ms)
- Thumbnail-Fehlerbehandlung im Sheet wenn status != 'ready' (Skeleton, Placeholder-Text)
- Paginierung: URL-Query-Parameter (`?page=2`) oder React-State

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Projektkontext & Anforderungen
- `.planning/PROJECT.md` — Core Value, Out-of-Scope-Liste, Constraints
- `.planning/REQUIREMENTS.md` — ADMIN-01 bis ADMIN-04 (vollständige Anforderungstexte)
- `.planning/ROADMAP.md` — Phase 5 Success Criteria (4 Punkte), UI hint: yes

### Phase 3 — Bestehende API-Endpunkte (Muster für neue Admin-Routes)
- `src/app/api/upload/init/route.ts` — Muster für DB-Zugriff via `db` Tagged Templates + Zod-Validierung
- `src/app/api/upload/confirm/route.ts` — Muster für Worker-Enqueue (ADMIN-04 Retry nutzt denselben /enqueue-Call)

### Phase 4 — Bestehende UI-Komponenten und Hooks
- `src/app/upload/UploadForm.tsx` — Muster für react-hook-form + Zod + shadcn/Form
- `src/hooks/use-part-status.ts` — Polling-Hook (ggf. in Admin-Tabelle für live Status-Updates wiederverwendbar)
- `src/app/api/parts/[id]/thumbnail/route.ts` — Presigned-URL-Endpunkt (Sheet-Thumbnail)
- `src/app/api/parts/[id]/status/route.ts` — Status-Endpunkt (Tabellenzeilen-Refresh)

### Infrastruktur
- `src/lib/db.ts` — Neon-Client (`db` Tagged-Template-Funktion)
- `src/lib/s3.ts` — S3-Client mit DECOMPOSEDS3_ENDPOINT-Support (Hard-Delete braucht DeleteObjectCommand)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ui/table.tsx` — Haupt-Listendarstellung (D-01)
- `src/components/ui/sheet.tsx` — Edit-Seitenleiste (D-07)
- `src/components/ui/tabs.tsx` — Status-Filter-Tabs (D-05)
- `src/components/ui/pagination.tsx` — Paginierung (D-02)
- `src/components/ui/dropdown-menu.tsx` — Aktionen pro Zeile (D-03)
- `src/components/ui/alert-dialog.tsx` — Löschen-Bestätigung (D-11)
- `src/components/ui/badge.tsx` — Status-Badges (Phase 4 Muster wiederverwendbar)
- `src/components/ui/skeleton.tsx` — Thumbnail-Loading-State im Sheet
- `src/hooks/use-part-status.ts` — Polling-Logik ggf. für Tabellenzeilen-Refresh nach Retry
- `src/app/api/parts/[id]/thumbnail/route.ts` — Presigned URL für Thumbnails im Sheet

### Established Patterns
- Tagged-Template SQL via `db` aus `@/lib/db` (kein raw SQL, kein ORM)
- Zod-Validierung für alle API-Route-Inputs als erste Operation
- UUID-Validierung (`z.string().uuid()`) vor jedem DB-Zugriff
- `forcePathStyle: true` + `DECOMPOSEDS3_ENDPOINT` für S3-Operationen (Hard-Delete braucht `DeleteObjectsCommand`)
- react-hook-form + Zod-Resolver für alle Formulare
- shadcn/ui-only — keine Custom-Primitiven

### Integration Points
- Hard-Delete (D-11): braucht `DeleteObjectCommand` für STEP-Datei (`{part_id}/original.step`) + alle Thumbnails (`{part_id}/view_0.png` bis `view_7.png`) — analog zu `src/lib/s3.ts`-Muster
- Retry (D-12): ruft denselben Worker-Enqueue auf wie `src/app/api/upload/confirm/route.ts`
- `status='archived'` in DB: Phase 6 (Search Pipeline) muss `WHERE status = 'ready'` filtern — Constraint für Planner zu dokumentieren

</code_context>

<specifics>
## Specific Ideas

- Aktionen-Dropdown zeigt "↺ Neu starten" **nur** wenn `status='failed'` — nicht für andere Status
- AlertDialog-Text für Hard-Delete: *"Dieses Teil und alle zugehörigen Dateien werden permanent gelöscht. Fortfahren?"*
- Archivierte Teile sollen **weiterhin im Katalog sichtbar sein** (Tab "Archiviert") — nur aus Suche ausgeschlossen
- Thumbnails im Sheet für Teile mit status != 'ready': Skeleton + Text "Thumbnail wird verarbeitet…"

</specifics>

<deferred>
## Deferred Ideas

- **Queue-Übersicht** (ADMIN-V2-01) — Laufende Verarbeitungs-Jobs einsehen → V2 (REQUIREMENTS.md bereits als V2 markiert)
- **Systemweite Konfiguration** (ADMIN-V2-02) — Standard-Schwellwert + Trefferanzahl konfigurieren → V2
- **Server-seitige Suche** — Für Phase 5 reicht client-seitige Filterung; bei 1000+ Teilen muss in Phase 10 geprüft werden
- **Bulk-Aktionen** — Mehrere Teile gleichzeitig archivieren/löschen → Phase 10 (Hardening)

</deferred>

---

*Phase: 5-Admin Catalog*
*Context gathered: 2026-05-09*
