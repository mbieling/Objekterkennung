// src/app/api/search/route.ts
// POST /api/search — Foto-basierte Bauteilsuche mit drei Verbesserungs-Hebeln:
//
//  1. Margin/Confidence:  Cosine-Ähnlichkeit ist KEINE kalibrierte Wahrscheinlichkeit.
//                         Wir berechnen pro Antwort eine Konfidenz (high/medium/low)
//                         aus dem Abstand zwischen Top-1 und Top-2.
//  2. Multi-View-Konsens: Statt nur MAX-per-Part bewerten wir, wie VIELE der 16 Views
//                         eines Kandidaten passen — ein echter Treffer dominiert in
//                         mehreren Perspektiven, ein Zufallstreffer nur in einer.
//  3. Geometrie-Re-Rank:  Aus der STEP-Datei haben wir 3D-Bbox-Proportionen. Wir
//                         vergleichen das Foto-Aspect-Ratio gegen die 3 orthogonalen
//                         2D-Projektionen der 3D-Bbox und werten Kandidaten mit
//                         klarem Form-Mismatch sanft ab.
//
// Multi-Foto-Modus (1..MAX_PHOTOS_PER_QUERY=5) ist additiv: pro Foto eine HNSW-Query,
// dann part-weise gemerged (MAX-Similarity & SUM-Hits-mit-Cap).

import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { z } from 'zod'
import { db } from '@/lib/db'
import { s3, BUCKET_THUMBNAILS } from '@/lib/s3'

// D-02: 30s Vercel-Timeout — muss als Module-Level-Export stehen (Next.js liest beim Build)
export const maxDuration = 30

// Default-Threshold auf 0.82 angehoben (Hebel 1): unter ~0.80 liegt für DINOv3 in der
// CAD-Render-Domäne nur Rauschen — alles darunter ist KEIN echter Treffer.
// Der UI-Slider kann den Wert weiterhin frei zwischen 0..1 verschieben.
const DEFAULT_THRESHOLD = 0.82

// Multi-View-Konsens (Hebel 2): eine Single-View-Similarity ≥ SUB_HIT_THRESHOLD zählt
// als "passender Hit". Ein echtes Match hat typischerweise mehrere solche Views.
const SUB_HIT_THRESHOLD = 0.70

// Anzahl Render-Views pro Bauteil (Spiegel zu worker/renderer.py VIEW_COUNT).
// Wird zur Normalisierung des view-hits-Beitrags verwendet (Cap auf VIEWS_PER_PART/2 —
// 8 Konsens-Hits ist bereits sehr stark, mehr soll den Score nicht weiter pushen).
const VIEWS_PER_PART = 16
const HITS_NORMALIZATION_CAP = 8

// Geometrie-Re-Rank-Toleranzen (Hebel 3a). Aspect-Ratio-Vergleich erfolgt im log-Raum
// (multiplikative Differenzen). Die Werte sind bewusst weich gewählt — ein Foto
// schräg aufgenommen liefert nie exakt das Projektion-Ratio.
const GEO_PERFECT_LOG_DIFF = Math.log(1.3)  // bis 1.3× Faktor-Unterschied → perfekt (score=1.0)
const GEO_FAIL_LOG_DIFF = Math.log(2.0)     // ab 2.0× Faktor-Unterschied → maximal abgewertet (score=0)
// Geo wirkt als sanfter Multiplikator: min(GEO_MIN_FACTOR)..1.0 — bei einem Total-Mismatch
// wird der visuelle Score also nur um max. (1 - GEO_MIN_FACTOR) abgewertet.
const GEO_MIN_FACTOR = 0.70

// Gewichtung visuell vs. multi-view-consensus für combined_score.
const COMBINED_W_TOP = 0.6
const COMBINED_W_HITS = 0.4

// Confidence-Schwellen auf der margin (Top-1 final - Top-2 final).
const CONFIDENCE_HIGH_MARGIN = 0.10
const CONFIDENCE_MEDIUM_MARGIN = 0.04

// Hartes Limit gegen versehentlich zu große FormData-Uploads.
const MAX_PHOTOS_PER_QUERY = 5

// Pro Foto holen wir alle View-Treffer in den Top-N (genug für ~18 verschiedene Parts
// bei 16 Views/Part). Reicht für stabiles Top-10-Ranking mit Margin.
const PER_PHOTO_VIEW_LIMIT = 300

// Zod-Schema für Query-Parameter
const SearchQuerySchema = z.object({
  threshold: z.coerce.number().min(0).max(1).optional().default(DEFAULT_THRESHOLD),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
})

