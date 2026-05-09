// src/app/api/parts/[id]/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH, DELETE } from './route'
import { db } from '@/lib/db'
import { s3 } from '@/lib/s3'

// vi.mock() wird gehoisted — keine top-level-Variablen in der Factory (Entscheidung 05-02)
vi.mock('@/lib/db', () => ({ db: vi.fn() }))
vi.mock('@/lib/s3', () => ({
  s3: { send: vi.fn() },
  BUCKET_STEPS: 'parts-steps',
  BUCKET_THUMBNAILS: 'parts-thumbnails',
}))
vi.mock('@aws-sdk/client-s3', () => ({
  // Constructor-kompatibles Mock: class statt arrow function (vi.fn().mockImplementation verliert `new`-Fähigkeit)
  DeleteObjectsCommand: vi.fn().mockImplementation(function (this: unknown, args: unknown) {
    return Object.assign(this as object, { ...(args as object), _type: 'DeleteObjectsCommand' })
  }),
}))

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'
const makeParams = (id: string) => ({ params: Promise.resolve({ id }) })

describe('PATCH /api/parts/[id]', () => {
  beforeEach(() => {
    vi.mocked(db).mockReset()
    vi.mocked(s3.send).mockReset()
  })

  it('aktualisiert Metadaten und gibt 200 zurück', async () => {
    vi.mocked(db)
      .mockResolvedValueOnce([{ id: VALID_UUID }])  // SELECT-Check
      .mockResolvedValueOnce([{ id: VALID_UUID, name: 'Neu', status: 'ready' }])  // UPDATE RETURNING
    const request = new Request('http://localhost', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Neu', status: 'ready' }),
    })
    const res = await PATCH(request, makeParams(VALID_UUID))
    expect(res.status).toBe(200)
  })

  it('gibt 400 zurück bei ungültiger UUID', async () => {
    const request = new Request('http://localhost', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' }),
    })
    const res = await PATCH(request, makeParams('nicht-eine-uuid'))
    expect(res.status).toBe(400)
  })

  it('gibt 404 zurück wenn Part nicht existiert', async () => {
    vi.mocked(db).mockResolvedValueOnce([])
    const request = new Request('http://localhost', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' }),
    })
    const res = await PATCH(request, makeParams(VALID_UUID))
    expect(res.status).toBe(404)
  })

  it('lehnt status="archived" im Body ab', async () => {
    vi.mocked(db).mockResolvedValueOnce([{ id: VALID_UUID }])
    const request = new Request('http://localhost', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'archived' }),
    })
    const res = await PATCH(request, makeParams(VALID_UUID))
    expect(res.status).toBe(400)
  })
})

describe('DELETE /api/parts/[id]', () => {
  beforeEach(() => {
    vi.mocked(db).mockReset()
    vi.mocked(s3.send).mockReset()
  })

  it('ruft DeleteObjectsCommand (Batch) auf und löscht danach DB-Zeile', async () => {
    vi.mocked(db)
      .mockResolvedValueOnce([{ id: VALID_UUID }])  // SELECT-Check
      .mockResolvedValueOnce(undefined)  // DELETE
    vi.mocked(s3.send).mockResolvedValue({} as never)
    const request = new Request('http://localhost', { method: 'DELETE' })
    const res = await DELETE(request, makeParams(VALID_UUID))
    expect(vi.mocked(s3.send)).toHaveBeenCalledTimes(2)  // 2x DeleteObjectsCommand
    const s3Calls = vi.mocked(s3.send).mock.calls
    // Erster Call: BUCKET_STEPS
    expect(s3Calls[0][0]).toMatchObject({ Bucket: 'parts-steps' })
    // Zweiter Call: BUCKET_THUMBNAILS
    expect(s3Calls[1][0]).toMatchObject({ Bucket: 'parts-thumbnails' })
    expect(res.status).toBe(200)
  })

  it('gibt 400 zurück bei ungültiger UUID', async () => {
    const request = new Request('http://localhost', { method: 'DELETE' })
    const res = await DELETE(request, makeParams('nicht-eine-uuid'))
    expect(res.status).toBe(400)
    expect(vi.mocked(s3.send)).not.toHaveBeenCalled()
  })

  it('gibt 404 zurück wenn Part nicht existiert', async () => {
    vi.mocked(db).mockResolvedValueOnce([])
    const request = new Request('http://localhost', { method: 'DELETE' })
    const res = await DELETE(request, makeParams(VALID_UUID))
    expect(res.status).toBe(404)
    expect(vi.mocked(s3.send)).not.toHaveBeenCalled()
  })
})
