// tests/phase-07-camera-ui.spec.ts
// E2E-Tests für Phase 7 Camera UI (SEARCH-01, SEARCH-02, D-02)
// Kamera-Permission-Tests: manuell (see VALIDATION.md Manual-Only)

import { test, expect } from '@playwright/test'

test.describe('Phase 7: Camera UI', () => {

  test('/search Seite ist erreichbar und zeigt Kamera-Button', async ({ page }) => {
    await page.goto('/search')
    await expect(page.getByRole('heading', { name: 'Bauteil fotografieren' })).toBeVisible()
    await expect(page.getByText('Kamera starten')).toBeVisible()
  })

  test('SEARCH-02: File-Input-Trigger ist in idle-State sichtbar', async ({ page }) => {
    await page.goto('/search')
    await expect(page.getByText('Foto aus Galerie wählen')).toBeVisible()
  })

  test('SEARCH-02: Datei-Upload via File-Input löst Suche aus (D-06)', async ({ page }) => {
    // Route-Mock damit kein echter Worker nötig ist
    await page.route('/api/search', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [],
          query: { threshold: 0.6, limit: 10, results_count: 0 },
        }),
      })
    })
    await page.goto('/search')
    // File-Input mit Testbild befüllen (kein Browser-Dialog nötig)
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'test-part.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-jpeg-data'),
    })
    // Vorschau + Suchen-Button erscheinen
    await expect(page.getByText('Suchen')).toBeVisible()
    // Suchen-Button klicken
    await page.getByText('Suchen').click()
    // JSON-Ergebnis erscheint
    await expect(page.locator('pre')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('pre')).toContainText('results_count')
  })

  test('D-02: Homepage zeigt beide Buttons (Teil hochladen + Teil suchen)', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Teil hochladen' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Teil suchen' })).toBeVisible()
  })

  test('D-02: Teil suchen-Button navigiert zu /search', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('link', { name: 'Teil suchen' }).click()
    await expect(page).toHaveURL('/search')
    await expect(page.getByRole('heading', { name: 'Bauteil fotografieren' })).toBeVisible()
  })

  test('D-09: Spinner sichtbar während Suche läuft', async ({ page }) => {
    // Route-Mock mit künstlicher Verzögerung
    await page.route('/api/search', async route => {
      await new Promise(resolve => setTimeout(resolve, 2000))
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ results: [], query: { threshold: 0.6, limit: 10, results_count: 0 } }),
      })
    })
    await page.goto('/search')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'test-part.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-jpeg-data'),
    })
    await page.getByText('Suchen').click()
    // Spinner erscheint sofort nach Klick
    await expect(page.getByText('Suche läuft...')).toBeVisible({ timeout: 3_000 })
  })

  test('D-10: JSON-Ergebnis in pre-Block nach erfolgreicher Suche', async ({ page }) => {
    await page.route('/api/search', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          results: [
            {
              id: 'test-id-01',
              name: 'Testbauteil',
              part_number: 'TB-001',
              project: 'Testprojekt',
              status: 'ready',
              similarity: 0.87,
              created_at: '2026-01-01T00:00:00Z',
            },
          ],
          query: { threshold: 0.6, limit: 10, results_count: 1 },
        }),
      })
    })
    await page.goto('/search')
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'test-part.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-jpeg-data'),
    })
    await page.getByText('Suchen').click()
    await expect(page.locator('pre')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('pre')).toContainText('Testbauteil')
    await expect(page.locator('pre')).toContainText('"similarity": 0.87')
  })

})
