// src/app/api/parts/[id]/retry/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { db } from '@/lib/db'

// vi.mock() wird gehoisted — keine top-level-Variablen in der Factory (Entscheidung 05-02)
vi.mock('@/lib/db', () => ({ db: vi.fn() }))

const mockFetch = vi.fn()
global.fetch = mockFetch

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'
const makeParams = (id: string) => ({ params: Promise.resolve({ id }) })

describe('POST /api/parts/[id]/retry', () => {
  beforeEach(() => {
    vi.mocked(db).mockReset()
    mockFetch.mockReset()
    process.env.WORKER_URL = 'http://worker:8000'
  })

  it('setzt status="pending" in DB BEVOR Worker aufgerufen wird und gibt 202 zurück', async () => {
    vi.mocked(db)
      .mockResolvedValueOnce([{ id: VALID_UUID, status: 'failed' }])  // SELECT-Check
      .mockResolvedValueOnce(undefined)  // UPDATE status='pending'
    mockFetch.mockResolvedValueOnce({ ok: true })
    const req = new Request('http://localhost', { method: 'POST' })
    const res = await POST(req, makeParams(VALID_UUID))
    expect(res.status).toBe(202)
    // DB-Update muss VOR fetch aufgerufen worden sein (Assumption A4)
    const dbCallIndex = vi.mocked(db).mock.invocationCallOrder[1]
    const fetchCallIndex = mockFetch.mock.invocationCallOrder[0]
    expect(dbCallIndex).toBeLessThan(fetchCallIndex)
  })

  it('gibt 409 zurück wenn status != "failed"', async () => {
    vi.mocked(db).mockResolvedValueOnce([{ id: VALID_UUID, status: 'ready' }])
    const req = new Request('http://localhost', { method: 'POST' })
    const res = await POST(req, makeParams(VALID_UUID))
    expect(res.status).toBe(409)
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('gibt 400 zurück bei ungültiger UUID', async () => {
    const req = new Request('http://localhost', { method: 'POST' })
    const res = await POST(req, makeParams('keine-uuid'))
    expect(res.status).toBe(400)
  })

  it('gibt 404 zurück wenn Part nicht existiert', async () => {
    vi.mocked(db).mockResolvedValueOnce([])
    const req = new Request('http://localhost', { method: 'POST' })
    const res = await POST(req, makeParams(VALID_UUID))
    expect(res.status).toBe(404)
  })

  it('gibt 502 zurück wenn Worker nicht erreichbar', async () => {
    vi.mocked(db)
      .mockResolvedValueOnce([{ id: VALID_UUID, status: 'failed' }])
      .mockResolvedValueOnce(undefined)
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'))
    const req = new Request('http://localhost', { method: 'POST' })
    const res = await POST(req, makeParams(VALID_UUID))
    expect(res.status).toBe(502)
  })
})
