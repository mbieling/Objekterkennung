# Phase 4: Ingestion UI - Context

**Gathered:** 2026-05-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Die Ingestion-UI ermöglicht es Ingenieuren, STEP-Dateien mit Metadaten im Browser hochzuladen und den Verarbeitungsstatus in Echtzeit zu verfolgen — vom Datei-Pick bis zum fertigen Thumbnail. Die neue Seite `/upload` verbindet die bestehenden API-Endpunkte (`/api/upload/init`, `/api/upload/confirm`) mit einem vollständigen UI-Flow. Kein Admin-Katalog (kommt in Phase 5), keine Suche.

</domain>

<decisions>
## Implementation Decisions

### Seitenstruktur & Routing

- **D-01:** **Eigene Seite `/upload`** — `src/app/upload/page.tsx`. Saubere URL, Ingenieure können direkt bookmarken. Startseite (`/`) wird später zum Dashboard (Phase 5+).
- **D-02:** **Startseite bleibt minimal** — ein einzelner Button/Link "Teil hochladen" zeigt auf `/upload`. Kein Redirect `/ → /upload`.
- **D-03:** **2-Spalten-Layout auf `/upload`** — Formular links, Status-Tracker rechts. Status-Tracker ist initial ausgeblendet und erscheint nach dem ersten Submit.

### Echtzeit-Status-Mechanismus

- **D-04:** **Polling mit variablem Intervall** — `setInterval` alle 2s in den ersten 30s, danach alle 5s. Stop bei `status = 'ready'` oder `status = 'failed'`.
- **D-05:** **Neuer API-Endpunkt:** `GET /api/parts/[id]/status` — liest `parts.status` aus Neon, gibt `{status, thumbnail_count}` zurück.
- **D-06:** **Timeout nach 5 Minuten** — Polling stoppt, Warn-Meldung: *"Die Verarbeitung dauert länger als erwartet. Seite neu laden, um den Status zu prüfen."* Status in der DB bleibt unverändert.

### Thumbnail-Darstellung

- **D-07:** **Nur 1 Thumbnail** — `view_0.png` (Frontansicht). Volle Galerie kommt im Admin-Katalog (Phase 5).
- **D-08:** **Presigned URL via Server** — `GET /api/parts/[id]/thumbnail` gibt eine temporäre S3-URL zurück (60s Laufzeit). Kein öffentlicher Bucket nötig.

### Formularverhalten

- **D-09:** **Nach Submit: Formular einfrieren** — Felder werden `disabled`, Submit-Button deaktiviert. Status-Tracker erscheint rechts mit Badge `pending → processing → ready`.
- **D-10:** **Nach `ready`: Reset-Button erscheint** — "Neuer Upload" setzt Formular zurück, Status-Tracker wird ausgeblendet.
- **D-11:** **Duplikat-Fehler: Inline-Alert** — roter Alert-Banner unter dem Datei-Input: *"Diese Datei existiert bereits — Teil-ID: xxxx"*. Kein Toast. Formular bleibt editierbar.

### Claude's Discretion

- Genaue shadcn-Komponenten-Kombination für den Status-Tracker (Badge + Progress + Skeleton empfohlen)
- Pollinglogik als Custom Hook (`usePartStatus`) oder inline im Komponenten-State
- Exakte Fehler-Response-Darstellung für Netzwerkfehler (Fetch-Fehler bei init/confirm)
- `view_0.png` vs. automatische Erkennung des ersten verfügbaren Views

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Projektkontext & Anforderungen
- `.planning/PROJECT.md` — Core Value, Out-of-Scope-Liste, Constraints
- `.planning/REQUIREMENTS.md` — INGEST-01 (Upload-Formular), INGEST-02 (Status-Anzeige)
- `.planning/ROADMAP.md` — Phase 4 Success Criteria (4 Punkte), UI hint: yes

### Bestehende API-Endpunkte (Phase 3)
- `src/app/api/upload/init/route.ts` — POST: nimmt Metadaten + SHA-256, gibt `{part_id, presigned_url}` zurück. HTTP 409 bei Duplikat mit `{existing_part_id}`.
- `src/app/api/upload/confirm/route.ts` — POST: nimmt `{part_id}`, löst Celery-Job aus, antwortet HTTP 202.

