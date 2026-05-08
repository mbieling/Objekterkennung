// src/app/api/upload/confirm/route.test.ts
// Tests für POST /api/upload/confirm
// SC#3: HTTP 202 bei gültigem Confirm-Request
// Worker-Enqueue: fetch auf WORKER_URL/enqueue

import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/db', () => ({
  db: vi.fn(),
}))

// fetch global mocken (Worker-HTTP-Aufruf)
const mockFetch = vi.fn()
global.fetch = mockFetch

import { db } from '@/lib/db'
const mockDb = vi.mocked(db)

describe('POST /api/upload/confirm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.WORKER_URL = 'http://localhost:8000'
  })

  const validPartId = '123e4567-e89b-12d3-a456-426614174000'

  it('gibt HTTP 202 zurück und ruft Worker /enqueue auf', async () => {
    // Arrange: Part existiert in DB
    mockDb.mockResolvedValueOnce([{ id: validPartId, status: 'pending' }])
    // Worker antwortet erfolgreich
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ task_id: 'abc' }) })

    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/upload/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ part_id: validPartId }),
    })

    // Act
    const response = await POST(request)
    const data = await response.json()

    // Assert
    expect(response.status).toBe(202)
    expect(data.part_id).toBe(validPartId)
    expect(data.status).toBe('pending')
    // Worker wurde aufgerufen
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:8000/enqueue',
      expect.objectContaining({ method: 'POST' })
    )
  })

  it('gibt HTTP 404 zurück wenn part_id nicht in der Datenbank existiert', async () => {
    mockDb.mockResolvedValueOnce([])  // Kein Part gefunden

    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/upload/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ part_id: validPartId }),
    })

    const response = await POST(request)
    expect(response.status).toBe(404)
  })

  it('gibt HTTP 502 zurück wenn Worker nicht erreichbar ist', async () => {
    mockDb.mockResolvedValueOnce([{ id: validPartId, status: 'pending' }])
    mockFetch.mockResolvedValueOnce({ ok: false, status: 503 })

    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/upload/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ part_id: validPartId }),
    })

    const response = await POST(request)
    expect(response.status).toBe(502)
  })

  it('gibt HTTP 400 zurück bei ungültiger UUID-part_id', async () => {
    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/upload/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ part_id: 'nicht-eine-uuid' }),
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })
})
