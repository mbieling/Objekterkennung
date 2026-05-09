// src/app/api/parts/route.ts
// GET /api/parts — ADMIN-01: Alle Teile für Admin-Katalog abrufen
// Server-only — KEIN "use client", keine Browser-Imports.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(): Promise<NextResponse> {
  const rows = await db`
    SELECT id, name, part_number, project, status, thumbnail_count, created_at
    FROM parts
    ORDER BY created_at DESC
  `
  // embedding wird NICHT zurückgegeben — 768-dim, zu groß für Admin-UI
  // is_archived wird NICHT zurückgegeben — Phase 5 nutzt ausschließlich status (D-10)
  return NextResponse.json({ parts: rows })
}
