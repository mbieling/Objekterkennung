// tests/phase-09-part-detail.spec.ts
// E2E-Tests für Phase 9: Part Detail (DETAIL-01, DETAIL-02)
// Aktiviert in Plan 09-04 (Wave 3) — alle Tests grün nach vollständiger Implementierung.

import { test, expect } from '@playwright/test'

const mockPart = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Flansch M12',
  part_number: 'FL-042',
  project: 'Getriebe',
  status: 'ready',
  thumbnail_count: 2,
  created_at: '2026-05-09T10:00:00.000Z',
}

const TEST_PART_ID = '550e8400-e29b-41d4-a716-446655440000'

async function setupMocks(page: import('@playwright/test').Page) {
  await page.route(`**/api/parts/${TEST_PART_ID}`, async route => {
    // Nur GET abfangen (nicht PATCH/DELETE)
    if (route.request().method() !== 'GET') {
      await route.continue()
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ part: mockPart }),
    })
  })
  await page.route(`**/api/parts/${TEST_PART_ID}/thumbnails`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ urls: [] }),
    })
  })
  await page.route(`**/api/parts/${TEST_PART_ID}/download`, async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ url: 'https://s3.example.com/test.step', filename: 'Flansch_M12.step' }),
    })
  })
}

test.describe('Phase 9: Part Detail', () => {
  test('DETAIL-01: Detailseite zeigt alle Metadatenfelder', async ({ page }) => {
    await setupMocks(page)
    await page.goto(`/parts/${TEST_PART_ID}`)
    await expect(page.getByText('Flansch M12')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('FL-042')).toBeVisible()
    await expect(page.getByText('Getriebe')).toBeVisible()
    await expect(page.getByText('Bereit')).toBeVisible()
  })

  test('DETAIL-01: "← Zurück zur Suche"-Link sichtbar', async ({ page }) => {
    await setupMocks(page)
    await page.goto(`/parts/${TEST_PART_ID}`)
    await expect(page.getByText('Zurück zur Suche')).toBeVisible({ timeout: 10_000 })
  })

  test('DETAIL-02: Download-Button für ready-Part aktiviert', async ({ page }) => {
    await setupMocks(page)
    await page.goto(`/parts/${TEST_PART_ID}`)
    const downloadBtn = page.getByRole('button', { name: /STEP herunterladen/i })
    await expect(downloadBtn).toBeVisible({ timeout: 10_000 })
    await expect(downloadBtn).not.toBeDisabled()
  })

  test('DETAIL-02: Download-Button ruft /download-Endpunkt auf bei Klick', async ({ page }) => {
    await setupMocks(page)

    // Download-Endpoint-Call tracken
    let downloadCalled = false
    await page.route(`**/api/parts/${TEST_PART_ID}/download`, async route => {
      downloadCalled = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: 'https://s3.example.com/test.step', filename: 'Flansch_M12.step' }),
      })
    })

    await page.goto(`/parts/${TEST_PART_ID}`)
    const downloadBtn = page.getByRole('button', { name: /STEP herunterladen/i })
    await expect(downloadBtn).toBeVisible({ timeout: 10_000 })
    await downloadBtn.click()

    // Kurz warten damit fetch() abgeschlossen werden kann
    await page.waitForTimeout(500)
    expect(downloadCalled).toBe(true)
  })
})
