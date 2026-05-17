// src/app/api/search/route.test.ts
// Tests für POST /api/search
// SEARCH-03: HTTP 200 mit Treffern, leere Ergebnisse, Worker-Fehler 502
// SEARCH-04: Threshold-Parameter, ungültiger Threshold 400
// SEARCH-05: Limit-Parameter, ungültiges Limit 400
// Eingabe-Validierung: fehlendes image-Feld 400
// Hebel 1/2/3: Multi-View-Konsens, Geometrie-Re-Rank, Confidence

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

function makeRequestWithoutImage(url = 'http://localhost/api/search'): NextRequest {
  const request = new NextRequest(url, {
    method: 'POST',
    body: 'placeholder',
    headers: { 'Content-Type': 'text/plain' },
  })
  const formData = new FormData()
  vi.spyOn(request, 'formData').mockResolvedValue(formData)
  return request
}

// Pro Part liefert die neue Query mehrere View-Zeilen. Hilfsfunktion baut N
// View-Zeilen für ein Part mit gegebener Similarity (gleicher Wert für alle Views,
// damit Tests deterministisch sind — view_hits ergibt sich aus der Anzahl).
function makeViewRows(
  partId: string,
  sim: string | number,
  viewCount: number,
  extras: Partial<{
    name: string
    part_number: string | null
    project: string | null
    bbox_x: number | null
    bbox_y: number | null
    bbox_z: number | null
    shape_embedding: number[] | null
  }> = {}
) {
  const shapeEmbStr = extras.shape_embedding
    ? `[${extras.shape_embedding.join(',')}]`
    : null
  return Array.from({ length: viewCount }, (_, i) => ({
    id: partId,
    name: extras.name ?? 'Testbauteil',
    part_number: extras.part_number ?? 'PN-001',
    project: extras.project ?? 'Testprojekt',
    status: 'ready',
    created_at: '2024-01-01T00:00:00.000Z',
    bbox_x: extras.bbox_x ?? null,
    bbox_y: extras.bbox_y ?? null,
    bbox_z: extras.bbox_z ?? null,
    shape_embedding: shapeEmbStr,
    view_idx: i,
    sim,
  }))
}

// Helfer für Shape-Embeddings: erzeugt einen 128-dim Vektor mit konstanten Werten in
// einigen Dimensionen, damit wir paarweise Cosine-Similarity gezielt steuern können.
function shapeVec(seed: number): number[] {
  // Einfache Form: Einheitsvektor in Richtung seed mod 128 — orthogonale Vektoren für
  // unterschiedliche Seeds, cosine zwischen verschiedenen Seeds = 0.
  const v = new Array(128).fill(0)
  v[seed % 128] = 1.0
  return v
}

const DEFAULT_PART_ID = '123e4567-e89b-12d3-a456-426614174000'

