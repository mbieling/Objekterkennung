// src/app/api/upload/init/route.test.ts
// Tests für POST /api/upload/init
// SC#1: Duplikat-SHA-256 → HTTP 409 mit existing_part_id
// SC#2: Gültiger Init → DB-Insert + Presigned URL
// INGEST-04: SHA-256-Deduplizierung

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// Mocks für server-only Module
vi.mock('@/lib/db', () => ({
  db: vi.fn(),
}))
vi.mock('@/lib/s3', () => ({
  s3: {},
  BUCKET_STEPS: 'mock-bucket-steps',
  BUCKET_THUMBNAILS: 'mock-bucket-thumbnails',
}))
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/mock-presigned-url'),
}))

import { db } from '@/lib/db'
const mockDb = vi.mocked(db)

describe('POST /api/upload/init', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const validBody = {
    name: 'Flansch A',
    sha256: 'a'.repeat(64),  // 64 hex chars
    original_filename: 'flansch_a.step',
    file_size_bytes: 1024 * 1024,  // 1 MB
  }

  it('gibt HTTP 409 zurück wenn SHA-256 bereits in der Datenbank existiert (INGEST-04)', async () => {
    // Arrange: DB gibt existing part zurück bei SHA-256-Lookup
    const existingId = '123e4567-e89b-12d3-a456-426614174000'
    mockDb.mockResolvedValueOnce([{ id: existingId }])  // SELECT sha256 → Treffer

    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    })

    // Act
    const response = await POST(request)
    const data = await response.json()

    // Assert
    expect(response.status).toBe(409)
    expect(data.error).toBe('Duplicate file')
    expect(data.existing_part_id).toBe(existingId)
  })

  it('gibt HTTP 200 mit part_id und presigned_url zurück bei gültigem Init-Request', async () => {
    // Arrange: kein Duplikat, Insert erfolgreich
    const newPartId = '456e7890-e89b-12d3-a456-426614174000'
    mockDb
      .mockResolvedValueOnce([])                        // SELECT sha256 → kein Treffer
      .mockResolvedValueOnce([{ id: newPartId }])       // INSERT RETURNING id

    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validBody),
    })

    // Act
    const response = await POST(request)
    const data = await response.json()

    // Assert
    expect(response.status).toBe(200)
    expect(data.part_id).toBe(newPartId)
    expect(data.presigned_url).toContain('https://')
  })

  it('gibt HTTP 400 zurück bei fehlendem Pflichtfeld name', async () => {
    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, name: '' }),  // Leerer name → Zod-Fehler
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('gibt HTTP 400 zurück wenn sha256 nicht 64 Hex-Zeichen hat', async () => {
    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, sha256: 'zu-kurz' }),
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })

  it('gibt HTTP 400 zurück wenn file_size_bytes über 100 MB liegt', async () => {
    const { POST } = await import('./route')
    const request = new Request('http://localhost/api/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...validBody, file_size_bytes: 101 * 1024 * 1024 }),
    })

    const response = await POST(request)
    expect(response.status).toBe(400)
  })
})
