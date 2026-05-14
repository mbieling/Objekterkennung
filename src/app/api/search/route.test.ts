// src/app/api/search/route.test.ts
// Tests für POST /api/search
// SEARCH-03: HTTP 200 mit Treffern, leere Ergebnisse, Worker-Fehler 502
// SEARCH-04: Threshold-Parameter, ungültiger Threshold 400
// SEARCH-05: Limit-Parameter, ungültiges Limit 400
// Eingabe-Validierung: fehlendes image-Feld 400

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/db', () => ({
  db: vi.fn(),
}))
vi.mock('@/lib/s3', () => ({
  s3: { send: vi.fn() },
  BUCKET_THUMBNAILS: 'mock-bucket-thumbnails',
}))

const mockFetch = vi.fn()
global.fetch = mockFetch

import { db } from '@/lib/db'
import { s3 } from '@/lib/s3'
const mockDb = vi.mocked(db)
const mockS3Send = vi.mocked(s3.send)

// Hilfsfunktion: NextRequest erstellen und formData-Methode mit image-File mocken
function makeImageRequest(url = 'http://localhost/api/search'): NextRequest {
  const request = new NextRequest(url, {
    method: 'POST',
    body: 'placeholder',
    headers: { 'Content-Type': 'text/plain' },
  })
  const formData = new FormData()
  const imageFile = new File(['fake-image-data'], 'test.jpg', { type: 'image/jpeg' })
  formData.append('image', imageFile)
  vi.spyOn(request, 'formData').mockResolvedValue(formData)
  return request
}

// Hilfsfunktion: NextRequest mit N image-Files (FormData kann denselben Key mehrfach haben)
function makeMultiImageRequest(count: number, url = 'http://localhost/api/search'): NextRequest {
  const request = new NextRequest(url, {
    method: 'POST',
    body: 'placeholder',
    headers: { 'Content-Type': 'text/plain' },
  })
  const formData = new FormData()
  for (let i = 0; i < count; i++) {
    formData.append('image', new File([`fake-${i}`], `test-${i}.jpg`, { type: 'image/jpeg' }))
  }
  vi.spyOn(request, 'formData').mockResolvedValue(formData)
  return request
}

// Hilfsfunktion: NextRequest ohne image-Feld erstellen
function makeRequestWithoutImage(url = 'http://localhost/api/search'): NextRequest {
  const request = new NextRequest(url, {
    method: 'POST',
    body: 'placeholder',
    headers: { 'Content-Type': 'text/plain' },
  })
  const formData = new FormData()
  // Absichtlich kein 'image'-Feld
  vi.spyOn(request, 'formData').mockResolvedValue(formData)
  return request
}

// Hilfsfunktion: DB-Trefferzeile erstellen.
// Default-ID ist fest, damit Multi-Row-Mocks in Single-Photo-Tests bewusst denselben
// Part repräsentieren (deduplizierung greift). Tests, die N unterschiedliche Parts
// brauchen, übergeben eine explizite ID.
function makeDbRow(similarity: string | number = '0.85', id = '123e4567-e89b-12d3-a456-426614174000') {
  return {
    id,
    name: 'Testbauteil',
    part_number: 'PN-001',
    project: 'Testprojekt',
    status: 'ready',
    similarity,
    created_at: '2024-01-01T00:00:00.000Z',
  }
}

