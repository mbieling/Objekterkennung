// src/app/api/parts/[id]/status/route.test.ts
// Tests für GET /api/parts/[id]/status (D-05, INGEST-02)

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

  it('gibt HTTP 200 mit status und thumbnail_count zurück bei vorhandener UUID (INGEST-02)', async () => {
    mockDb.mockResolvedValueOnce([{ status: 'processing', thumbnail_count: 2 }])
    const { GET } = await import('./route')
    const response = await GET(
      new Request(`http://localhost/api/parts/${validUuid}/status`),
      { params: Promise.resolve({ id: validUuid }) }
    )
    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.status).toBe('processing')
    expect(data.thumbnail_count).toBe(2)
  })

  it('gibt HTTP 404 zurück für unbekannte UUID', async () => {
    mockDb.mockResolvedValueOnce([])  // kein Treffer
    const { GET } = await import('./route')
    const response = await GET(
      new Request(`http://localhost/api/parts/${validUuid}/status`),
      { params: Promise.resolve({ id: validUuid }) }
    )
    const data = await response.json()
    expect(response.status).toBe(404)
    expect(data.error).toBe('Part not found')
  })

  it('gibt HTTP 400 zurück für ungültige UUID-Form', async () => {
    const { GET } = await import('./route')
    const response = await GET(
      new Request('http://localhost/api/parts/nicht-eine-uuid/status'),
      { params: Promise.resolve({ id: 'nicht-eine-uuid' }) }
    )
    const data = await response.json()
    expect(response.status).toBe(400)
    expect(data.error).toBe('Invalid id')
    // DB MUSS NICHT aufgerufen worden sein
    expect(mockDb).not.toHaveBeenCalled()
  })
})