async function cleanupTempS3(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({
    Bucket: BUCKET_THUMBNAILS,
    Key: key,
  })).catch(err => console.warn(`[search] S3 Cleanup fehlgeschlagen für ${key}: ${err}`))
}

type EmbedSuccess = { ok: true; embedding: number[]; aspect_ratio: number }
type EmbedFailure = { ok: false; status: number; body: object }
type EmbedResult = EmbedSuccess | EmbedFailure

async function embedSingle(
  file: File,
  workerUrl: string,
  keys: string[],
): Promise<EmbedResult> {
  const buffer = Buffer.from(await file.arrayBuffer())
  const tempKey = `search-temp/${crypto.randomUUID()}.jpg`
  keys.push(tempKey)

  try {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_THUMBNAILS,
      Key: tempKey,
      Body: buffer,
      ContentType: file.type,
    }))
  } catch (err) {
    return { ok: false, status: 500, body: { error: 'S3 Upload fehlgeschlagen', detail: String(err) } }
  }

  let res: Response
  try {
    res = await fetch(`${workerUrl}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ s3_key: tempKey }),
      signal: AbortSignal.timeout(28_000),
    })
  } catch {
    return { ok: false, status: 502, body: { error: 'Worker nicht erreichbar' } }
  }

  if (!res.ok) {
    return { ok: false, status: 502, body: { error: 'Worker Embed-Fehler' } }
  }

  // Worker liefert seit Hebel-3-Patch zusätzlich aspect_ratio (Crop-Aspect nach rembg).
  // Bestandsfeld bleibt unverändert, nur ein zusätzliches Feld.
  const body = await res.json() as { embedding: number[]; aspect_ratio?: number }
  // Defensiver Default: 1.0 = Quadrat = Geo-Re-Rank-neutral (jeder Kandidat passt).
  const aspectRatio = typeof body.aspect_ratio === 'number' && body.aspect_ratio > 0
    ? body.aspect_ratio
    : 1.0
  return { ok: true, embedding: body.embedding, aspect_ratio: aspectRatio }
}

// Geometrie-Score: wie gut passt das Foto-Aspect-Ratio zu den möglichen 2D-Projektionen
// einer sortierten 3D-Bbox? Wir prüfen alle 3 orthogonalen Projektionen (Front/Seite/Oben)
// und nehmen die BESTE Übereinstimmung — das Foto wurde aus IRGENDEINEM Winkel aufgenommen.
//
// Rückgabe: ∈ [0, 1]; 1.0 = ein Projektion-Ratio liegt nahe am Foto-Aspect, 0 = alle deutlich daneben.
function geometryScore(
  photoAspect: number,
  bbox: { x: number | null; y: number | null; z: number | null }
): number {
  // Ohne Bbox-Daten neutral: keine Geo-Information ⇒ kein Geo-Beitrag, kein Abwerten.
  if (bbox.x == null || bbox.y == null || bbox.z == null) return 1.0
  if (bbox.x <= 0 || bbox.y <= 0 || bbox.z <= 0) return 1.0

  // bbox ist bereits sortiert (Migration 005 / worker geometry.py): x ≥ y ≥ z.
  // Die drei möglichen 2D-Projektions-Aspect-Ratios der 3D-Bbox:
  //   - Projektion entlang Z-Achse: max/min von (x, y) = x/y
  //   - Projektion entlang Y-Achse: max/min von (x, z) = x/z
  //   - Projektion entlang X-Achse: max/min von (y, z) = y/z
  // Alle ≥ 1.0 (wie photoAspect, das ja auch max/min ist).
  const projections = [bbox.x / bbox.y, bbox.x / bbox.z, bbox.y / bbox.z]

  // Log-Differenz für multiplikative Toleranz (Faktor-2-Unterschied = |log| = ln(2)).
  let minLogDiff = Infinity
  for (const proj of projections) {
    if (proj <= 0) continue
    const diff = Math.abs(Math.log(photoAspect / proj))
    if (diff < minLogDiff) minLogDiff = diff
  }
  if (!isFinite(minLogDiff)) return 1.0

  if (minLogDiff <= GEO_PERFECT_LOG_DIFF) return 1.0
  if (minLogDiff >= GEO_FAIL_LOG_DIFF) return 0.0
  // Linear zwischen perfekt und fail interpolieren.
  return 1.0 - (minLogDiff - GEO_PERFECT_LOG_DIFF) / (GEO_FAIL_LOG_DIFF - GEO_PERFECT_LOG_DIFF)
}

type Confidence = 'high' | 'medium' | 'low'

function classifyConfidence(topFinal: number, marginToNext: number | null): Confidence {
  // Einzelnes Ergebnis: keine Margin verfügbar — Konfidenz nur aus absoluter Höhe.
  if (marginToNext == null) {
    if (topFinal >= 0.85) return 'high'
    if (topFinal >= 0.75) return 'medium'
    return 'low'
  }
  if (marginToNext >= CONFIDENCE_HIGH_MARGIN) return 'high'
  if (marginToNext >= CONFIDENCE_MEDIUM_MARGIN) return 'medium'
  return 'low'
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Query-Parameter validieren
  const rawThreshold = request.nextUrl.searchParams.get('threshold')
  const rawLimit = request.nextUrl.searchParams.get('limit')

  const parsedQuery = SearchQuerySchema.safeParse({
    threshold: rawThreshold ?? undefined,
    limit: rawLimit ?? undefined,
  })
  if (!parsedQuery.success) {
    return NextResponse.json(
      { error: 'Ungültige Query-Parameter', details: parsedQuery.error.flatten() },
      { status: 400 }
    )
  }
  const { threshold, limit } = parsedQuery.data

  // 2. FormData parsen — ein oder mehrere image-Felder
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'FormData konnte nicht gelesen werden' }, { status: 400 })
  }

  const rawFiles = formData.getAll('image')
  const files = rawFiles.filter((f): f is File => f instanceof File)

  if (files.length === 0) {
    return NextResponse.json({ error: 'image-Feld fehlt oder ist kein File' }, { status: 400 })
  }
  if (files.length > MAX_PHOTOS_PER_QUERY) {
    return NextResponse.json(
      { error: `Maximal ${MAX_PHOTOS_PER_QUERY} Fotos pro Suche erlaubt (übergeben: ${files.length})` },
      { status: 400 }
    )
  }
  for (const file of files) {
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Nur Bilddateien erlaubt (image/*)' }, { status: 400 })
    }
  }

  // 3. Worker-Erreichbarkeit
  const workerUrl = process.env.WORKER_URL
  if (!workerUrl) {
    return NextResponse.json({ error: 'Worker nicht konfiguriert (WORKER_URL fehlt)' }, { status: 503 })
  }

  // 4. Alle Fotos parallel hochladen + embedden (inkl. Aspect-Ratio aus rembg-Crop)
  const tempKeys: string[] = []
  const embedResults = await Promise.all(
    files.map(file => embedSingle(file, workerUrl, tempKeys))
  )

  // 5. S3-Cleanup für ALLE hochgeladenen Keys — fire-and-forget.
  Promise.all(tempKeys.map(cleanupTempS3)).catch(() => {})

  // 6. Erster Fehler entscheidet den HTTP-Status — deterministisch über Reihenfolge.
  const firstFailure = embedResults.find((r): r is EmbedFailure => !r.ok)
  if (firstFailure) {
    return NextResponse.json(firstFailure.body, { status: firstFailure.status })
  }
  const okResults = embedResults as EmbedSuccess[]

  // 7. pgvector-Query — eine HNSW-beschleunigte Top-N-Query pro Foto.
  //    Wir holen VIEW-Zeilen (nicht aggregiert), damit wir in JS Multi-View-Konsens zählen
  //    können. Die Top-PER_PHOTO_VIEW_LIMIT Views decken bei 16 Views/Part typischerweise
  //    ~18 verschiedene Parts ab — genug für stabiles Top-10-Ranking mit Margin.
  //
  //    KRITISCH (CLAUDE.md): Embedding als String-Literal-Vektor — Neon serialisiert
  //    number[] sonst als PG-Array {…}, pgvector braucht [...]::vector.
  type ViewRow = {
    id: string
    name: string
    part_number: string | null
    project: string | null
    status: string
    created_at: string
    bbox_x: number | null
    bbox_y: number | null
    bbox_z: number | null
    view_idx: number
    sim: string | number
  }

  const perPhotoRows = await Promise.all(
    okResults.map((r) => {
      const embeddingLiteral = `[${r.embedding.join(',')}]`
      return db`
        SELECT
          p.id,
          p.name,
          p.part_number,
          p.project,
          p.status,
          p.created_at,
          p.bbox_x,
          p.bbox_y,
          p.bbox_z,
          pv.view_idx,
          1 - (pv.embedding <=> ${embeddingLiteral}::vector) AS sim
        FROM part_views pv
        JOIN parts p ON p.id = pv.part_id
        WHERE p.status = 'ready'
        ORDER BY pv.embedding <=> ${embeddingLiteral}::vector ASC
        LIMIT ${PER_PHOTO_VIEW_LIMIT}
      `
    })
  )

  // 8. Aggregation pro Part: top_sim (MAX über alle Foto×View) und view_hits
  //    (Anzahl distinkter Views mit Sim ≥ SUB_HIT_THRESHOLD, über alle Fotos hinweg
  //    durch die Set-Konstruktion automatisch dedupliziert).
  type PartAcc = {
    id: string
    name: string
    part_number: string | null
    project: string | null
    status: string
    created_at: string
    bbox: { x: number | null; y: number | null; z: number | null }
    topSim: number
    hitViewIdx: Set<number>   // Views, die in IRGENDEINEM Foto einen Hit hatten
    bestPhotoAspect: number   // Aspect-Ratio des Fotos, das den top_sim lieferte
  }
  const parts = new Map<string, PartAcc>()

  for (let photoIdx = 0; photoIdx < perPhotoRows.length; photoIdx++) {
    const rows = perPhotoRows[photoIdx] as unknown as ViewRow[]
    const photoAspect = okResults[photoIdx].aspect_ratio
    for (const row of rows) {
      const sim = typeof row.sim === 'number' ? row.sim : parseFloat(String(row.sim))
      if (!Number.isFinite(sim)) continue
      let acc = parts.get(row.id)
      if (!acc) {
        acc = {
          id: row.id,
          name: row.name,
          part_number: row.part_number ?? null,
          project: row.project ?? null,
          status: row.status,
          created_at: row.created_at,
          bbox: { x: row.bbox_x, y: row.bbox_y, z: row.bbox_z },
          topSim: sim,
          hitViewIdx: new Set<number>(),
          bestPhotoAspect: photoAspect,
        }
        parts.set(row.id, acc)
      } else if (sim > acc.topSim) {
        acc.topSim = sim
        acc.bestPhotoAspect = photoAspect
      }
      if (sim >= SUB_HIT_THRESHOLD) {
        acc.hitViewIdx.add(row.view_idx)
      }
    }
  }

  // 9. Final-Score je Part: combined (visuell + Konsens) × Geo-Multiplikator.
  type Scored = {
    id: string
    name: string
    part_number: string | null
    project: string | null
    status: string
    created_at: string
    similarity: number       // = topSim (kompatibel mit Frontend)
    view_hits: number
    geo_score: number
    combined_score: number   // visuell + Konsens (vor Geo)
    final_score: number      // combined × Geo-Multiplikator
  }

  const scored: Scored[] = []
  for (const acc of parts.values()) {
    const hitsNorm = Math.min(acc.hitViewIdx.size, HITS_NORMALIZATION_CAP) / HITS_NORMALIZATION_CAP
    const combined = COMBINED_W_TOP * acc.topSim + COMBINED_W_HITS * hitsNorm
    const geo = geometryScore(acc.bestPhotoAspect, acc.bbox)
    // Sanfter Multiplikator: zwischen GEO_MIN_FACTOR (Mismatch) und 1.0 (perfekt).
    const geoFactor = GEO_MIN_FACTOR + (1 - GEO_MIN_FACTOR) * geo
    const final = combined * geoFactor
    scored.push({
      id: acc.id,
      name: acc.name,
      part_number: acc.part_number,
      project: acc.project,
      status: acc.status,
      created_at: acc.created_at,
      similarity: acc.topSim,
      view_hits: acc.hitViewIdx.size,
      geo_score: Number(geo.toFixed(4)),
      combined_score: Number(combined.toFixed(4)),
      final_score: Number(final.toFixed(4)),
    })
  }

  // 10. Threshold-Filter wirkt auf die ROHE Similarity (das ist die Zahl, die der User
  //     im UI-Slider sieht — kompatibel zur bisherigen Mental-Map). Sortierung erfolgt
  //     nach final_score, damit Multi-View-Konsens und Geo-Re-Rank greifen.
  const filtered = scored
    .filter(s => s.similarity >= threshold)
    .sort((a, b) => b.final_score - a.final_score)

  const top = filtered.slice(0, limit)

  // 11. Margin & Confidence — wirken auf final_score (Ranking-Score).
  let margin: number | null = null
  let confidence: Confidence = 'low'
  if (top.length >= 2) {
    margin = Number((top[0].final_score - top[1].final_score).toFixed(4))
    confidence = classifyConfidence(top[0].final_score, margin)
  } else if (top.length === 1) {
    confidence = classifyConfidence(top[0].final_score, null)
  }

  return NextResponse.json({
    results: top,
    query: {
      threshold,
      limit,
      photo_count: files.length,
      results_count: top.length,
      margin,
      confidence,
    },
  })
}
