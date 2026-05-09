// src/app/api/parts/[id]/archive/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from './route'
import { db } from '@/lib/db'

// vi.mock() wird gehoisted — keine top-level-Variablen in der Factory (Entscheidung 05-02)
vi.mock('@/lib/db', () => ({ db: vi.fn() }))

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'
const makeParams = (id: string) => ({ params: Promise.resolve({ id }) })

describe('POST /api/parts/[id]/archive', () => {
  beforeEach(() => { vi.mocked(db).mockReset() })

  it('setzt status="archived" und gibt 200 zurück', async () => {
    vi.mocked(db)
      .mockResolvedValueOnce([{ id: VALID_UUID }])  // SELECT-Check
      .mockResolvedValueOnce(undefined)  // UPDATE
    const req = new Request('http://localhost', { method: 'POST' })
    const res = await POST(req, makeParams(VALID_UUID))
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.status).toBe('archived')
    // is_archived-Boolean darf NICHT beschrieben werden (RESEARCH.md DB-Schema)
    const updateCall = vi.mocked(db).mock.calls.find(c => String(c[0]).includes('UPDATE'))
    expect(String(updateCall?.[0] ?? '')).not.toContain('is_archived')
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
})
