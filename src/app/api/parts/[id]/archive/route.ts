// src/app/api/parts/[id]/archive/route.ts
// POST /api/parts/[id]/archive — ADMIN-03: Soft-Delete (setzt status='archived')
// Server-only — KEIN "use client", keine Browser-Imports.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'

const ParamsSchema = z.object({
  id: z.string().uuid('id muss eine gültige UUID sein'),
})

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params

  const parsed = ParamsSchema.safeParse({ id })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid id', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const existing = await db`SELECT id FROM parts WHERE id = ${id} LIMIT 1`
  if (existing.length === 0) {
    return NextResponse.json({ error: 'Part not found' }, { status: 404 })
  }

  // Soft-Delete: nur status schreiben — is_archived-Boolean NICHT (D-10 + RESEARCH.md DB-Schema-Anmerkung)
  await db`UPDATE parts SET status = 'archived' WHERE id = ${id}`

  return NextResponse.json({ id, status: 'archived' })
}
