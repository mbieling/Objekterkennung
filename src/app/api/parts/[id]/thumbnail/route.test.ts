// src/app/api/parts/[id]/thumbnail/route.test.ts
// Tests für GET /api/parts/[id]/thumbnail (D-08, INGEST-02)

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { s3 } from '@/lib/s3'

vi.mock('@/lib/db', () => ({
  db: vi.fn(),
}))
vi.mock('@/lib/s3', () => ({
  s3: { send: vi.fn() },
  BUCKET_STEPS: 'mock-bucket-steps',
  BUCKET_THUMBNAILS: 'mock-bucket-thumbnails',
}))
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/mock-thumb-url'),
}))

import { db } from '@/lib/db'
const mockDb = vi.mocked(db)
const mockS3Send = vi.mocked(
  (s3 as unknown as { send: (...a: unknown[]) => unknown }).send
)
const mockGetSignedUrl = vi.mocked(getSignedUrl)

describe('GET /api/parts/[id]/thumbnail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const validUuid = '123e4567-e89b-12d3-a456-426614174000'

  it('gibt HTTP 200 mit Presigned-URL zurück bei status=ready (INGEST-02)', async () => {
    mockDb.mockResolvedValueOnce([{ status: 'ready' }])
    mockS3Send.mockResolvedValueOnce({})  // HeadObject success
    const { GET } = await import('./route')
    const response = await GET(
      new Request(`http://localhost/api/parts/${validUuid}/thumbnail`),
      { params: Promise.resolve({ id: validUuid }) }
    )
    const data = await response.json()
    expect(response.status).toBe(200)
    expect(data.url).toContain('https://')
    expect(mockGetSignedUrl).toHaveBeenCalledWith(
      expect.anything(),
      expect.any(GetObjectCommand),
      { expiresIn: 60 }
    )
  })

  it('gibt HTTP 404 zurück für unbekannte UUID', async () => {
    mockDb.mockResolvedValueOnce([])
    const { GET } = await import('./route')
    const response = await GET(
      new Request(`http://localhost/api/parts/${validUuid}/thumbnail`),
      { params: Promise.resolve({ id: validUuid }) }
    )
    const data = await response.json()
    expect(response.status).toBe(404)
    expect(data.error).toBe('Part not found')
    expect(mockS3Send).not.toHaveBeenCalled()
    expect(mockGetSignedUrl).not.toHaveBeenCalled()
  })

  it('gibt HTTP 409 zurück wenn status !== ready', async () => {
    mockDb.mockResolvedValueOnce([{ status: 'processing' }])
    const { GET } = await import('./route')
    const response = await GET(
      new Request(`http://localhost/api/parts/${validUuid}/thumbnail`),
      { params: Promise.resolve({ id: validUuid }) }
    )
    const data = await response.json()
    expect(response.status).toBe(409)
    expect(data.error).toBe('Thumbnail not ready')
    expect(mockS3Send).not.toHaveBeenCalled()
  })

  it('gibt HTTP 400 zurück für ungültige UUID-Form', async () => {
    const { GET } = await import('./route')
    const response = await GET(
      new Request('http://localhost/api/parts/keine-uuid/thumbnail'),
      { params: Promise.resolve({ id: 'keine-uuid' }) }
    )
    expect(response.status).toBe(400)
    expect(mockDb).not.toHaveBeenCalled()
    expect(mockS3Send).not.toHaveBeenCalled()
  })

  it('gibt HTTP 404 zurück wenn Thumbnail-Objekt in S3 fehlt', async () => {
    mockDb.mockResolvedValueOnce([{ status: 'ready' }])
    mockS3Send.mockRejectedValueOnce(new Error('NoSuchKey'))  // HeadObject fail
    const { GET } = await import('./route')
    const response = await GET(
      new Request(`http://localhost/api/parts/${validUuid}/thumbnail`),
      { params: Promise.resolve({ id: validUuid }) }
    )
    const data = await response.json()
    expect(response.status).toBe(404)
    expect(data.error).toBe('Thumbnail object missing')
    expect(mockGetSignedUrl).not.toHaveBeenCalled()
  })
})
