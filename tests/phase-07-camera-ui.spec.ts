// tests/phase-07-camera-ui.spec.ts
// E2E-Tests für Phase 7 Camera UI (SEARCH-01, SEARCH-02, D-02)
// Stubs — werden in Wave 3 (Plan 07-04) aktiviert.

import { test, expect } from '@playwright/test'

test.describe('Phase 7: Camera UI', () => {
  test.skip('/search Seite ist erreichbar und zeigt Kamera-Button', async ({ page }) => {
    // Wave 3: page.goto('/search') → await expect(page.getByText('Bauteil fotografieren')).toBeVisible()
  })

  test.skip('SEARCH-02: File-Input ist in idle-State sichtbar', async ({ page }) => {
    // Wave 3: page.goto('/search') → await expect(page.getByText('Foto aus Galerie wählen')).toBeVisible()
  })

  test.skip('SEARCH-02: Datei-Upload via File-Input löst Suche aus', async ({ page }) => {
    // Wave 3: File-Input mit Testbild befüllen → Spinner sichtbar → Ergebnis oder Fehler
  })

  test.skip('D-02: Homepage zeigt beide Buttons (Teil hochladen + Teil suchen)', async ({ page }) => {
    // Wave 3: page.goto('/') → beide Buttons prüfen
  })

  test.skip('D-02: Teil suchen-Button navigiert zu /search', async ({ page }) => {
    // Wave 3: page.goto('/') → click 'Teil suchen' → expect URL /search
  })

  test.skip('D-09: Spinner sichtbar während Suche läuft', async ({ page }) => {
    // Wave 3: Route-Mock für /api/search mit Delay → Spinner sichtbar
  })

  test.skip('D-10: JSON-Ergebnis in pre-Block nach erfolgreicher Suche', async ({ page }) => {
    // Wave 3: Route-Mock für /api/search 200 → pre-Block mit JSON sichtbar
  })
})
