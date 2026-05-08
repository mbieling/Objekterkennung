# Phase 2: Python Worker Spike - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-08
**Phase:** 2-python-worker-spike
**Areas discussed:** Rendering-Backend, View-Konfiguration, STEP-Validierung, Spike-Scope

---

## Rendering-Backend

| Option | Beschreibung | Gewählt |
|--------|-------------|---------|
| pythonOCC + VTK + Mesa GL (OSMesa) | Standard headless Linux-Container, kein GPU nötig | ✓ |
| pythonOCC + pythonocc-core Offscreen direkt | Weniger Abhängigkeiten, schlechtere Dokumentation | |
| FreeCAD headless | Größeres Image, aber fertige Docker-Images vorhanden | |

**Gewählt:** pythonOCC + VTK + OSMesa

| Fallback-Option | Beschreibung | Gewählt |
|----------------|-------------|---------|
| FreeCAD headless umsteigen | Spike dokumentiert Grund, Phase 3 baut auf funktionierendem Renderer | ✓ |
| trimesh + pyrender | Leichtgewichtig, schlechtere STEP-Unterstützung | |
| Spike blockieren | Kein Fallback — VTK+OSMesa muss funktionieren | |

**Gewählt:** FreeCAD-headless als Fallback wenn VTK+OSMesa fehlschlägt

| Mesa-Modus | Beschreibung | Gewählt |
|-----------|-------------|---------|
| OSMesa | Reines Software-Rendering, kein Display-Server, stabilster Docker-Pfad | ✓ |
| EGL | Hardware-agnostisch, moderner aber komplexer | |
| Xvfb | Klassisch, funktioniert aber zusätzlicher Prozess | |

**Gewählt:** OSMesa

---

## View-Konfiguration

| Option | Beschreibung | Gewählt |
|--------|-------------|---------|
| 6 orthografische Views | Vorne, hinten, links, rechts, oben, unten | |
| 8 Views (6 ortho + 2 isometrisch) | Zusätzlich vorne-rechts-oben, hinten-links-unten | ✓ |
| 4 Views (minimal) | Vorne, rechts, oben, isometrisch | |

**Gewählt:** 8 Views

| Hintergrund | Beschreibung | Gewählt |
|------------|-------------|---------|
| Weiß (#FFFFFF) | Maximaler Kontrast für dunkle Metallbauteile | ✓ |
| Schwarz (#000000) | Gut für helle/transparente Bauteile | |
| Grau (50%) | Mittelweg, kein klarer Vorteil | |

**Gewählt:** Weiß (#FFFFFF)

| Ausgabegröße | Beschreibung | Gewählt |
|-------------|-------------|---------|
| 224×224px | DINOv2-native Größe, kein Skalierungsschritt | |
| 512×512px | Höhere Qualität, Skalierung nötig | |
| Zwei separate Größen | 512px für UI, 224px für Embedding | ✓ |

**Gewählt:** Zwei separate Größen — 512×512px für S3-Thumbnails, 224×224px für DINOv2-Input

---

## STEP-Validierung

| Kriterium | Beschreibung | Gewählt |
|----------|-------------|---------|
| Face-Count < 4 = ungültig | Einheitenunabhängig, einfach | ✓ |
| Bounding-Box-Volumen < Schwellwert | Einheitenabhängig, riskant | |
| Beides: Face-Count UND Bounding-Box | Strengste Prüfung | |

**Gewählt:** Face-Count < 4 = ungültig

| Fehlerbehandlung | Beschreibung | Gewählt |
|-----------------|-------------|---------|
| Status 'failed' + Fehlercode in DB | Strukturiert, Admin kann Fehler anzeigen | ✓ |
| HTTP 422 beim Upload | Synchron, aber erfordert Validierung im API-Layer | |
| Nur Worker-Log | Einfach, aber Admin-seitig nicht sichtbar | |

**Gewählt:** `parts.status = 'failed'` + strukturierter Fehlercode (z.B. `INVALID_GEOMETRY:face_count=2`)

---

## Spike-Scope

| Scope | Beschreibung | Gewählt |
|-------|-------------|---------|
| Minimales Test-Skript | Kein FastAPI, kein Celery — nur Renderer + Embedding validieren | ✓ |
| FastAPI + Celery Gerüst | Vollständig, Phase 3 baut direkt weiter | |
| FastAPI ohne Queue | Synchroner API-Endpoint als Mittelweg | |

**Gewählt:** Minimaler Spike — nur `process_step.py` in Docker

| Verzeichnis | Beschreibung | Gewählt |
|------------|-------------|---------|
| worker/ | Klar getrennt vom Next.js-Code, Phase 3 erweitert es | ✓ |
| Separates Git-Repo | Mehr Isolation, mehr Overhead | |
| python-worker/ | Äquivalent zu worker/, nur Namensunterschied | |

**Gewählt:** `worker/` im Repo-Root

---

## Claude's Discretion

- Kamera-Abstand und Zoom für die 8 Views (automatisch aus Bounding-Box ableiten)
- DINOv2-Preprocessing-Details (Normalisierung, Resize-Strategie)
- Basis-Docker-Image (python:3.11-slim + conda vs. offizielle pythonOCC-Images)
- Dateinamenskonvention für PNGs in S3

## Deferred Ideas

- **FastAPI + Celery + Redis Queue** → Phase 3
- **Cloud-Deployment-Test** → Phase 3 nach Spike-Validierung
- **HNSW-Tuning** → Phase 10
- **Retry-Mechanismus** → Phase 5
