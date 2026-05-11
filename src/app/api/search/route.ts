// src/app/api/search/route.ts
// POST /api/search — Suche per Foto-Embedding gegen pgvector-Datenbank
// Ablauf: Query-Params validieren → FormData parsen → S3 Upload → Worker /embed → S3 Cleanup → pgvector Query → Response
// Server-only — KEIN "use client", keine Browser-Imports.

import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { z } from 'zod'
import { db } from '@/lib/db'
import { s3, BUCKET_THUMBNAILS } from '@/lib/s3'

// D-02: 30s Vercel-Timeout — muss als Module-Level-Export stehen (Next.js liest beim Build)
export const maxDuration = 30

// Zod-Schema für Query-Parameter (D-05, D-06, D-07)
// z.coerce.number() konvertiert URL-Strings zu Zahlen
const SearchQuerySchema = z.object({
  threshold: z.coerce.number().min(0).max(1).optional().default(0.7),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
})

// Hilfsfunktion: S3 Temp-Cleanup — fire-and-forget mit .catch(warn)
// Wird auf ALLEN Fehler-Pfaden aufgerufen (Worker-Fehler, Network-Fehler, etc.)
async function cleanupTempS3(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({
    Bucket: BUCKET_THUMBNAILS,
    Key: key,
  })).catch(err => console.warn(`[search] S3 Cleanup fehlgeschlagen für ${key}: ${err}`))
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. Query-Parameter validieren (threshold, limit) — vor FormData-Parsing
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

  // 2. FormData parsen und Bild extrahieren
  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'FormData konnte nicht gelesen werden' }, { status: 400 })
  }

  const file = formData.get('image')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'image-Feld fehlt oder ist kein File' }, { status: 400 })
  }

  // MIME-Type-Validierung — verhindert PIL.UnidentifiedImageError im Worker (T-6-03)
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'Nur Bilddateien erlaubt (image/*)' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)

  // 3. Suchbild temporär in S3 hochladen (D-03)
  // Bucket: BUCKET_THUMBNAILS mit Prefix search-temp/ (Wiederverwendung — kein neuer Bucket)
  // Key: crypto.randomUUID() — kein User-Input im S3-Key (Schutz gegen Path-Traversal, T-6-06)
  const tempKey = `search-temp/${crypto.randomUUID()}.jpg`

  try {
    await s3.send(new PutObjectCommand({
      Bucket: BUCKET_THUMBNAILS,
      Key: tempKey,
      Body: buffer,
      ContentType: file.type,
    }))
  } catch (err) {
    return NextResponse.json(
      { error: 'S3 Upload fehlgeschlagen', detail: String(err) },
      { status: 500 }
    )
  }

  // 4. Worker /embed synchron aufrufen (D-04)
  // Worker-URL ist server-only (kein NEXT_PUBLIC_) — Pflicht für Suche (kein Dev-Bypass)
  const workerUrl = process.env.WORKER_URL
  if (!workerUrl) {
    await cleanupTempS3(tempKey)
    return NextResponse.json({ error: 'Worker nicht konfiguriert (WORKER_URL fehlt)' }, { status: 503 })
  }

  let embedResponse: Response
  try {
    // AbortSignal.timeout(28_000) — 2s Puffer vor maxDuration=30 (T-6-07)
    embedResponse = await fetch(`${workerUrl}/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ s3_key: tempKey }),
      signal: AbortSignal.timeout(28_000),
    })
  } catch {
    // AbortError (Timeout) oder TypeError (Network unreachable)
    await cleanupTempS3(tempKey)
    return NextResponse.json({ error: 'Worker nicht erreichbar' }, { status: 502 })
  }

  if (!embedResponse.ok) {
    await cleanupTempS3(tempKey)
    return NextResponse.json({ error: 'Worker Embed-Fehler' }, { status: 502 })
  }

  const { embedding } = await embedResponse.json() as { embedding: number[] }

  // 5. S3 Cleanup — direkt nach Embedding-Erhalt, vor pgvector-Query
  // Temp-Objekt wird nicht mehr benötigt sobald das Embedding vorliegt
  await cleanupTempS3(tempKey)

  // 6. pgvector Cosine Similarity Query — Multi-View Max-per-Part (Hebel 2)
  // KRITISCH: embeddingLiteral als String — Neon serialisiert number[] als PG-Array {0.1,...},
  //           pgvector erwartet Literal-Format [0.1,...]::vector
  // KRITISCH: Threshold-Filter NICHT als Alias (Pitfall 3) — Ausdruck vollständig wiederholen
  //
  // Strategie:
  //   - part_views enthält 8 Embeddings pro Bauteil (je eine Render-Perspektive)
  //   - Für jedes Bauteil: Cosine-Similarity der BESTEN passenden View nehmen (MAX)
  //   - Mean-Pool über alle Views (alter Ansatz) hat Form-Diskriminanz zerstört
  // Filter: parts.status = 'ready' — kein is_archived (D-12)
  const embeddingLiteral = `[${embedding.join(',')}]`

  const rows = await db`
    SELECT
      p.id,
      p.name,
      p.part_number,
      p.project,
      p.status,
      p.created_at,
      MAX(1 - (pv.embedding <=> ${embeddingLiteral}::vector)) AS similarity
    FROM parts p
    JOIN part_views pv ON pv.part_id = p.id
    WHERE p.status = 'ready'
    GROUP BY p.id, p.name, p.part_number, p.project, p.status, p.created_at
    HAVING MAX(1 - (pv.embedding <=> ${embeddingLiteral}::vector)) >= ${threshold}
    ORDER BY similarity DESC
    LIMIT ${limit}
  `

  // 7. Response serialisieren (D-11 Shape)
  // parseFloat(row.similarity): Neon gibt berechnete Float-Ausdrücke manchmal als Decimal-String zurück
  // row ist Record<string, any> (Neon-Typ) — expliziter Cast für Type-Safety
  return NextResponse.json({
    results: rows.map((row) => ({
      id: row.id as string,
      name: row.name as string,
      part_number: (row.part_number ?? null) as string | null,
      project: (row.project ?? null) as string | null,
      status: row.status as string,
      similarity: parseFloat(String(row.similarity as string | number)),
      created_at: row.created_at as string,
    })),
    query: {
      threshold,
      limit,
      results_count: rows.length,
    },
  })
}
