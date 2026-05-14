// src/app/api/search/route.ts
// POST /api/search — Suche per Foto-Embedding gegen pgvector-Datenbank.
// Unterstützt 1..MAX_PHOTOS_PER_QUERY Fotos pro Anfrage (mehrere 'image'-Felder im FormData);
// pro Bauteil wird die maximale (View × Query-Foto)-Similarity zurückgegeben.
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
const SearchQuerySchema = z.object({
  threshold: z.coerce.number().min(0).max(1).optional().default(0.7),
  limit: z.coerce.number().int().min(1).max(50).optional().default(10),
})

// Hartes Limit gegen versehentlich zu große FormData-Uploads. Praktisch nutzt
// kein Anwender > 3–4 Fotos pro Suche, 5 ist ein bequemer Sicherheitspuffer.
const MAX_PHOTOS_PER_QUERY = 5

// Hilfsfunktion: S3 Temp-Cleanup — fire-and-forget mit .catch(warn)
async function cleanupTempS3(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({
    Bucket: BUCKET_THUMBNAILS,
    Key: key,
  })).catch(err => console.warn(`[search] S3 Cleanup fehlgeschlagen für ${key}: ${err}`))
}

type EmbedSuccess = { ok: true; embedding: number[] }
type EmbedFailure = { ok: false; status: number; body: object }
type EmbedResult = EmbedSuccess | EmbedFailure

// Lädt EIN Foto nach S3, ruft Worker /embed auf, gibt Embedding oder strukturierten
// Fehler zurück. tempKey wird über die geteilte `keys`-Liste mitgeschrieben, damit
// der Caller alle hochgeladenen Objekte cleanup kann — auch wenn der Embed schlägt.
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
    // AbortSignal.timeout(28_000) — 2 s Puffer vor maxDuration=30 (T-6-07)
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

  const { embedding } = await res.json() as { embedding: number[] }
  return { ok: true, embedding }
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
    // T-6-03: MIME-Validierung verhindert PIL.UnidentifiedImageError im Worker
    if (!file.type.startsWith('image/')) {
      return NextResponse.json({ error: 'Nur Bilddateien erlaubt (image/*)' }, { status: 400 })
    }
  }

  // 3. Worker-Erreichbarkeit
  const workerUrl = process.env.WORKER_URL
  if (!workerUrl) {
    return NextResponse.json({ error: 'Worker nicht konfiguriert (WORKER_URL fehlt)' }, { status: 503 })
  }

  // 4. Alle Fotos parallel hochladen + embedden
  const tempKeys: string[] = []
  const embedResults = await Promise.all(
    files.map(file => embedSingle(file, workerUrl, tempKeys))
  )

  // 5. S3-Cleanup für ALLE hochgeladenen Keys — egal ob Embed gelungen oder nicht.
  //    Fire-and-forget: wir warten nicht, da das Embedding bereits in-memory liegt.
  Promise.all(tempKeys.map(cleanupTempS3)).catch(() => {})

  // 6. Erster Fehler entscheidet den HTTP-Status — deterministisch über Reihenfolge
  const firstFailure = embedResults.find((r): r is EmbedFailure => !r.ok)
  if (firstFailure) {
    return NextResponse.json(firstFailure.body, { status: firstFailure.status })
  }
  const embeddings = (embedResults as EmbedSuccess[]).map(r => r.embedding)

  // 7. pgvector-Query — eine HNSW-beschleunigte Query pro Foto, dann in JS mergen.
  //    Begründung: ein einzelner CROSS-JOIN-Query mit n Vektoren würde den HNSW-Index
  //    umgehen und bei wachsendem Korpus zur Linear-Search degenerieren. n parallele
  //    indizierte Queries skalieren sauber. n ≤ MAX_PHOTOS_PER_QUERY = 5.
  //
  //    Threshold-Filter und finales LIMIT werden NACH dem Merge in JS angewendet —
  //    pro Foto holen wir bewusst mehr als `limit`, damit ein Bauteil, das nur in
  //    EINEM Foto hoch rankt, nicht im SQL-LIMIT verloren geht.
  //
  //    KRITISCH (CLAUDE.md): Embedding als String-Literal-Vektor übergeben — Neon
  //    serialisiert number[] als PG-Array {…}, pgvector braucht [...]::vector.
  const perPhotoLimit = Math.max(limit * 3, 50)

  const perPhotoRows = await Promise.all(
    embeddings.map((emb) => {
      const embeddingLiteral = `[${emb.join(',')}]`
      return db`
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
        ORDER BY similarity DESC
        LIMIT ${perPhotoLimit}
      `
    })
  )

  // 8. Merge — maximale Similarity pro part_id über alle Fotos
  type Row = {
    id: string
    name: string
    part_number: string | null
    project: string | null
    status: string
    created_at: string
    similarity: number
  }
  const merged = new Map<string, Row>()
  for (const rows of perPhotoRows) {
    for (const row of rows) {
      const sim = parseFloat(String(row.similarity as string | number))
      const id = row.id as string
      const existing = merged.get(id)
      if (!existing || existing.similarity < sim) {
        merged.set(id, {
          id,
          name: row.name as string,
          part_number: (row.part_number ?? null) as string | null,
          project: (row.project ?? null) as string | null,
          status: row.status as string,
          created_at: row.created_at as string,
          similarity: sim,
        })
      }
    }
  }

  // 9. Threshold-Filter + Sort + Limit (finalisiert das gemergte Ranking)
  const final = [...merged.values()]
    .filter(r => r.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)

  return NextResponse.json({
    results: final,
    query: {
      threshold,
      limit,
      photo_count: files.length,
      results_count: final.length,
    },
  })
}
