// src/app/api/parts/[id]/status/route.ts
// GET /api/parts/[id]/status — D-05, INGEST-02
// Liest status + thumbnail_count aus parts-Tabelle. KEIN Worker-Touch.
// Server-only — KEIN "use client", keine Browser-Imports.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'

// Zod-Schema für params.id — Path-Traversal-Schutz vor DB-Query (security.md V5)
const ParamsSchema = z.object({
  id: z.string().uuid('id muss eine gültige UUID sein'),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }   // Next.js 16: params ist Promise
): Promise<NextResponse> {
  const { id } = await params

  // 1. UUID validieren BEVOR DB-Query (Threat T-04-04: Path-Traversal/SSRF)
  const parsed = ParamsSchema.safeParse({ id })
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid id', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  // 2. DB-Read — Tagged-template-literal verhindert SQL-Injection
  const rows = await db`
    SELECT status, thumbnail_count
    FROM parts
    WHERE id = ${id}
    LIMIT 1
  `

  if (rows.length === 0) {
    return NextResponse.json({ error: 'Part not found' }, { status: 404 })
  }

  // 3. Response — UI-SPEC.md "GET /api/parts/[id]/status" definiert Schema
  return NextResponse.json({
    status: rows[0].status,                         // 'pending'|'processing'|'ready'|'failed'
    thumbnail_count: rows[0].thumbnail_count ?? 0,  // null-safe (alte Rows ohne Migration)
  })
}
