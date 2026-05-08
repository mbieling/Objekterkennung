# Phase 4: Ingestion UI — Discussion Log

**Date:** 2026-05-08
**Duration:** ~15 minutes
**Areas discussed:** 4 of 4

---

## Area 1: Seitenstruktur & Routing

**Question:** Wo soll das Upload-Formular erscheinen?
**Options presented:** Eigene Seite /upload / Direkt auf der Startseite
**Decision:** Eigene Seite /upload (src/app/upload/page.tsx)
**Notes:** 2-Spalten-Layout gewünscht: Formular links, Status-Tracker rechts

**Question:** Startseite — Link oder Redirect?
**Options presented:** Einfacher Link zu /upload / Redirect / → /upload
**Decision:** Einfacher Link — Startseite bleibt minimal für späteres Dashboard

---

## Area 2: Echtzeit-Status-Mechanismus

**Question:** Polling oder SSE?
**Options presented:** Polling mit variablem Intervall / Server-Sent Events
**Decision:** Polling 2s (erste 30s) → 5s. API: GET /api/parts/[id]/status
**Notes:** SSE abgelehnt wegen Vercel Serverless Timeout-Limitation

**Question:** Timeout-Verhalten?
**Options presented:** 5 Minuten dann Warnung / Kein Timeout
**Decision:** 5 Minuten Timeout mit Warnmeldung, Status in DB bleibt erhalten

---

## Area 3: Thumbnail-Darstellung

**Question:** Wie viele Views anzeigen?
**Options presented:** 1 Thumbnail (view_0) / 3 Thumbnails / Alle 6-8 Views
**Decision:** Nur view_0 (Frontansicht) — Galerie kommt in Phase 5

**Question:** S3-Zugriff für Thumbnail?
**Options presented:** Presigned URL vom Server / Bucket öffentlich lesbar
**Decision:** Presigned URL via GET /api/parts/[id]/thumbnail (60s)
**Notes:** Kein öffentlicher Bucket — konsistent mit Phase-1-Sicherheitsentscheidungen

---

## Area 4: Formularverhalten nach Upload

**Question:** Verhalten nach erfolgreichem Submit?
**Options presented:** Formular einfrieren + Status-Tracker / Sofort Reset + Toast
**Decision:** Formular einfrieren, Status-Tracker erscheint rechts, Reset-Button nach ready

**Question:** Duplikat-Fehleranzeige?
**Options presented:** Inline-Fehler mit Teil-ID / Toast
**Decision:** Inline-Alert unter Datei-Input mit Teil-ID

---

## Claude's Discretion Items

- shadcn-Komponenten-Kombination für Status-Tracker
- Custom Hook vs. inline State für Polling-Logik
- Netzwerkfehler-Darstellung (fetch-Fehler bei init/confirm)
- view_0 vs. dynamische Erkennung des ersten verfügbaren Views

---

## Deferred Ideas

- Volle Thumbnail-Galerie → Phase 5 (Admin-Katalog)
- Retry-Button für failed → Phase 5 (ADMIN-04)
