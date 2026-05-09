// src/app/api/parts/route.test.ts
// Tests für GET /api/parts — ADMIN-01
// Phase 10 — SC-4: Serverseitige Pagination (?page=N&limit=20)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  db: vi.fn(),
}))

import { GET } from './route'
import { db } from '@/lib/db'

const mockDb = vi.mocked(db)

function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/parts')
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
  return new NextRequest(url.toString())
}

describe('GET /api/parts', () => {
  beforeEach(() => { mockDb.mockReset() })

  it('gibt paginierte Teile und total_count zurück', async () => {
    const fakeParts = [
      { id: '123e4567-e89b-12d3-a456-426614174000', name: 'Schraube M8', part_number: 'M8-001', project: 'Projekt A', status: 'ready', thumbnail_count: 8, created_at: '2026-05-01T10:00:00Z' },
      { id: '223e4567-e89b-12d3-a456-426614174001', name: 'Mutter M8', part_number: null, project: null, status: 'pending', thumbnail_count: 0, created_at: '2026-05-02T10:00:00Z' },
    ]
    mockDb.mockResolvedValueOnce(fakeParts)          // rows
    mockDb.mockResolvedValueOnce([{ total: 2 }])    // count
    const response = await GET(makeRequest())
    const data = await response.json()
    expect(data.parts).toHaveLength(2)
    expect(data.parts[0].id).toBe('123e4567-e89b-12d3-a456-426614174000')
    expect(data.total_count).toBe(2)
    expect(data.total_pages).toBe(1)
    expect(data.page).toBe(1)
  })

  it('gibt leeres Array und total_count 0 zurück wenn keine Teile vorhanden', async () => {
    mockDb.mockResolvedValueOnce([])
    mockDb.mockResolvedValueOnce([{ total: 0 }])
    const response = await GET(makeRequest())
    const data = await response.json()
    expect(data.parts).toEqual([])
    expect(data.total_count).toBe(0)
    expect(data.total_pages).toBe(1)
  })

  it('schließt das embedding-Feld aus der Response aus', async () => {
    mockDb.mockResolvedValueOnce([{ id: '123e4567-e89b-12d3-a456-426614174000', name: 'Test', status: 'ready', thumbnail_count: 0, created_at: '2026-05-01T10:00:00Z' }])
    mockDb.mockResolvedValueOnce([{ total: 1 }])
    const response = await GET(makeRequest())
    const data = await response.json()
    expect(data.parts[0]).not.toHaveProperty('embedding')
  })

  it('gibt HTTP 400 zurück bei ungültigem page-Parameter', async () => {
    const response = await GET(makeRequest({ page: '0' }))
    expect(response.status).toBe(400)
    const data = await response.json()
    expect(data.error).toBeDefined()
  })

  it('filtert nach status wenn angegeben', async () => {
    mockDb.mockResolvedValueOnce([])
    mockDb.mockResolvedValueOnce([{ total: 0 }])
    const response = await GET(makeRequest({ status: 'failed' }))
    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data.parts).toEqual([])
  })
})
