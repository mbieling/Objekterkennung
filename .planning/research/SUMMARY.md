# Research Summary — Bauteil-Finder (CAD Part Recognition)

## Executive Summary

Bauteil-Finder ist ein visuelles Ähnlichkeitssuch-System für mechanische CAD-Bauteile. Ingenieure fotografieren ein physisches Bauteil mit dem Handy; das System liefert gerankete Treffer aus einer Datenbank mit STEP-Dateien. Der empfohlene Ansatz nutzt einen Python-Microservice zum Parsen von STEP-Dateien (pythonOCC + OpenCASCADE), rendert mehrere orthographische Ansichten (6–8) und extrahiert DINOv2-Visual-Embeddings. Diese werden in Supabase pgvector gespeichert und zur Suchzeit per Cosinus-Ähnlichkeit (HNSW-Index) abgefragt.

Die Architektur teilt sich in zwei Flows mit einer gemeinsamen Datenbank auf: eine langsame asynchrone Ingestion-Pipeline (STEP-Upload → Rendern → Embedding → Speichern) und eine schnelle synchrone Such-Pipeline (Handyfoto → Embedding → Vektor-Query → Ergebnisse). Kritische Einschränkung: STEP-Verarbeitung kann nicht in Next.js/Vercel laufen — sie erfordert einen persistenten Docker-Container (Railway oder Fly.io), der das ~600 MB Embedding-Modell im Speicher hält.

---

## Empfohlener Stack

| Technologie | Rolle | Warum |
|---|---|---|
| pythonOCC-core 7.7.x (conda) | STEP-Parsing + Rendering | Einziger produktionstauglicher Python-STEP-Parser; treibt FreeCAD an |
| DINOv2 ViT-B/14 (HuggingFace) | Visuelle Embeddings | Übertrifft CLIP auf texturfreien geometrischen Bildern; 768-dim |
| pgvector 0.7+ HNSW (Supabase) | Vektor-Suche | <10ms bei 1000 Teilen; kein Rebuild beim Wachsen des Korpus |
| FastAPI + Celery + Redis | Python-Microservice + Async Queue | STEP-Verarbeitung dauert 5–120s; muss vom HTTP-Lifecycle entkoppelt sein |
| getUserMedia + Canvas API | Mobile Kamera | Zero-Framework, cross-browser; Canvas für clientseitiges Resize |

---

## Table Stakes für v1

1. STEP-Upload mit asynchroner Verarbeitung + Status-Feedback (pending → processing → ready → failed)
2. Gerenderte 3D-Thumbnails pro Bauteil, erzeugt beim Ingest
3. Mobile Kamera-Aufnahme mit Datei-Upload-Fallback
4. Ähnlichkeitssuche mit gerankteten Ergebnissen und farbkodiertem Match-Prozentsatz
5. Admin-Katalog: Liste, Archivieren/Löschen, Metadaten-Bearbeitung, fehlgeschlagene Ingestion wiederholen
6. SHA-256-Deduplizierung beim Upload
7. Bauteil-Detailseite mit STEP-Download

---

## Kritische Architekturentscheidungen (vor Implementierung festlegen)

1. **Embedding-Strategie** — Mean-Pool aus 6–8 orthographischen Ansichten für DB; Single-Image-Query für Handyfoto. Diese Asymmetrie muss akzeptiert und threshold-kalibriert werden. Kann nach Befüllung des Korpus nicht geändert werden.
2. **Embedding-Dimension** — 512 (CLIP) oder 768 (DINOv2). Spalte `vector(N)` im Schema ist fix. Empfehlung: DINOv2 (768-dim), CLIP als Fallback wenn CPU-Inferenz zu langsam.
3. **HNSW-Index von Tag 1** — niemals IVFFlat verwenden; erfordert Rebuild nach Bulk-Loads und degradiert still.
4. **Worker läuft außerhalb von Serverless** — Next.js API-Route speichert nur Datei + stellt Job in Warteschlange; Python-Worker verarbeitet vollständig außerhalb Vercel.
5. **`embedding_model` + `embedding_version` Spalten im Schema** — notwendig für späteres Re-Embedding ohne Re-Upload.