### Datenbankschema
- `supabase/migrations/001_parts_schema.sql` — `parts`-Tabelle: Status-Enum (`pending`, `processing`, `ready`, `failed`), SHA-256-Feld, Thumbnail-Pfadkonvention

### Phase-3-Kontext (Upload-Flow-Entscheidungen)
- `.planning/phases/03-ingestion-api-queue/03-CONTEXT.md` — D-01 bis D-12: 2-Schritt-Flow, SHA-256-Timing im Browser, Metadatenfelder

### Architektur & Patterns
- `.planning/codebase/ARCHITECTURE.md` — Next.js App Router, `"use client"` nur in Client-Komponenten
- `.planning/codebase/CONVENTIONS.md` — Import-Pfade (`@/*`), Dateistruktur

### S3-Client
- `src/lib/s3.ts` — `s3`, `BUCKET_STEPS`, `BUCKET_THUMBNAILS` — Bucket-Namen und Presigned-URL-Methoden

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/components/ui/form.tsx` + `input.tsx` + `label.tsx` — react-hook-form Integration, direkt für Upload-Formular verwendbar
- `src/components/ui/button.tsx` — Button-Komponente mit `disabled`-State
- `src/components/ui/badge.tsx` — Status-Badge für `pending / processing / ready / failed`
- `src/components/ui/progress.tsx` — optionaler Fortschrittsbalken während Upload-Phase
- `src/components/ui/skeleton.tsx` — Platzhalter während Thumbnail-Laden
- `src/components/ui/alert.tsx` — Inline-Fehleranzeige (Duplikat, Netzwerkfehler)
- `src/components/ui/card.tsx` — Container für Formular und Status-Tracker
- `src/hooks/use-toast.ts` — Toast-System (für Erfolgs-Toasts nach Ready)
- `src/lib/s3.ts` — S3-Client mit Presigned-URL-Methoden
- `src/lib/db.ts` — Neon SQL-Client (für neuen Status-API-Endpunkt)

### Established Patterns
- **Client-Komponenten:** `"use client"` nur wenn nötig (State, Events); API-Routes bleiben server-only
- **Env-Vars:** kein `NEXT_PUBLIC_` für Secrets (S3-Keys, DB-URL bleiben server-only)
- **SHA-256 im Browser:** `crypto.subtle.digest('SHA-256', ...)` — nativ, kein npm-Paket
- **Zod-Validierung:** für Formular-Input (Name required, part_number/project optional)

### Integration Points
- Browser → `POST /api/upload/init` (Metadaten + SHA-256) → `{part_id, presigned_url}`
- Browser → `PUT {presigned_url}` (direkt zu S3, kein Next.js-Proxy)
- Browser → `POST /api/upload/confirm` ({part_id}) → HTTP 202
- Browser → `GET /api/parts/[id]/status` (alle 2s/5s) → `{status}`
- Browser → `GET /api/parts/[id]/thumbnail` (einmalig bei ready) → Presigned S3-URL

</code_context>

<specifics>
## Specific Ideas

- **2-Spalten-Layout explizit gewünscht:** Formular links, Status-Tracker rechts — kein Tab-Switch, kein Modal
- **Formular einfrieren (nicht verstecken):** Nach Submit bleiben die ausgefüllten Metadaten sichtbar, der Ingenieur sieht was er hochgeladen hat
- **"Neuer Upload"-Button** erscheint erst nach `ready` (nicht vorher) — verhindert versehentlichen Abbruch
- **Inline-Fehler mit Teil-ID** bei Duplikat — Ingenieur kann die ID direkt notieren/weiterleiten

</specifics>

<deferred>
## Deferred Ideas

- **Volle Thumbnail-Galerie (alle 6–8 Views)** — explizit auf Phase 5 (Admin-Katalog) verschoben
- **Admin-Dashboard / Katalog** — Phase 5-Scope, nicht Phase 4
- **Retry-Button für failed-Status** — Phase 5 (ADMIN-04)

</deferred>

---

*Phase: 4-Ingestion UI*
*Context gathered: 2026-05-08*
