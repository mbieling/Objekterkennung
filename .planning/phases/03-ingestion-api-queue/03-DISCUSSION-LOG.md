# Phase 3: Ingestion API + Queue - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-08
**Phase:** 3-ingestion-api-queue
**Areas discussed:** Upload-Strategie, Queue-Infrastruktur, Metadaten-Flow, Worker-Integration-Tiefe

---

## Upload-Strategie

| Option | Beschreibung | Ausgewählt |
|--------|-------------|-----------|
| Presigned S3 URL | API gibt signierten URL zurück, Client lädt direkt zu S3 hoch — 2s-Constraint trivial erfüllbar | ✓ |
| Next.js API Route streamt zu S3 | 100 MB durch Next.js-Server leiten — Vercel-Limits riskant | |
| Du entscheidest | Planner wählt | |

**User's choice:** Presigned S3 URL

| Option | Beschreibung | Ausgewählt |
|--------|-------------|-----------|
| 2-Schritt: URL anfordern, dann hochladen | Init → Presigned URL → S3-Upload → Confirm | ✓ |
| 1-Schritt mit Callback | POST gibt URL zurück, PUT /api/parts/{id}/confirm danach | |

**User's choice:** 2-Schritt (Init + Confirm)

| Option | Beschreibung | Ausgewählt |
|--------|-------------|-----------|
| SHA-256-Check in /api/upload/init | Client berechnet SHA-256 im Browser, API prüft vor URL-Erstellung | |
| SHA-256-Check nach S3-Upload in /confirm | Erst hochladen, dann prüfen | |
| Du entscheidest | Planner wählt sauberste Variante | ✓ |

**User's choice:** Du entscheidest (→ Claude Discretion)

---

## Queue-Infrastruktur

| Option | Beschreibung | Ausgewählt |
|--------|-------------|-----------|
| Vollständig mit Docker Compose | FastAPI + Celery + docker-compose.yml | ✓ |
| Nur Queue-Dispatch, Consumer später | Phase 3 endet nach Enqueue | |
| Simples HTTP statt Celery | Fire-and-forget HTTP-Call | |

**User's choice:** Vollständig mit Docker Compose

| Option | Beschreibung | Ausgewählt |
|--------|-------------|-----------|
| Upstash Redis | Managed Redis-as-a-Service, Vercel-Integration | ✓ |
| Railway Redis | Neben dem Worker auf Railway | |
| Du entscheidest | Planner wählt | |

**User's choice:** Upstash Redis

---

## Metadaten-Flow

| Option | Beschreibung | Ausgewählt |
|--------|-------------|-----------|
| Alle Metadaten in /api/upload/init | SHA-256 + Name + Teilenummer + Projekt in Init-Request | ✓ |
| Erst Datei, dann Metadaten separat | PATCH /api/parts/{id} nach Upload | |

**User's choice:** Alle Metadaten in /api/upload/init

| Option | Beschreibung | Ausgewählt |
|--------|-------------|-----------|
| Nur Name + Datei Pflicht | part_number und project optional | ✓ |
| Name + Teilenummer + Projekt alle Pflicht | Höhere Datenqualität | |

**User's choice:** Nur Name als Pflichtfeld

---

## Worker-Integration-Tiefe

| Option | Beschreibung | Ausgewählt |
|--------|-------------|-----------|
| Vollständig mit status-Transitions | SC#4 in Phase 3 erfüllen: processing → ready/failed | ✓ |
| Nur Queue-Dispatch, Worker-Validierung in Phase 4 | Phase 3 endet nach Enqueue | |

**User's choice:** Vollständig integriert in Phase 3

| Option | Beschreibung | Ausgewählt |
|--------|-------------|-----------|
| Docker Compose startet alles zusammen | Ein Befehl für vollständigen E2E-Test | ✓ |
| Worker läuft separat, nur Redis geteilt | Zwei Terminals nötig | |

**User's choice:** Docker Compose ein Befehl

---

## Claude's Discretion

- SHA-256-Berechnungsort (Browser vs. Server nach S3-Upload)
- Celery-Task-Name und -Routing-Konfiguration
- FastAPI-Health-Endpoint-Design
- Upstash Redis Connection String Format
- Lokale Redis-Version (redis:7-alpine)
- Fehler-Response-Format bei Duplikat (HTTP 409 + existing_part_id empfohlen)

## Deferred Ideas

- FastAPI vollständiges REST-API für den Worker → nicht in Phase 3
- S3-Multipart-Upload >100 MB → Out of Scope
- Authentifizierung am Upload-Endpunkt → kein Auth im Pilot (Phase 1 Entscheidung D-06)
