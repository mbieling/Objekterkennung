# Phase 6: Search Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-09
**Phase:** 6-search-pipeline
**Areas discussed:** Sync vs. Async Suche, Foto-Transfer zum Worker, Threshold & Limit Konfiguration, Response-Shape

---

## Sync vs. Async Suche

| Option | Beschreibung | Gewählt |
|--------|-------------|---------|
| Synchron | API hält Verbindung offen bis Ergebnis fertig (~2–5s). Einfach, passt zu "in Sekunden". | ✓ |
| Asynchron (Job-ID + Polling) | Sofortige Antwort, Client pollt. Komplexer, braucht Redis-State. | |

**Wahl:** Synchron
**Timeout:** 30 Sekunden (nicht 5s oder 10s) — Puffer für Cold-Start auf Railway

---

## Foto-Transfer zum Worker

| Option | Beschreibung | Gewählt |
|--------|-------------|---------|
| HTTP-Multipart direkt zum Worker | Kein S3-Roundtrip, schneller, Worker braucht neuen /embed-Endpunkt | |
| Über S3 (bewährtes Muster) | Konsistent mit STEP-Workflow, +1–2s Latenz, Cleanup nötig | ✓ |
| Base64 in JSON-Body | Einfach, aber +33% Datengröße, spürbar bei Handy-Fotos | |

**Wahl:** Über S3
**Notiz:** Konsistenz mit bestehendem Workflow wichtiger als minimale Latenz-Optimierung

---

## Threshold & Limit Konfiguration

| Option | Beschreibung | Gewählt |
|--------|-------------|---------|
| Optionale Query-Parameter | ?threshold=0.7&limit=10, Defaults falls weggelassen | ✓ |
| Hardcodiert für Phase 6 | Einfacher jetzt, aber Phase 8 muss API erweitern | |

**Wahl:** Optionale Query-Parameter

**Default-Werte:**

| Option | Beschreibung | Gewählt |
|--------|-------------|---------|
| threshold=0.7, limit=10 | Konservativer Start, typischer DINOv2-Bereich 0.55–0.80 | ✓ |
| threshold=0.6, limit=20 | Niedrigerer Schwellwert, mehr Kandidaten | |
| threshold=0.8, limit=5 | Strenger Filter, hohe Präzision | |

**Wahl:** threshold=0.7, limit=10

---

## Response-Shape

| Option | Beschreibung | Gewählt |
|--------|-------------|---------|
| 0–1 Float | Cosinus-Ähnlichkeit direkt, Phase 8 rechnet in % um | ✓ |
| 0–100 Integer | Direkt anzeigbar, aber Präzisionsverlust | |

**Score-Format:** 0–1 Float

| Option | Beschreibung | Gewählt |
|--------|-------------|---------|
| Separat nachladen (GET /api/parts/[id]/thumbnail) | Bereits implementiert, lazy load wie CatalogTable | ✓ |
| Thumbnail-URL inline | Spart Roundtrip, aber Presigned-URL-Ablauf | |

**Thumbnail:** Separat nachladen

---

## Claude's Discretion

- Bucket für temporäre Suchbilder (parts-thumbnails vs. search-temp)
- Temp-File-Naming-Schema in S3
- Zod-Validierung für Query-Parameter (Ranges)
- HTTP-Methode und Dateinamen-Konvention für /api/search

## Deferred Ideas

- Asynchrone Suche mit Job-ID — nicht nötig für <5s Latenz
- Thumbnail-URL inline in Search-Response — v2
- Suchhistorie (SEARCH-V2-01) — v2
