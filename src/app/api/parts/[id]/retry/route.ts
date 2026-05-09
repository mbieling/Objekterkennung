// src/app/api/parts/[id]/retry/route.ts
// POST /api/parts/[id]/retry — ADMIN-04: Reset status + Worker-Enqueue
// Identisches Enqueue-Muster wie src/app/api/upload/confirm/route.ts
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

  const existing = await db`SELECT id, status FROM parts WHERE id = ${id} LIMIT 1`
  if (existing.length === 0) {
    return NextResponse.json({ error: 'Part not found' }, { status: 404 })
  }

  if (existing[0].status !== 'failed') {
    return NextResponse.json(
      { error: 'Only failed parts can be retried' },
      { status: 409 }
    )
  }

  // DB-Update ZUERST (Assumption A4 RESEARCH.md):
  // Falls Worker-Call danach fehlschlägt, kann Admin Retry erneut auslösen.
  await db`UPDATE parts SET status = 'pending' WHERE id = ${id}`

  // Worker-Enqueue — identisches Muster zu confirm/route.ts (Zeilen 46-67)
  const workerUrl = process.env.WORKER_URL
  if (workerUrl) {
    let workerResponse: Response
    try {
      workerResponse = await fetch(`${workerUrl}/enqueue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ part_id: id }),
      })
    } catch {
      return NextResponse.json(
        { error: 'Worker enqueue failed', detail: 'Worker unreachable' },
        { status: 502 }
      )
    }
    if (!workerResponse.ok) {
      return NextResponse.json({ error: 'Worker enqueue failed' }, { status: 502 })
    }
  }

  return NextResponse.json({ part_id: id, status: 'pending' }, { status: 202 })
}
