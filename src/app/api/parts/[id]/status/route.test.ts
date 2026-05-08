// src/app/api/parts/[id]/status/route.test.ts
// Tests für GET /api/parts/[id]/status (D-05, INGEST-02)
// STUBS — Logik wird in Plan 02 (Wave 1) implementiert.

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: vi.fn(),
}))

import { db } from '@/lib/db'
const mockDb = vi.mocked(db)

describe('GET /api/parts/[id]/status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const validUuid = '123e4567-e89b-12d3-a456-426614174000'

  it.skip('gibt HTTP 200 mit status und thumbnail_count zurück bei vorhandener UUID (INGEST-02)', async () => {
    // STUB — Plan 02
  })

  it.skip('gibt HTTP 404 zurück für unbekannte UUID', async () => {
    // STUB — Plan 02
  })

  it.skip('gibt HTTP 400 zurück für ungültige UUID-Form', async () => {
    // STUB — Plan 02
  })
})