---

## Top-Pitfalls (nur Critical/High)

| # | Pitfall | Prävention |
|---|---------|-----------|
| C1 | Leere STEP-Renderings erzeugen still korrumpierte Embeddings | Bounding-Box-Volumen > ε und Face-Count > 0 nach STEP-Load prüfen; bei Fehler ablehnen |
| C2 | Embedding-Strategie-Asymmetrie zwischen DB und Query | Strategie vor Ingestion-Code festlegen; Schwellwerte mit echten Fotos kalibrieren |
| C3 | IVFFlat-Index veraltet nach Bulk-Loads | HNSW von Tag 1; niemals IVFFlat |
| C4 | STEP-Datei-Ressourcenerschöpfung (100-MB-Assemblies) | 100-MB-Limit an der API; 120s Worker-Timeout in Sandbox-Prozess |
| H5 | Serverless-Timeout killt STEP-Verarbeitung | Worker als persistenter Docker-Container; API-Route gibt sofort 202 zurück |
| H3 | Werkstatt-Beleuchtungs-Domain-Gap: falsche Matches höher bewertet als richtige | In-App-Fotoführung; vor Finalisierung des Modells mit echten Werkstattfotos testen |
| H2 | Kein Status-Feedback nach Upload → Ingenieure denken System ist kaputt | Status-Polling-UI ist Pflicht in derselben Phase wie Upload |

---

## Empfohlene Phasen-Reihenfolge

| Phase | Name | Begründung |
|---|---|---|
| 1 | Datenbank-Fundament | Schema ist eine Einbahnstraße — Embedding-Dimension, HNSW, RPC vor allem anderen festlegen |
| 2 | Python Worker (Kern-Engine) | Höchstes technisches Risiko; STEP-Rendering + DINOv2 validieren bevor UI-Arbeit beginnt |
| 3 | Ingestion-Pipeline + Status-UI | Upload-API mit Worker verbinden; Status-Polling muss hier erscheinen, nicht später |
| 4 | Such-Pipeline (Kamera + Ergebnisse) | Kern-Hypothese erstmals testbar; Schwellwerte mit echten Fotos kalibrieren |
| 5 | Polishing, Fehlerbehandlung, Seeding-Tools | Bulk-ZIP-Upload, Queue-Dashboard, Fotoführungs-UX, Mobile-Layout |

---

## Größte offene Fragen / Risiken

1. **Rendert pythonOCC VTK offscreen korrekt auf Mesa GL in Docker?** (Validierung in Phase-2-Spike; FreeCAD headless als Fallback)
2. **Welche Cosinus-Ähnlichkeits-Scores erreichen echte Werkstattfotos von Metallteilen gegen saubere Renderings?** (Kalibrierung in Phase 4 — erwartet 0.55–0.75, nicht die 0.85+ aus Testbedingungen)
3. **Ist DINOv2 CPU-Inferenz schnell genug auf Railway's kleinstem Instance?** (Schätzung 4–16s pro STEP-Datei über 8 Views; akzeptabel für Async, aber Messung notwendig)

---

## Konfidenz-Übersicht

| Bereich | Level | Schlüssellücke |
|---|---|---|
| Stack | MEDIUM | pythonOCC Rendering-Umgebung braucht empirische Validierung |
| Features | MEDIUM-HIGH | Wettbewerbslandschaft gut verstanden; Practitioner-Pain-Points konsistent |
| Architektur | HIGH | Zwei-Flow-Muster ist etabliert; Komponentengrenzen solide |
| Pitfalls | HIGH | STEP-Fehler, IVFFlat-Degradation, Serverless-Timeouts sind dokumentierte Produktionsfehler |

---
*Synthesized: 2026-05-07 — Stack, Features, Architecture, Pitfalls research*
