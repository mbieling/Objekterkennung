# Requirements Archive: v1 — Core Search Experience

**Archiviert:** 2026-05-09
**Milestone:** v1 — Core Search Experience
**Status:** ✅ SHIPPED

---

## v1 Anforderungen — Abschluss-Status

### Upload & Ingestion

- [x] **INGEST-01**: Nutzer kann eine STEP-Datei (max. 100 MB) mit Metadaten hochladen (Name, Teilenummer, Projekt, Status)
  - **Ergebnis:** ✓ Validated — UploadForm.tsx mit 5-stufiger State Machine; SHA-256 + XHR-PUT + Polling implementiert. Status-Feld via Admin-Edit (ADMIN-02) nachbearbeitbar.

- [x] **INGEST-02**: System zeigt nach dem Upload den Verarbeitungsstatus an (pending → processing → ready → failed)
  - **Ergebnis:** ✓ Validated — usePartStatus-Hook, GET /api/parts/[id]/status, Echtzeit-Polling. Thumbnail-Anzeige nach Fix BLOCKER-02 (isSafeImageUrl AWS S3) vollständig.

- [x] **INGEST-03**: System erzeugt automatisch 6–8 orthographische 3D-Thumbnails beim Ingest
  - **Ergebnis:** ✓ Validated (Code) — renderer.py + process_step.py implementiert, 8 Views, S3-Upload. thumbnail_count nach Fix BLOCKER-01 korrekt in DB. E2E-Test auf echtem Docker ausstehend.

- [x] **INGEST-04**: System verhindert doppelte Uploads per SHA-256-Deduplizierung
  - **Ergebnis:** ✓ Validated — POST /api/upload/init prüft SHA-256 vor Insert. HTTP 409 + existing_part_id zurückgegeben. 5 Tests grün.

### Admin-Katalog

- [x] **ADMIN-01**: Nutzer kann alle hochgeladenen Bauteile in einer Katalog-Liste mit Status und Thumbnail sehen
  - **Ergebnis:** ✓ Validated — CatalogTable.tsx: 5 Tabs, Suche (300ms Debounce), Pagination (20/Seite), Thumbnails nach Fix BLOCKER-02.

- [x] **ADMIN-02**: Nutzer kann Metadaten eines Bauteils (Name, Teilenummer, Projekt, Status) nachträglich bearbeiten
  - **Ergebnis:** ✓ Validated — PATCH /api/parts/[id] + Edit-Sheet in CatalogTable; Optimistic Update mit Rollback; Toast-Feedback.

- [x] **ADMIN-03**: Nutzer kann ein Bauteil archivieren oder löschen (aus Suche entfernen)
  - **Ergebnis:** ✓ Validated — POST /api/parts/[id]/archive (status='archived', entfernt aus Suchergebnissen); DELETE /api/parts/[id] (Hard-Delete + S3-Cleanup); AlertDialog mit Bestätigung.

- [x] **ADMIN-04**: Nutzer kann die Verarbeitung für fehlerhafte Bauteile erneut starten
  - **Ergebnis:** ✓ Validated — POST /api/parts/[id]/retry: DB-Update auf 'pending' vor Worker-Enqueue; 409 wenn nicht 'failed'; UI-Aktion nur bei status='failed' sichtbar.

### Suche

- [x] **SEARCH-01**: Nutzer kann ein Bauteil direkt mit der Handy-Kamera im Browser fotografieren
  - **Ergebnis:** ✓ Validated (Code + Playwright-Desktop) — CameraCapture.tsx mit getUserMedia, State Machine, Canvas-Capture. Manueller Test auf echtem Mobilgerät ausstehend.

