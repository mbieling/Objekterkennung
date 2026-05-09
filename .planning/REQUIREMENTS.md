# Requirements: Bauteil-Finder (CAD Part Recognition)

**Definiert:** 2026-05-07
**Core Value:** Ein Ingenieur fotografiert ein Bauteil mit dem Handy und sieht in Sekunden, ob ein geometrisch ähnliches Teil bereits in der Datenbank existiert.

## v1 Anforderungen

### Upload & Ingestion

- [ ] **INGEST-01**: Nutzer kann eine STEP-Datei (max. 100 MB) mit Metadaten hochladen (Name, Teilenummer, Projekt, Status)
- [ ] **INGEST-02**: System zeigt nach dem Upload den Verarbeitungsstatus an (pending → processing → ready → failed)
- [ ] **INGEST-03**: System erzeugt automatisch 6–8 orthographische 3D-Thumbnails beim Ingest
- [x] **INGEST-04**: System verhindert doppelte Uploads per SHA-256-Deduplizierung

### Admin-Katalog

- [ ] **ADMIN-01**: Nutzer kann alle hochgeladenen Bauteile in einer Katalog-Liste mit Status und Thumbnail sehen
- [ ] **ADMIN-02**: Nutzer kann Metadaten eines Bauteils (Name, Teilenummer, Projekt, Status) nachträglich bearbeiten
- [ ] **ADMIN-03**: Nutzer kann ein Bauteil archivieren oder löschen (aus Suche entfernen)
- [ ] **ADMIN-04**: Nutzer kann die Verarbeitung für fehlerhafte Bauteile erneut starten

<!-- API-Backend für ADMIN-02/03/04 implementiert in Plan 05-03 — UI noch ausstehend (Plan 05-04) -->

### Suche

- [ ] **SEARCH-01**: Nutzer kann ein Bauteil direkt mit der Handy-Kamera im Browser fotografieren
- [ ] **SEARCH-02**: Nutzer kann alternativ ein vorhandenes Foto als Datei hochladen (Fallback)
- [ ] **SEARCH-03**: System liefert gerankete Treffer mit Match-Prozentwert und Thumbnails
- [ ] **SEARCH-04**: Nutzer kann den Ähnlichkeitsschwellwert konfigurieren (ab wann ein Treffer angezeigt wird)
- [ ] **SEARCH-05**: Nutzer kann die Anzahl der angezeigten Treffer konfigurieren

### Bauteil-Detailseite

- [x] **DETAIL-01**: Nutzer kann die vollständigen Metadaten eines gefundenen Bauteils einsehen
- [x] **DETAIL-02**: Nutzer kann die Original-STEP-Datei herunterladen

## v2 Anforderungen

### Upload (Erweiterungen)

- **INGEST-V2-01**: Nutzer kann ein ZIP-Archiv mit mehreren STEP-Dateien auf einmal hochladen (Bulk-Upload)
- **INGEST-V2-02**: System importiert Metadaten aus begleitenden CSV-Dateien beim Bulk-Upload

### Suche (Erweiterungen)

- **SEARCH-V2-01**: Nutzer sieht die Suchhistorie (zuletzt gesuchte Fotos)
- **SEARCH-V2-02**: Nutzer kann einem Treffer als "falscher Treffer" markieren (Feedback für Qualitätsprüfung)
- **SEARCH-V2-03**: Nutzer kann Suchergebnisse nach Projekt oder Status filtern

### Administration

- **ADMIN-V2-01**: Admin kann eine Queue-Übersicht der laufenden Verarbeitungs-Jobs sehen
- **ADMIN-V2-02**: Admin kann die Standard-Werte für Schwellwert und Trefferanzahl systemweit konfigurieren

## Out of Scope

| Feature | Begründung |
|---------|-----------|
| Interaktiver 3D-Viewer im Browser | Hohe Komplexität (STEP → Mesh, Three.js), vorgerenderte Thumbnails decken 90% des Nutzens |
| ERP/PLM-Integration | Zu früh; erst Grundfunktion validieren |
| QR/Barcode-Erkennung | Anderer Workflow, nicht die Anforderung |
| OAuth / SSO Login | Für Pilot nicht notwendig; einfache Auth ausreichend |
| Offline-Betrieb | Kamera + KI-Suche setzt Verbindung voraus |
| Eigene KI-Modell-Trainingsschleife | Vortrainierte Embeddings (DINOv2) sind ausreichend |
| Maßstabs-/Toleranzprüfung | Geometrie-Ähnlichkeit ist das Ziel, keine exakte Maßprüfung |
| Mehrsprachigkeit | Pilot ist intern; Deutsch ausreichend |

## Traceability

| Anforderung | Phase | Status |
|-------------|-------|--------|
| INGEST-01 | Phase 4 — Ingestion UI | Pending |
| INGEST-02 | Phase 4 — Ingestion UI | Pending |
| INGEST-03 | Phase 2 — Python Worker Spike | Pending |
| INGEST-04 | Phase 3 — Ingestion API + Queue | Complete (03-03) |
| ADMIN-01 | Phase 5 — Admin Catalog | Pending |
| ADMIN-02 | Phase 5 — Admin Catalog | API complete (05-03) — UI pending (05-04) |
| ADMIN-03 | Phase 5 — Admin Catalog | API complete (05-03) — UI pending (05-04) |
| ADMIN-04 | Phase 5 — Admin Catalog | API complete (05-03) — UI pending (05-04) |
| SEARCH-01 | Phase 7 — Camera UI | Pending |
| SEARCH-02 | Phase 7 — Camera UI | Pending |
| SEARCH-03 | Phase 8 — Results UI | Pending |
| SEARCH-04 | Phase 8 — Results UI | Pending |
| SEARCH-05 | Phase 8 — Results UI | Pending |
| DETAIL-01 | Phase 9 — Part Detail | ✓ Validated |
| DETAIL-02 | Phase 9 — Part Detail | ✓ Validated |

**Abdeckung:**
- v1-Anforderungen: 15 gesamt
- Phasen zugeordnet: 15 ✓
- Nicht zugeordnet: 0 ✓

---
*Anforderungen definiert: 2026-05-07*
*Zuletzt aktualisiert: 2026-05-07 nach Roadmap-Erstellung*
