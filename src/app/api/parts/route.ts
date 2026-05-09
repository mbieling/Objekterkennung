// src/app/api/parts/route.ts
// GET /api/parts — ADMIN-01: Alle Teile für Admin-Katalog abrufen
// Phase 10 — SC-4: Serverseitige Pagination (?page=N&limit=20)
// Server-only — KEIN "use client", keine Browser-Imports.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { z } from 'zod'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['all', 'pending', 'processing', 'ready', 'failed', 'archived']).optional(),
  search: z.string().max(200).optional(),
})

/** Escapes ILIKE metacharacters (%, _) so user input is treated as literal text. */
function escapeLike(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl
  const parsed = querySchema.safeParse({
    page: searchParams.get('page') ?? undefined,
    limit: searchParams.get('limit') ?? undefined,
    status: searchParams.get('status') ?? undefined,
    search: searchParams.get('search') ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({ error: 'Ungültige Parameter' }, { status: 400 })
  }

  const { page, limit, status, search } = parsed.data
  const offset = (page - 1) * limit

  // WHERE-Bedingungen dynamisch aufbauen
  // Neon tagged template literals unterstützen keine dynamischen WHERE-Klauseln direkt;
  // daher separate Queries je nach Kombination der Filter.
  // Vereinfachter Ansatz: alle Filter optional, separate Count-Query für total_count.

  let rows: Record<string, unknown>[]
  let countResult: Record<string, unknown>[]

  if (status && status !== 'all' && search) {
    const searchPattern = `%${escapeLike(search)}%`
    rows = await db`
      SELECT id, name, part_number, project, status, thumbnail_count, created_at
      FROM parts
      WHERE status = ${status}
        AND (name ILIKE ${searchPattern} OR part_number ILIKE ${searchPattern})
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `
    countResult = await db`
      SELECT COUNT(*)::int AS total
      FROM parts
      WHERE status = ${status}
        AND (name ILIKE ${searchPattern} OR part_number ILIKE ${searchPattern})
    `
  } else if (status && status !== 'all') {
    rows = await db`
      SELECT id, name, part_number, project, status, thumbnail_count, created_at
      FROM parts
      WHERE status = ${status}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `
    countResult = await db`
      SELECT COUNT(*)::int AS total FROM parts WHERE status = ${status}
    `
  } else if (search) {
    const searchPattern = `%${escapeLike(search)}%`
    rows = await db`
      SELECT id, name, part_number, project, status, thumbnail_count, created_at
      FROM parts
      WHERE name ILIKE ${searchPattern} OR part_number ILIKE ${searchPattern}
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `
    countResult = await db`
      SELECT COUNT(*)::int AS total
      FROM parts
      WHERE name ILIKE ${searchPattern} OR part_number ILIKE ${searchPattern}
    `
  } else {
    rows = await db`
      SELECT id, name, part_number, project, status, thumbnail_count, created_at
      FROM parts
      ORDER BY created_at DESC
      LIMIT ${limit} OFFSET ${offset}
    `
    countResult = await db`SELECT COUNT(*)::int AS total FROM parts`
  }

  const totalCount = Number(countResult[0]?.total ?? 0)
  const totalPages = Math.max(1, Math.ceil(totalCount / limit))

  // embedding wird NICHT zurückgegeben — 768-dim, zu groß für Admin-UI
  return NextResponse.json({
    parts: rows,
    total_count: totalCount,
    page,
    limit,
    total_pages: totalPages,
  })
}