describe('POST /api/search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.WORKER_URL = 'http://localhost:8000'
    // S3 send standardmäßig erfolgreich
    mockS3Send.mockResolvedValue({} as never)
    // Worker antwortet standardmäßig mit gültigem Embedding
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: new Array(1024).fill(0.1) }),
    })
  })

  // SEARCH-03: Gerankete Treffer mit similarity-Score
  it('gibt HTTP 200 mit geranketen Treffern zurück wenn Treffer vorhanden (SEARCH-03)', async () => {
    mockDb.mockResolvedValueOnce([makeDbRow('0.85')])

    const { POST } = await import('./route')
    const request = makeImageRequest()

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.results).toHaveLength(1)
    expect(data.results[0].similarity).toBe(0.85)
    expect(typeof data.results[0].similarity).toBe('number')
    expect(data.query.threshold).toBe(0.7)
  })

  it('gibt HTTP 200 mit leerem results-Array zurück wenn keine Treffer gefunden (SEARCH-03)', async () => {
    mockDb.mockResolvedValueOnce([])

    const { POST } = await import('./route')
    const request = makeImageRequest()

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.results).toHaveLength(0)
    expect(data.query.results_count).toBe(0)
  })

  it('gibt HTTP 502 zurück wenn Worker nicht erreichbar ist (SEARCH-03)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))

    const { POST } = await import('./route')
    const request = makeImageRequest()

    const response = await POST(request)

    expect(response.status).toBe(502)
    // S3 PutObject (Upload) + DeleteObject (Cleanup) = 2 Aufrufe
    expect(mockS3Send).toHaveBeenCalledTimes(2)
  })

  it('gibt HTTP 502 zurück wenn Worker einen Fehler zurückgibt (SEARCH-03)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    const { POST } = await import('./route')
    const request = makeImageRequest()

    const response = await POST(request)

    expect(response.status).toBe(502)
    // S3 PutObject (Upload) + DeleteObject (Cleanup) = 2 Aufrufe
    expect(mockS3Send).toHaveBeenCalledTimes(2)
  })

  // SEARCH-04: Threshold-Filter
  it('schließt Treffer unter dem Schwellwert aus (SEARCH-04)', async () => {
    mockDb.mockResolvedValueOnce([makeDbRow('0.9')])

    const { POST } = await import('./route')
    const request = makeImageRequest('http://localhost/api/search?threshold=0.8')

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.query.threshold).toBe(0.8)
  })

  it('gibt HTTP 400 zurück bei ungültigem threshold-Parameter (SEARCH-04)', async () => {
    const { POST } = await import('./route')
    const request = makeImageRequest('http://localhost/api/search?threshold=1.5')

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(mockS3Send).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  // SEARCH-05: Limit-Parameter
  it('begrenzt die Anzahl der Treffer per limit-Parameter (SEARCH-05)', async () => {
    // Drei unterschiedliche Parts — sonst dedupliziert der Multi-Foto-Merge zu einem Eintrag
    const rows = [
      makeDbRow('0.95', '11111111-1111-1111-1111-111111111111'),
      makeDbRow('0.90', '22222222-2222-2222-2222-222222222222'),
      makeDbRow('0.85', '33333333-3333-3333-3333-333333333333'),
    ]
    mockDb.mockResolvedValueOnce(rows)

    const { POST } = await import('./route')
    const request = makeImageRequest('http://localhost/api/search?limit=3')

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.query.limit).toBe(3)
    expect(data.results).toHaveLength(3)
  })

  it('gibt HTTP 400 zurück bei ungültigem limit-Parameter (SEARCH-05)', async () => {
    const { POST } = await import('./route')
    const request = makeImageRequest('http://localhost/api/search?limit=0')

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(mockS3Send).not.toHaveBeenCalled()
  })

  // Eingabe-Validierung
  it('gibt HTTP 400 zurück wenn kein image-Feld im FormData vorhanden (SEARCH-03)', async () => {
    const { POST } = await import('./route')
    const request = makeRequestWithoutImage()

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(mockS3Send).not.toHaveBeenCalled()
  })

  // Multi-Foto-Query
  it('akzeptiert mehrere image-Felder und mergt per part_id mit MAX-Similarity', async () => {
    // 2 Fotos → 2 DB-Aufrufe; beide returnieren denselben Part mit verschiedenen Similarities.
    // Erwartung: gemergter Eintrag mit Max-Similarity (0.92) erscheint in den Ergebnissen.
    mockDb
      .mockResolvedValueOnce([makeDbRow('0.80')])
      .mockResolvedValueOnce([{ ...makeDbRow('0.92'), part_number: 'PN-001' }])

    const { POST } = await import('./route')
    const request = makeMultiImageRequest(2)

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.results).toHaveLength(1)
    expect(data.results[0].similarity).toBeCloseTo(0.92, 5)
    expect(data.query.photo_count).toBe(2)
    // 2 PUTs (Upload) + 2 DELETEs (Cleanup) = 4 S3-Aufrufe
    expect(mockS3Send).toHaveBeenCalledTimes(4)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })

  it('gibt HTTP 400 zurück wenn mehr als 5 Fotos übergeben werden', async () => {
    const { POST } = await import('./route')
    const request = makeMultiImageRequest(6)

    const response = await POST(request)

    expect(response.status).toBe(400)
    expect(mockS3Send).not.toHaveBeenCalled()
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('Multi-Foto: Embed-Fehler in einem Foto bricht die Suche ab, alle Uploads werden cleanup-t', async () => {
    // Erstes Foto: Embed OK. Zweites Foto: Worker antwortet mit 500 → 502 zurück.
    // Beide Uploads müssen trotzdem cleanup-t werden.
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ embedding: new Array(1024).fill(0.1) }) })
      .mockResolvedValueOnce({ ok: false, status: 500 })

    const { POST } = await import('./route')
    const request = makeMultiImageRequest(2)

    const response = await POST(request)

    expect(response.status).toBe(502)
    // 2 PUTs + 2 DELETEs = 4
    expect(mockS3Send).toHaveBeenCalledTimes(4)
  })
})
