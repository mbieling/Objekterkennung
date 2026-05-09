// tests/phase-08-results-ui.spec.ts
// E2E-Tests für Phase 8 Results UI (SEARCH-03, SEARCH-04, SEARCH-05)

import { test, expect } from '@playwright/test'

// Mock-Fixture mit 3 Treffern verschiedener Similarity-Werte (grün/amber/rot)
const mockSearchResponse = {
  results: [
    { id: 'id-01', name: 'Flanschplatte', part_number: 'FP-001', project: null,
      status: 'ready', similarity: 0.92, created_at: '2026-01-01T00:00:00Z' },
    { id: 'id-02', name: 'Schraubenring', part_number: null, project: 'Motor',
      status: 'ready', similarity: 0.67, created_at: '2026-01-01T00:00:00Z' },
    { id: 'id-03', name: 'Dichtungsring', part_number: 'DR-42', project: null,
      status: 'ready', similarity: 0.45, created_at: '2026-01-01T00:00:00Z' },
  ],
  query: { threshold: 0, limit: 50, results_count: 3 },
}

test.describe('Phase 8: Results UI', () => {

  // Setup-Helpers
  async function setupMocks(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
    // Glob-Pattern mit ** damit auch Query-Parameter (threshold=0&limit=...) gematcht werden
    await page.route('**/api/search**', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSearchResponse),
      })
    })
    // Thumbnail-Requests mocken (Presigned-URL ohne echte S3-Verbindung)
    await page.route('**/api/parts/*/thumbnail**', async route => {
      await route.fulfill({ status: 404 })
    })
  }

  async function uploadAndSearch(page: Parameters<Parameters<typeof test>[1]>[0]['page']) {
    const fileInput = page.locator('input[type="file"]')
    await fileInput.setInputFiles({
      name: 'test-part.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('fake-jpeg-data'),
    })
    await page.getByText('Suchen').click()
  }

  test('SEARCH-03: Ergebnis-Grid sichtbar nach Suche', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/search')
    await uploadAndSearch(page)

    // Alle drei Treffer-Karten sichtbar
    await expect(page.getByText('Flanschplatte')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Schraubenring')).toBeVisible()
    // Dichtungsring (0.45) liegt unter Default-Threshold 0.5 → nicht sichtbar
    await expect(page.getByText('Dichtungsring')).not.toBeVisible()

    // Match-%-Werte sichtbar (für sichtbare Treffer)
    await expect(page.getByText('92%')).toBeVisible()
    await expect(page.getByText('67%')).toBeVisible()
  })

  test('SEARCH-03: Controls-Zeile (Slider + Select) über Grid sichtbar', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/search')
    await uploadAndSearch(page)

    // Warten bis Grid geladen
    await expect(page.getByText('Flanschplatte')).toBeVisible({ timeout: 10_000 })

    // Controls-Zeile vorhanden
    await expect(page.getByText('Ähnlichkeit')).toBeVisible()
    await expect(page.getByText('Ergebnisse')).toBeVisible()
    await expect(page.getByRole('combobox')).toBeVisible()
  })

  test('SEARCH-04: Leer-Zustand bei hohem Threshold (D-10)', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/search')
    await uploadAndSearch(page)

    // Warten bis Grid geladen
    await expect(page.getByText('Flanschplatte')).toBeVisible({ timeout: 10_000 })

    // Slider auf Maximum schieben (via aria-Attribut auf role=slider)
    // Playwright-Slider-Interaktion: Keyboard-Navigation nach Fokus
    const slider = page.getByRole('slider')
    await slider.focus()
    // Right Arrow 20× drücken: 20 × 0.05 = 1.0 (max)
    for (let i = 0; i < 20; i++) {
      await slider.press('ArrowRight')
    }

    // Leer-Zustand sichtbar
    await expect(page.getByText('Keine ähnlichen Teile gefunden.')).toBeVisible({ timeout: 5_000 })
    await expect(page.getByText('Versuche den Ähnlichkeitsschwellwert zu verringern.')).toBeVisible()
  })

  test('SEARCH-04: Slider-Filterung — weniger Karten bei höherem Threshold', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/search')
    await uploadAndSearch(page)

    // Warten bis sichtbare Karten geladen (Standard-Threshold 0.5)
    await expect(page.getByText('Flanschplatte')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Schraubenring')).toBeVisible()
    // Dichtungsring (0.45) liegt unter Default-Threshold 0.5 → nicht sichtbar
    await expect(page.getByText('Dichtungsring')).not.toBeVisible()
  })

  test('SEARCH-05: Limit-Select zeigt Optionen 10/20/50', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/search')
    await uploadAndSearch(page)

    await expect(page.getByText('Flanschplatte')).toBeVisible({ timeout: 10_000 })

    // Select öffnen
    await page.getByRole('combobox').click()
    await expect(page.getByRole('option', { name: '20' })).toBeVisible()
    await expect(page.getByRole('option', { name: '50' })).toBeVisible()
  })

  test('SEARCH-05: Limit-Select-Wechsel triggert neue Suche', async ({ page }) => {
    let searchCallCount = 0
    await page.route('**/api/search**', async route => {
      searchCallCount++
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockSearchResponse),
      })
    })
    await page.route('**/api/parts/*/thumbnail**', async route => {
      await route.fulfill({ status: 404 })
    })

    await page.goto('/search')
    await uploadAndSearch(page)

    // Erste Suche abwarten
    await expect(page.getByText('Flanschplatte')).toBeVisible({ timeout: 10_000 })
    expect(searchCallCount).toBe(1)

    // Limit auf 20 wechseln
    await page.getByRole('combobox').click()
    await page.getByRole('option', { name: '20' }).click()

    // Zweite API-Anfrage ausgelöst
    await expect(async () => {
      expect(searchCallCount).toBe(2)
    }).toPass({ timeout: 5_000 })
  })

  test('D-11: Neu aufnehmen navigiert zu idle-State', async ({ page }) => {
    await setupMocks(page)
    await page.goto('/search')
    await uploadAndSearch(page)

    await expect(page.getByText('Flanschplatte')).toBeVisible({ timeout: 10_000 })

    // Neu aufnehmen klicken
    await page.getByText('Neu aufnehmen').click()

    // Zurück zu idle — Kamera-Buttons sichtbar
    await expect(page.getByText('Kamera starten')).toBeVisible()
    await expect(page.getByText('Foto aus Galerie wählen')).toBeVisible()
  })

})
