# Bauteil-Finder (CAD Part Recognition)

## What This Is

Eine Web-App für Ingenieure und Konstrukteure, die per Handykamera ein physisches Bauteil abfotografieren und prüfen können, ob ein geometrisch ähnliches Bauteil bereits in der firmeninternen Teile-Datenbank vorhanden ist. STEP-Dateien werden mit Metadaten in die Datenbank geladen, per KI in visuelle Merkmale umgewandelt und bei einer Suchanfrage mit dem Kamerafoto verglichen. Ziel: Redundanz in der Bauteilentwicklung vermeiden.

## Core Value

Ein Ingenieur fotografiert ein Bauteil mit dem Handy und sieht in Sekunden, ob ein geometrisch ähnliches Teil bereits in der Datenbank existiert.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] STEP-Dateien mit Metadaten (Name, Teilenummer, Projekt, Datum) hochladen
- [ ] Hochgeladene STEP-Dateien werden verarbeitet: 3D-Renderings erzeugt und visuelle Embeddings extrahiert
- [ ] Ingenieur kann per Handy-Kamera ein Bauteil abfotografieren
- [ ] Foto wird gegen die Datenbank verglichen (Geometrie-Ähnlichkeit via Embeddings)
- [ ] Treffer werden mit Metadaten angezeigt (Name, Teilenummer, Projekt, Erstelldatum)
- [ ] Ähnlichkeitsschwellwert ist konfigurierbar (wie ähnlich muss ein Treffer sein?)
- [ ] Anzahl der angezeigten Treffer ist konfigurierbar
- [ ] Datenbank skaliert auf 1.000+ STEP-Dateien

### Out of Scope

- QR/Barcode-Erkennung — andere Anforderung, nicht der gewünschte Workflow
- ERP/PLM-Integration — zu früh, erst Grundfunktion validieren
- Offline-Betrieb — Kamera + KI-Suche setzt Verbindung voraus
- Exakter Maßstabsvergleich — Geometrieähnlichkeit ist ausreichend, keine Toleranzprüfung
- Eigene KI-Modell-Trainingsschleife — vortrainierte Embeddings werden verwendet

## Context

- **Bestehende Codebasis:** Next.js 16 App Router + shadcn/ui + Supabase-Platzhalter — Template-Stand, noch keine Features implementiert
- **Nutzergruppe:** Ingenieure und Konstrukteure, die bereits mit CAD-Software arbeiten; technisch versiert
- **Kernproblem:** Doppelentwicklung von Bauteilen durch fehlende Wiederverwendbarkeit — Ingenieure wissen nicht, ob ein ähnliches Teil schon existiert
- **Suchanfrage:** 2D-Foto gegen 3D-STEP-Datenbank — technische Brücke ist das visuelle Embedding (z.B. CLIP-ähnlich) aus gerenderten STEP-Ansichten
- **Dateiformat:** STEP (.step / .stp) — ISO 10303 Standard, weit verbreitet in CAD-Systemen

## Constraints

- **Tech Stack:** Next.js + TypeScript + Supabase — bereits vorhanden, kein Wechsel
- **Dateiformat:** STEP (.step / .stp) — nur dieses Format, kein IGES, FBX etc.
- **Datenbankgröße:** 1.000+ STEP-Dateien — Lösung muss skalieren, kein linearer Scan
- **Mobilfähigkeit:** Kamera-Workflow muss auf Handy-Browser funktionieren (WebRTC / `getUserMedia`)
- **Performance:** STEP-Verarbeitung ist rechenintensiv — asynchron im Backend, nicht synchron im Upload-Request

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Embeddings für Ähnlichkeitssuche | Bei 1.000+ Dateien ist Vektor-Suche der einzig skalierbare Ansatz | — Pending |
| STEP → Rendering im Backend | Browser kann STEP nicht nativ rendern; serverseitige Verarbeitung notwendig | — Pending |
| Supabase pgvector für Vektor-Suche | Bereits im Stack, pgvector-Extension vermeidet externe Vektordatenbank | — Pending |
| Schwellwert konfigurierbar | Ingenieure haben unterschiedliche Toleranz für "ähnlich" je nach Kontext | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-05-09 — Phase 6 complete (Search Pipeline)*
