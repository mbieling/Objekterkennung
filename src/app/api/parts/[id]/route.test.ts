// src/app/api/parts/[id]/route.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PATCH, DELETE } from './route'

const mockDb = vi.fn()
vi.mock('@/lib/db', () => ({ db: mockDb }))

const mockS3Send = vi.fn()
vi.mock('@/lib/s3', () => ({
  s3: { send: mockS3Send },
  BUCKET_STEPS: 'parts-steps',
  BUCKET_THUMBNAILS: 'parts-thumbnails',
}))
vi.mock('@aws-sdk/client-s3', () => ({
  DeleteObjectsCommand: vi.fn().mockImplementation((args) => ({ ...args, _type: 'DeleteObjectsCommand' })),
}))

const VALID_UUID = '123e4567-e89b-12d3-a456-426614174000'
const makeParams = (id: string) => ({ params: Promise.resolve({ id }) })

describe('PATCH /api/parts/[id]', () => {
  beforeEach(() => { mockDb.mockReset(); mockS3Send.mockReset() })

  it('aktualisiert Metadaten und gibt 200 zurück', async () => {
    mockDb
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
    mockDb.mockResolvedValueOnce([])
    const request = new Request('http://localhost', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test' }),
    })
    const res = await PATCH(request, makeParams(VALID_UUID))
    expect(res.status).toBe(404)
  })

  it('lehnt status="archived" im Body ab', async () => {
    mockDb.mockResolvedValueOnce([{ id: VALID_UUID }])
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
  beforeEach(() => { mockDb.mockReset(); mockS3Send.mockReset() })

  it('ruft DeleteObjectsCommand (Batch) auf und löscht danach DB-Zeile', async () => {
    mockDb
      .mockResolvedValueOnce([{ id: VALID_UUID }])  // SELECT-Check
      .mockResolvedValueOnce(undefined)  // DELETE
    mockS3Send.mockResolvedValue({})
    const request = new Request('http://localhost', { method: 'DELETE' })
    const res = await DELETE(request, makeParams(VALID_UUID))
    expect(mockS3Send).toHaveBeenCalledTimes(2)  // 2x DeleteObjectsCommand: parts-steps + parts-thumbnails
    const s3Calls = mockS3Send.mock.calls
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
    expect(mockS3Send).not.toHaveBeenCalled()
  })

  it('gibt 404 zurück wenn Part nicht existiert', async () => {
    mockDb.mockResolvedValueOnce([])
    const request = new Request('http://localhost', { method: 'DELETE' })
    const res = await DELETE(request, makeParams(VALID_UUID))
    expect(res.status).toBe(404)
    expect(mockS3Send).not.toHaveBeenCalled()
  })
})
