// GET /api/parts/[id]/download — D-14
// Liefert Presigned S3-URL mit Content-Disposition für direkten Browser-Download.
// Server-only — KEIN "use client", keine Browser-Imports.
// Download-URL TTL: 300s (5min) — ausreichend für STEP-Dateien bis 100MB (Pitfall 6).

import { NextResponse } from 'next/server'
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { z } from 'zod'
import { db } from '@/lib/db'
import { s3, BUCKET_STEPS } from '@/lib/s3'

const ParamsSchema = z.object({
  id: z.string().uuid('id muss eine gültige UUID sein'),
})

// D-06: Dateiname sanitizen — Leerzeichen → _, Sonderzeichen entfernen, Fallback 'bauteil'
function sanitizeFilename(name: string): string {
  return (
    name
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_\-\.]/g, '') || 'bauteil'
  )
}

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

  // 2. Part-Existenz, Status und Name laden
  const rows = await db`SELECT status, name FROM parts WHERE id = ${id} LIMIT 1`
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Part not found' }, { status: 404 })
  }
  // 409 wenn noch nicht verarbeitet (kein STEP in S3 zu erwarten)
  if (rows[0].status !== 'ready') {
    return NextResponse.json({ error: 'Not ready' }, { status: 409 })
  }

  // 3. Dateiname sanitizen (D-06)
  const filename = `${sanitizeFilename(rows[0].name)}.step`
  const key = `${id}/original.step`

  // 4. HeadObject — Race-Condition-Schutz (S3 hat ggf. noch kein Objekt bei race)
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET_STEPS, Key: key }))
  } catch {
    return NextResponse.json({ error: 'STEP file missing' }, { status: 404 })
  }

  // 5. Presigned URL mit Content-Disposition + MIME-Type (D-05, Pitfall 3)
  let url: string
  try {
    url = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: BUCKET_STEPS,
        Key: key,
        ResponseContentDisposition: `attachment; filename="${filename}"`,
        ResponseContentType: 'application/octet-stream',
      }),
      { expiresIn: 300 }  // 5min TTL — ausreichend für 100MB bei 3 Mbit/s (Pitfall 6)
    )
  } catch {
    return NextResponse.json({ error: 'Failed to generate download URL' }, { status: 500 })
  }

  return NextResponse.json({ url, filename })
}
