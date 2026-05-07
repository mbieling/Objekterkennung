# Requirements: Bauteil-Finder (CAD Part Recognition)

**Definiert:** 2026-05-07
**Core Value:** Ein Ingenieur fotografiert ein Bauteil mit dem Handy und sieht in Sekunden, ob ein geometrisch ähnliches Teil bereits in der Datenbank existiert.

## v1 Anforderungen

### Upload & Ingestion

- [ ] **INGEST-01**: Nutzer kann eine STEP-Datei (max. 100 MB) mit Metadaten hochladen (Name, Teilenummer, Projekt, Status)
- [ ] **INGEST-02**: System zeigt nach dem Upload den Verarbeitungsstatus an (pending → processing → ready → failed)
- [ ] **INGEST-03**: System erzeugt automatisch 6–8 orthographische 3D-Thumbnails beim Ingest
- [ ] **INGEST-04**: System verhindert doppelte Uploads per SHA-256-Deduplizierung

### Admin-Katalog

- [ ] **ADMIN-01**: Nutzer kann alle hochgeladenen Bauteile in einer Katalog-Liste mit Status und Thumbnail sehen
- [ ] **ADMIN-02**: Nutzer kann Metadaten eines Bauteils (Name, Teilenummer, Projekt, Status) nachträglich bearbeiten
- [ ] **ADMIN-03**: Nutzer kann ein Bauteil archivieren oder löschen (aus Suche entfernen)
- [ ] **ADMIN-04**: Nutzer kann die Verarbeitung für fehlerhafte Bauteile erneut starten

### Suche

- [ ] **SEARCH-01**: Nutzer kann ein Bauteil direkt mit der Handy-Kamera im Browser fotografieren
- [ ] **SEARCH-02**: Nutzer kann alternativ ein vorhandenes Foto als Datei hochladen (Fallback)
- [ ] **SEARCH-03**: System liefert gerankete Treffer mit Match-Prozentwert und Thumbnails
- [ ] **SEARCH-04**: Nutzer kann den Ähnlichkeitsschwellwert konfigurieren (ab wann ein Treffer angezeigt wird)
- [ ] **SEARCH-05**: Nutzer kann die Anzahl der angezeigten Treffer konfigurieren

### Bauteil-Detailseite

- [ ] **DETAIL-01**: Nutzer kann die vollständigen Metadaten eines gefundenen Bauteils einsehen
- [ ] **DETAIL-02**: Nutzer kann die Original-STEP-Datei herunterladen

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

*(Wird während der Roadmap-Erstellung befüllt)*

| Anforderung | Phase | Status |
|-------------|-------|--------|
| INGEST-01 | — | Pending |
| INGEST-02 | — | Pending |
| INGEST-03 | — | Pending |
| INGEST-04 | — | Pending |
| ADMIN-01 | — | Pending |
| ADMIN-02 | — | Pending |
| ADMIN-03 | — | Pending |
| ADMIN-04 | — | Pending |
| SEARCH-01 | — | Pending |
| SEARCH-02 | — | Pending |
| SEARCH-03 | — | Pending |
| SEARCH-04 | — | Pending |
| SEARCH-05 | — | Pending |
| DETAIL-01 | — | Pending |
| DETAIL-02 | — | Pending |

**Abdeckung:**
- v1-Anforderungen: 15 gesamt
- Phasen zugeordnet: 0 (wird vom Roadmapper befüllt)
- Nicht zugeordnet: 15 ⚠️

---
*Anforderungen definiert: 2026-05-07*
*Zuletzt aktualisiert: 2026-05-07 nach initialer Definition*
