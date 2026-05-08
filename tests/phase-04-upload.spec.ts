// tests/phase-04-upload.spec.ts
// E2E-Test für Phase 4 Ingestion UI (INGEST-01, INGEST-02)
// STUB — manueller Test bis Live-Worker via docker-compose verfügbar.

import { test, expect } from '@playwright/test'

test.describe('Phase 4: Ingestion UI', () => {
  test.skip('happy path: file picker → metadata → submit → status updates → thumbnail visible', async ({ page }) => {
    // STUB — manueller Test bis Live-Worker
  })

  test.skip('duplicate file shows inline alert with existing part id', async ({ page }) => {
    // STUB — manueller Test bis Live-Worker
  })
})
