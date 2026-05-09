// src/app/api/parts/[id]/route.ts
// PATCH /api/parts/[id] — ADMIN-02: Metadaten aktualisieren
// DELETE /api/parts/[id] — ADMIN-03: Hard-Delete (DB + S3)
// Server-only — KEIN "use client", keine Browser-Imports.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { DeleteObjectsCommand } from '@aws-sdk/client-s3'
import { s3, BUCKET_STEPS, BUCKET_THUMBNAILS } from '@/lib/s3'

const ParamsSchema = z.object({
  id: z.string().uuid('id muss eine gültige UUID sein'),
})

// 'archived' bewusst NICHT in der Enum — Archivierung nur via /archive-Route (D-10, Pitfall 4)
const PatchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  part_number: z.string().max(100).nullable().optional(),
  project: z.string().max(200).nullable().optional(),
  status: z.enum(['pending', 'processing', 'ready', 'failed']).optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params  // Next.js 16: params ist Promise (Pitfall 5)

  const parsedParams = ParamsSchema.safeParse({ id })
  if (!parsedParams.success) {
    return NextResponse.json(
      { error: 'Invalid id', details: parsedParams.error.flatten() },
      { status: 400 }
    )
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsedBody = PatchSchema.safeParse(body)
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsedBody.error.flatten() },
      { status: 400 }
    )
  }

  // Existenz-Check
  const existing = await db`SELECT id FROM parts WHERE id = ${id} LIMIT 1`
  if (existing.length === 0) {
    return NextResponse.json({ error: 'Part not found' }, { status: 404 })
  }

  const { name, part_number, project, status } = parsedBody.data

  const updated = await db`
    UPDATE parts
    SET
      name = COALESCE(${name ?? null}, name),
      part_number = COALESCE(${part_number !== undefined ? part_number : null}, part_number),
      project = COALESCE(${project !== undefined ? project : null}, project),
      status = COALESCE(${status ?? null}, status)
    WHERE id = ${id}
    RETURNING id, name, part_number, project, status, thumbnail_count, created_at
  `

  return NextResponse.json({ part: updated[0] })
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params

  const parsedParams = ParamsSchema.safeParse({ id })
  if (!parsedParams.success) {
    return NextResponse.json(
      { error: 'Invalid id', details: parsedParams.error.flatten() },
      { status: 400 }
    )
  }

  // Existenz-Check
  const existing = await db`SELECT id FROM parts WHERE id = ${id} LIMIT 1`
  if (existing.length === 0) {
    return NextResponse.json({ error: 'Part not found' }, { status: 404 })
  }

  // S3 ZUERST löschen (Pitfall 6: S3-Waisen sind harmloser als DB-Einträge ohne S3)
  // 1. STEP-Datei aus parts-steps
  await s3.send(new DeleteObjectsCommand({
    Bucket: BUCKET_STEPS,
    Delete: {
      Objects: [{ Key: `${id}/original.step` }],
      Quiet: true,  // Unterdrückt leere Error-Responses für nicht existierende Keys
    },
  }))

  // 2. Alle Thumbnails aus parts-thumbnails (view_0.png bis view_7.png = 8 Objekte)
  await s3.send(new DeleteObjectsCommand({
    Bucket: BUCKET_THUMBNAILS,
    Delete: {
      Objects: Array.from({ length: 8 }, (_, i) => ({ Key: `${id}/view_${i}.png` })),
      Quiet: true,
    },
  }))

  // 3. DB-Zeile löschen — erst NACH S3 (best-effort S3-Cleanup)
  await db`DELETE FROM parts WHERE id = ${id}`

  return NextResponse.json({ deleted: id })
}
