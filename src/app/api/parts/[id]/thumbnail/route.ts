// src/app/api/parts/[id]/thumbnail/route.ts
// GET /api/parts/[id]/thumbnail — D-08, INGEST-02
// Liefert 60-Sekunden-Presigned-S3-URL für view_0.png (Frontansicht).
// Server-only — KEIN "use client", keine Browser-Imports.

import { NextResponse } from 'next/server'
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { z } from 'zod'
import { db } from '@/lib/db'
import { s3, BUCKET_THUMBNAILS } from '@/lib/s3'

// Zod-Schema für params.id — Path-Traversal-Schutz vor S3-Key-Konstruktion (security.md V5)
const ParamsSchema = z.object({
  id: z.string().uuid('id muss eine gültige UUID sein'),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }   // Next.js 16: params ist Promise
): Promise<NextResponse> {
  const { id } = await params

  // 1. UUID validieren BEVOR DB-Query oder S3-Key-Konstruktion (Threat T-04-08)
  const parsed = ParamsSchema.safeParse({ id })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid id', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // 2. Part-Existenz und Status-Check
  const rows = await db`
    SELECT status FROM parts WHERE id = ${id} LIMIT 1
  `
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Part not found' }, { status: 404 })
  }
  if (rows[0].status !== 'ready') {
    return NextResponse.json({ error: 'Thumbnail not ready' }, { status: 409 })
  }

  // 3. S3-Key gemäß Pfadkonvention (STATE.md: view_0..view_7.png)
  const key = `${id}/view_0.png`

  // 4. HeadObject prüft Existenz BEVOR signiert wird (Pitfall 5: race condition)
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET_THUMBNAILS, Key: key }))
  } catch {
    return NextResponse.json({ error: 'Thumbnail object missing' }, { status: 404 })
  }

  // 5. Presigned GET-URL — 60s Lifetime per D-08
  let url: string
  try {
    url = await getSignedUrl(
      s3,
      new GetObjectCommand({ Bucket: BUCKET_THUMBNAILS, Key: key }),
      { expiresIn: 60 }
    )
  } catch {
    return NextResponse.json({ error: 'Failed to generate thumbnail URL' }, { status: 500 })
  }

  return NextResponse.json({ url })
}