describe('POST /api/search', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    process.env.WORKER_URL = 'http://localhost:8000'
    mockS3Send.mockResolvedValue({} as never)
    // Worker antwortet seit Hebel 3 mit embedding + aspect_ratio
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ embedding: new Array(1024).fill(0.1), aspect_ratio: 1.0 }),
    })
  })

  // SEARCH-03 — Treffer
  it('gibt HTTP 200 mit geranketen Treffern zurück wenn Treffer vorhanden (SEARCH-03)', async () => {
    // 8 View-Hits über SUB_HIT_THRESHOLD (0.70) bei einer guten similarity
    mockDb.mockResolvedValueOnce(makeViewRows(DEFAULT_PART_ID, '0.85', 8))

    const { POST } = await import('./route')
    const request = makeImageRequest()

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.results).toHaveLength(1)
    expect(data.results[0].similarity).toBeCloseTo(0.85, 5)
    expect(typeof data.results[0].similarity).toBe('number')
    expect(data.results[0].view_hits).toBe(8)
    // Default-Threshold ist auf 0.82 angehoben (Hebel 1)
    expect(data.query.threshold).toBe(0.82)
    // Bei einzigem Ergebnis ist margin null, confidence aus absolutem Score
    expect(data.query.margin).toBeNull()
    expect(['high', 'medium', 'low']).toContain(data.query.confidence)
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
    expect(mockS3Send).toHaveBeenCalledTimes(2)
  })

  it('gibt HTTP 502 zurück wenn Worker einen Fehler zurückgibt (SEARCH-03)', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 })

    const { POST } = await import('./route')
    const request = makeImageRequest()

    const response = await POST(request)

    expect(response.status).toBe(502)
    expect(mockS3Send).toHaveBeenCalledTimes(2)
  })

  // SEARCH-04: Threshold-Filter
  it('schließt Treffer unter dem Schwellwert aus (SEARCH-04)', async () => {
    mockDb.mockResolvedValueOnce(makeViewRows(DEFAULT_PART_ID, '0.9', 8))

    const { POST } = await import('./route')
    const request = makeImageRequest('http://localhost/api/search?threshold=0.8')

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.query.threshold).toBe(0.8)
    expect(data.results).toHaveLength(1)
  })

  it('filtert Treffer aus, deren Similarity unter dem Schwellwert liegt', async () => {
    mockDb.mockResolvedValueOnce(makeViewRows(DEFAULT_PART_ID, '0.6', 8))

    const { POST } = await import('./route')
    const request = makeImageRequest('http://localhost/api/search?threshold=0.7')

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.results).toHaveLength(0)
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
    const rows = [
      ...makeViewRows('11111111-1111-1111-1111-111111111111', '0.95', 8, { name: 'A' }),
      ...makeViewRows('22222222-2222-2222-2222-222222222222', '0.90', 8, { name: 'B' }),
      ...makeViewRows('33333333-3333-3333-3333-333333333333', '0.85', 8, { name: 'C' }),
    ]
    mockDb.mockResolvedValueOnce(rows)

    const { POST } = await import('./route')
    const request = makeImageRequest('http://localhost/api/search?limit=3&threshold=0.7')

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

  // Multi-Foto
  it('akzeptiert mehrere image-Felder und mergt per part_id mit MAX-Similarity', async () => {
    mockDb
      .mockResolvedValueOnce(makeViewRows(DEFAULT_PART_ID, '0.80', 8))
      .mockResolvedValueOnce(makeViewRows(DEFAULT_PART_ID, '0.92', 8))

    const { POST } = await import('./route')
    const request = makeMultiImageRequest(2)

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.results).toHaveLength(1)
    expect(data.results[0].similarity).toBeCloseTo(0.92, 5)
    expect(data.query.photo_count).toBe(2)
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
    mockFetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ embedding: new Array(1024).fill(0.1), aspect_ratio: 1.0 }) })
      .mockResolvedValueOnce({ ok: false, status: 500 })

    const { POST } = await import('./route')
    const request = makeMultiImageRequest(2)

    const response = await POST(request)

    expect(response.status).toBe(502)
    expect(mockS3Send).toHaveBeenCalledTimes(4)
  })

  // Hebel 1: Confidence
  it('liefert confidence="high" und positive margin bei klarem Vorsprung des Top-Treffers', async () => {
    // Top-1 final_score wird deutlich höher als Top-2 sein
    const rows = [
      ...makeViewRows('11111111-1111-1111-1111-111111111111', '0.95', 12, { name: 'Top' }),
      ...makeViewRows('22222222-2222-2222-2222-222222222222', '0.72', 1, { name: 'Filler' }),
    ]
    mockDb.mockResolvedValueOnce(rows)

    const { POST } = await import('./route')
    const request = makeImageRequest('http://localhost/api/search?threshold=0.7')

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.results.length).toBeGreaterThanOrEqual(2)
    expect(data.query.margin).toBeGreaterThan(0)
    expect(data.query.confidence).toBe('high')
  })

  it('liefert confidence="low" wenn Top-Treffer und Alternativen sehr eng beieinander liegen', async () => {
    // Drei Parts mit fast identischer Similarity → Margin klein → confidence='low'
    const rows = [
      ...makeViewRows('11111111-1111-1111-1111-111111111111', '0.85', 6, { name: 'A' }),
      ...makeViewRows('22222222-2222-2222-2222-222222222222', '0.84', 6, { name: 'B' }),
      ...makeViewRows('33333333-3333-3333-3333-333333333333', '0.83', 6, { name: 'C' }),
    ]
    mockDb.mockResolvedValueOnce(rows)

    const { POST } = await import('./route')
    const request = makeImageRequest('http://localhost/api/search?threshold=0.7')

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.results.length).toBeGreaterThanOrEqual(2)
    expect(data.query.margin).toBeLessThan(0.04)
    expect(data.query.confidence).toBe('low')
  })

  // Hebel 2: view_hits zählt distinkte Views über SUB_HIT_THRESHOLD
  it('zählt view_hits korrekt — nur Views mit sim ≥ 0.70 zählen', async () => {
    // 5 Views auf 0.85 (Hit), 3 Views auf 0.60 (kein Hit)
    const partId = '11111111-1111-1111-1111-111111111111'
    const rows = [
      ...makeViewRows(partId, '0.85', 5),
      // Views mit anderem view_idx und niedriger Similarity
      ...makeViewRows(partId, '0.60', 3).map((r, i) => ({ ...r, view_idx: 100 + i })),
    ]
    mockDb.mockResolvedValueOnce(rows)

    const { POST } = await import('./route')
    const request = makeImageRequest('http://localhost/api/search?threshold=0.7')

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.results[0].view_hits).toBe(5)
  })

  // Hebel 3: Geometrie-Re-Rank-Multiplikator
  it('wertet Kandidaten mit klar abweichender Bbox-Proportion sanft ab', async () => {
    // Foto-Aspect ist 1.0 (Quadrat, Worker-Mock-Default).
    // partA: Würfel 10×10×10 → alle 3 Projektionen sind 1:1 → perfekter Match (geo_score=1.0).
    // partB: 10×4×2 → Projektionen sind 10/4=2.5, 10/2=5, 4/2=2 — alle deutlich > 1.0,
    //                 keine 2D-Projektion ist quadratisch → echtes Form-Mismatch.
    const partA = '11111111-1111-1111-1111-111111111111'
    const partB = '22222222-2222-2222-2222-222222222222'
    const rows = [
      ...makeViewRows(partA, '0.85', 8, { name: 'Gut', bbox_x: 10, bbox_y: 10, bbox_z: 10 }),
      ...makeViewRows(partB, '0.85', 8, { name: 'Mismatch', bbox_x: 10, bbox_y: 4, bbox_z: 2 }),
    ]
    mockDb.mockResolvedValueOnce(rows)

    const { POST } = await import('./route')
    const request = makeImageRequest('http://localhost/api/search?threshold=0.7')

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.results).toHaveLength(2)
    expect(data.results[0].id).toBe(partA)
    expect(data.results[0].geo_score).toBeGreaterThan(data.results[1].geo_score)
  })

  it('lässt Kandidaten mit passender 2D-Projektion unberührt (Geo-Match an einer Achse reicht)', async () => {
    // Foto-Aspect 1.0; partA Bbox 100×10×10 — extrem länglich.
    // Aber die ENDANSICHT (Projektion entlang der langen Achse) ist 10×10 — quadratisch.
    // Der Algorithmus muss deshalb dieses Teil NICHT abwerten (Foto könnte Endansicht sein).
    mockDb.mockResolvedValueOnce(
      makeViewRows(DEFAULT_PART_ID, '0.85', 8, { bbox_x: 100, bbox_y: 10, bbox_z: 10 })
    )

    const { POST } = await import('./route')
    const request = makeImageRequest('http://localhost/api/search?threshold=0.7')

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.results[0].geo_score).toBe(1.0)
  })

  // Hebel 4: Shape Foundation Model Re-Rank
  it('Shape-Re-Rank: orthogonale Form-Embeddings werten Kandidaten ab', async () => {
    // Anker (partA) und Kandidat (partB) haben identische DINOv3-Sim, aber komplett
    // unterschiedliche Shape-Embeddings (orthogonal: cosine = 0 → shape_score = 0).
    // Erwartung: partB rutscht im final_score klar unter partA.
    const partA = '11111111-1111-1111-1111-111111111111'
    const partB = '22222222-2222-2222-2222-222222222222'
    const rows = [
      ...makeViewRows(partA, '0.85', 8, { name: 'A-Anker', shape_embedding: shapeVec(0) }),
      ...makeViewRows(partB, '0.85', 8, { name: 'B-Fremdform', shape_embedding: shapeVec(50) }),
    ]
    mockDb.mockResolvedValueOnce(rows)

    const { POST } = await import('./route')
    const request = makeImageRequest('http://localhost/api/search?threshold=0.7')

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.results).toHaveLength(2)
    expect(data.results[0].id).toBe(partA)
    expect(data.results[0].shape_sim_to_anchor).toBe(1.0)
    // Orthogonale Shape-Vektoren → shape_score = 0 → final_score klar niedriger
    expect(data.results[1].shape_sim_to_anchor).toBeLessThan(0.1)
    expect(data.results[1].shape_score).toBe(0)
  })

  it('Shape-Re-Rank: bleibt neutral, wenn der Anker kein Shape-Embedding hat', async () => {
    // Anker ohne Shape-Embedding → Re-Rank wird komplett übersprungen.
    const partA = '11111111-1111-1111-1111-111111111111'
    const partB = '22222222-2222-2222-2222-222222222222'
    const rows = [
      ...makeViewRows(partA, '0.85', 8, { name: 'A', shape_embedding: null }),
      ...makeViewRows(partB, '0.80', 8, { name: 'B', shape_embedding: shapeVec(50) }),
    ]
    mockDb.mockResolvedValueOnce(rows)

    const { POST } = await import('./route')
    const request = makeImageRequest('http://localhost/api/search?threshold=0.7')

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.results[0].id).toBe(partA)
    // Kein Re-Rank — shape_sim_to_anchor bleibt null, shape_score neutral
    expect(data.results[0].shape_sim_to_anchor).toBeNull()
    expect(data.results[0].shape_score).toBe(1.0)
  })

  it('Shape-Re-Rank: Kandidat ohne Shape-Embedding bleibt neutral, andere werden abgewertet', async () => {
    const partA = '11111111-1111-1111-1111-111111111111'   // Anker mit Shape
    const partB = '22222222-2222-2222-2222-222222222222'   // ohne Shape → neutral
    const partC = '33333333-3333-3333-3333-333333333333'   // fremder Shape → abgewertet
    const rows = [
      ...makeViewRows(partA, '0.85', 8, { name: 'A', shape_embedding: shapeVec(0) }),
      ...makeViewRows(partB, '0.84', 8, { name: 'B', shape_embedding: null }),
      ...makeViewRows(partC, '0.83', 8, { name: 'C', shape_embedding: shapeVec(50) }),
    ]
    mockDb.mockResolvedValueOnce(rows)

    const { POST } = await import('./route')
    const request = makeImageRequest('http://localhost/api/search?threshold=0.7')

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    const byId = Object.fromEntries(data.results.map((r: { id: string }) => [r.id, r]))
    expect(byId[partA].shape_score).toBe(1.0)         // Anker
    expect(byId[partB].shape_score).toBe(1.0)         // kein Shape — neutral
    expect(byId[partB].shape_sim_to_anchor).toBeNull()
    expect(byId[partC].shape_score).toBe(0)           // orthogonal — abgewertet
  })

  it('behandelt fehlende Bbox-Daten neutral (geo_score = 1.0)', async () => {
    mockDb.mockResolvedValueOnce(
      makeViewRows(DEFAULT_PART_ID, '0.85', 8, { bbox_x: null, bbox_y: null, bbox_z: null })
    )

    const { POST } = await import('./route')
    const request = makeImageRequest('http://localhost/api/search?threshold=0.7')

    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.results[0].geo_score).toBe(1.0)
  })
})
