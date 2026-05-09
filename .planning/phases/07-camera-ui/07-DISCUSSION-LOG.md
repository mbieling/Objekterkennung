# Phase 7: Camera UI — Discussion Log

**Session:** 2026-05-09
**Areas covered:** Routing & Navigation, Kamera-Flow, Framing-Overlay, Nach dem Capture

---

## Routing & Navigation

**Frage 1:** Wo soll die Kamera-UI leben?
- Optionen: Eigene /search-Seite | Auf der Homepage integriert | Als Tab auf /upload
- **Entscheidung:** Eigene /search-Seite (empfohlen)

**Frage 2:** Wie kommt der Nutzer zur /search-Seite?
- Optionen: Homepage bekommt beide Buttons | Nur über direkten Link
- **Entscheidung:** Homepage bekommt beide Buttons (empfohlen)

---

## Kamera-Flow

**Frage 1:** Wie soll die Kamera-Aufnahme ablaufen?
- Optionen: Vorschau-Stream + Capture-Button | Direkt native Kamera-UI | Hybrid
- **Entscheidung:** Vorschau-Stream + Capture-Button (empfohlen)

**Frage 2:** Was passiert bei getUserMedia-Fehler?
- Optionen: Automatisch auf File-Upload umschalten | Manueller Link | Nur Fehlermeldung
- **Entscheidung:** Automatisch auf File-Upload umschalten (empfohlen)

**Frage 3:** Hinterkamera bevorzugen?
- Optionen: Ja, facingMode: 'environment' | Kein Preference
- **Entscheidung:** Ja, facingMode: 'environment' (empfohlen)

---

## Framing-Overlay

**Frage 1:** Was als Orientierungshilfe zeigen?
- Optionen: Visueller Rahmen über dem Stream | Text-Anleitung darunter | Beides
- **Entscheidung:** Visueller Rahmen über dem Kamera-Stream (empfohlen)

---

## Nach dem Capture

**Frage 1:** Sofort senden oder Bestätigung?
- Optionen: Vorschau + Bestätigung | Sofort senden | Vorschau + Bildbearbeitung
- **Entscheidung:** Vorschau + Bestätigung (empfohlen)

**Frage 2:** Was während der Suche anzeigen?
- Optionen: Spinner + Ladeanzeige auf /search | Sofort zu /results weiterleiten
- **Entscheidung:** Spinner + Ladeanzeige auf der /search-Seite (empfohlen)

**Frage 3:** Was nach erfolgreicher Suche zeigen?
- Optionen: Rohe JSON-Ausgabe | Einfache Text-Liste | Nur Toast
- **Entscheidung:** Rohe JSON-Ausgabe als Placeholder (empfohlen)

---

## Claude's Discretion (nicht befragt)

- Bildkompression: Canvas auf max. 1024px Breite, JPEG 0.85
- Komponentenstruktur: CameraCapture als eigenständige Client-Komponente

---

## Deferred Ideas

*(keine neuen — bestehende Deferred-Liste aus PROJECT.md übernommen)*
