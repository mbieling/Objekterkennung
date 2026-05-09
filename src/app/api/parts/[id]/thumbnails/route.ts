// GET /api/parts/[id]/thumbnails — D-13
// Liefert Array von Presigned S3-URLs für view_0.png bis view_{N-1}.png.
// Server-only — KEIN "use client", keine Browser-Imports.

import { NextResponse } from 'next/server'
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { z } from 'zod'
import { db } from '@/lib/db'
import { s3, BUCKET_THUMBNAILS } from '@/lib/s3'

const ParamsSchema = z.object({
  id: z.string().uuid('id muss eine gültige UUID sein'),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params

  // 1. UUID validieren BEVOR DB-Query oder S3-Key-Konstruktion (T-09-01: Path-Traversal)
  const parsed = ParamsSchema.safeParse({ id })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid id', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // 2. Part-Existenz, Status und thumbnail_count prüfen
  const rows = await db`
    SELECT status, thumbnail_count FROM parts WHERE id = ${id} LIMIT 1
  `
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Part not found' }, { status: 404 })
  }

  // Bei status != 'ready' oder thumbnail_count = 0: leeres Array zurückgeben (kein 409)
  // Client rendert Skeleton-Strip (D-11)
  if (rows[0].status !== 'ready' || rows[0].thumbnail_count === 0) {
    return NextResponse.json({ urls: [] })
  }

  const count: number = rows[0].thumbnail_count

  // 3. Alle Views parallel laden (Promise.all statt sequenziell — Pitfall 5)
  const results = await Promise.all(
    Array.from({ length: count }, async (_, i) => {
      const key = `${id}/view_${i}.png`
      try {
        await s3.send(new HeadObjectCommand({ Bucket: BUCKET_THUMBNAILS, Key: key }))
        const url = await getSignedUrl(
          s3,
          new GetObjectCommand({ Bucket: BUCKET_THUMBNAILS, Key: key }),
          { expiresIn: 60 }
        )
        return url
      } catch {
        // Einzelne fehlende Views überspringen — Rest trotzdem zurückgeben (Open Question 2)
        return null
      }
    })
  )

  const urls = results.filter((url): url is string => url !== null)
  return NextResponse.json({ urls })
}