- [x] **SEARCH-02**: Nutzer kann alternativ ein vorhandenes Foto als Datei hochladen (Fallback)
  - **Ergebnis:** ✓ Validated — File-Input dauerhaft sichtbar, MIME-Check (image/*), Playwright-E2E-Test grün.

- [x] **SEARCH-03**: System liefert gerankete Treffer mit Match-Prozentwert und Thumbnails
  - **Ergebnis:** ✓ Validated — SearchResultCard.tsx: Thumbnail + Name + Teilenummer + farbkodierter Badge (grün/amber/rot). Sortierung via pgvector ORDER BY. part_number-Gap nach Phase-8-Verifikation behoben.

- [x] **SEARCH-04**: Nutzer kann den Ähnlichkeitsschwellwert konfigurieren (ab wann ein Treffer angezeigt wird)
  - **Ergebnis:** ✓ Validated — Threshold-Slider in SearchResults.tsx; lokale Filterung ohne API-Call; E2E-Test SEARCH-04 grün.

- [x] **SEARCH-05**: Nutzer kann die Anzahl der angezeigten Treffer konfigurieren
  - **Ergebnis:** ✓ Validated — Limit-Select in SearchResults.tsx; handleSearchWithLimit triggert neue API-Anfrage; E2E-Test SEARCH-05 grün.

### Bauteil-Detailseite

- [x] **DETAIL-01**: Nutzer kann die vollständigen Metadaten eines gefundenen Bauteils einsehen
  - **Ergebnis:** ✓ Validated — PartDetail.tsx: alle 5 Felder (name, part_number, project, status, created_at). Thumbnail-Galerie nach Fix BLOCKER-01 (thumbnail_count). Human-Verify approved.

- [x] **DETAIL-02**: Nutzer kann die Original-STEP-Datei herunterladen
  - **Ergebnis:** ✓ Validated — GET /api/parts/[id]/download: Presigned URL (300s TTL), sanitizeFilename(), Content-Disposition. window.location.href-Download. Human-Verify approved.

---

## Traceability — Abschluss

| Anforderung | Phase | Finale Status |
|-------------|-------|---------------|
| INGEST-01 | Phase 4 — Ingestion UI | ✓ Complete |
| INGEST-02 | Phase 4 — Ingestion UI | ✓ Complete (nach BLOCKER-02-Fix) |
| INGEST-03 | Phase 2 — Python Worker Spike | ✓ Complete (nach BLOCKER-01-Fix) |
| INGEST-04 | Phase 3 — Ingestion API + Queue | ✓ Complete |
| ADMIN-01 | Phase 5 — Admin Catalog | ✓ Complete (nach BLOCKER-02-Fix) |
| ADMIN-02 | Phase 5 — Admin Catalog | ✓ Complete |
| ADMIN-03 | Phase 5 — Admin Catalog | ✓ Complete |
| ADMIN-04 | Phase 5 — Admin Catalog | ✓ Complete |
| SEARCH-01 | Phase 7 — Camera UI | ✓ Complete (Gerät-Test ausstehend) |
| SEARCH-02 | Phase 7 — Camera UI | ✓ Complete |
| SEARCH-03 | Phase 8 — Results UI | ✓ Complete (part_number nach Verifikation behoben) |
| SEARCH-04 | Phase 8 — Results UI | ✓ Complete |
| SEARCH-05 | Phase 8 — Results UI | ✓ Complete |
| DETAIL-01 | Phase 9 — Part Detail | ✓ Complete (nach BLOCKER-01-Fix) |
| DETAIL-02 | Phase 9 — Part Detail | ✓ Complete |

**v1-Anforderungen: 15/15 Complete** ✓

---

## v2 Anforderungen (offen für nächsten Milestone)

### Upload (Erweiterungen)
- **INGEST-V2-01**: Bulk-Upload via ZIP-Archiv mit mehreren STEP-Dateien
- **INGEST-V2-02**: Metadaten-Import aus CSV-Dateien beim Bulk-Upload

### Suche (Erweiterungen)
- **SEARCH-V2-01**: Suchhistorie (zuletzt gesuchte Fotos)
- **SEARCH-V2-02**: "Falscher Treffer"-Markierung (Feedback-Loop)
- **SEARCH-V2-03**: Filter nach Projekt oder Status in Suchergebnissen

### Administration
- **ADMIN-V2-01**: Queue-Übersicht der laufenden Verarbeitungs-Jobs
- **ADMIN-V2-02**: Systemweite Konfiguration von Schwellwert und Trefferanzahl

## Out of Scope (bestätigt für v1)

| Feature | Begründung |
|---------|-----------|
| Interaktiver 3D-Viewer im Browser | Hohe Komplexität; Thumbnails decken 90% des Nutzens |
| ERP/PLM-Integration | Zu früh; erst Grundfunktion validieren |
| QR/Barcode-Erkennung | Anderer Workflow |
| OAuth / SSO Login | Für Pilot nicht notwendig |
| Offline-Betrieb | Kamera + KI-Suche setzt Verbindung voraus |
| Eigene KI-Modell-Trainingsschleife | Vortrainierte Embeddings ausreichend |
| Maßstabs-/Toleranzprüfung | Geometrie-Ähnlichkeit ist Ziel |
| Mehrsprachigkeit | Pilot ist intern; Deutsch ausreichend |

---

*Anforderungen archiviert: 2026-05-09 nach v1-Milestone-Abschluss*
