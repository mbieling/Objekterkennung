// src/app/api/parts/route.test.ts
// Tests für GET /api/parts — ADMIN-01
// Wave 1: Implementierungen aktiviert (ersetzt Wave-0-Stubs)

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: vi.fn(),
}))

import { GET } from './route'
import { db } from '@/lib/db'

const mockDb = vi.mocked(db)

describe('GET /api/parts', () => {
  beforeEach(() => { mockDb.mockReset() })

  it('gibt alle Teile als Array zurück', async () => {
    const fakeParts = [
      { id: '123e4567-e89b-12d3-a456-426614174000', name: 'Schraube M8', part_number: 'M8-001', project: 'Projekt A', status: 'ready', thumbnail_count: 8, created_at: '2026-05-01T10:00:00Z' },
      { id: '223e4567-e89b-12d3-a456-426614174001', name: 'Mutter M8', part_number: null, project: null, status: 'pending', thumbnail_count: 0, created_at: '2026-05-02T10:00:00Z' },
    ]
    mockDb.mockResolvedValueOnce(fakeParts)
    const response = await GET()
    const data = await response.json()
    expect(data.parts).toHaveLength(2)
    expect(data.parts[0].id).toBe('123e4567-e89b-12d3-a456-426614174000')
    expect(data.parts[0].name).toBe('Schraube M8')
  })

  it('gibt leeres Array zurück wenn keine Teile vorhanden', async () => {
    mockDb.mockResolvedValueOnce([])
    const response = await GET()
    const data = await response.json()
    expect(data.parts).toEqual([])
  })

  it('schließt das embedding-Feld aus der Response aus', async () => {
    mockDb.mockResolvedValueOnce([{ id: '123e4567-e89b-12d3-a456-426614174000', name: 'Test', status: 'ready', thumbnail_count: 0, created_at: '2026-05-01T10:00:00Z' }])
    const response = await GET()
    const data = await response.json()
    expect(data.parts[0]).not.toHaveProperty('embedding')
  })
})
