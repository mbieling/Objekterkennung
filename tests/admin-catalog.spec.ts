// tests/admin-catalog.spec.ts
// E2E Smoke-Tests für /admin — ADMIN-01 bis ADMIN-04
// Wave 0: Stub anlegen. Wave 4: Implementierungen aktivieren nach CatalogTable-Fertigstellung.

import { test, expect } from '@playwright/test'

test.describe('/admin — Teile-Katalog', () => {
  test.skip('Seite lädt und zeigt Tabellen-Header: Vorschau, Bezeichnung, Teilenummer, Projekt, Status, Erstellt am', async ({ page }) => {
    // STUB — Wave 4: nach CatalogTable-Implementierung aktivieren
  })

  test.skip('Status-Tabs sind sichtbar: Alle, Bereit, Ausstehend, Fehler, Archiviert', async ({ page }) => {
    // STUB — Wave 4: nach CatalogTable-Implementierung aktivieren
  })

  test.skip('Suchfeld ist vorhanden mit Placeholder "Nach Bezeichnung oder Teilenummer suchen…"', async ({ page }) => {
    // STUB — Wave 4: nach CatalogTable-Implementierung aktivieren
  })

  test.skip('Pagination zeigt "Zeige 1–N von M Teilen"', async ({ page }) => {
    // STUB — Wave 4: nach CatalogTable-Implementierung aktivieren
  })
})
