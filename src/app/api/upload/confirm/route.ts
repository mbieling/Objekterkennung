// src/app/api/upload/confirm/route.ts
// POST /api/upload/confirm — Schritt 3 des 2-Schritt-Upload-Flows (D-02)
// Verifiziert dass part_id existiert, dispatched Celery-Job via Worker HTTP /enqueue,
// antwortet mit HTTP 202.
// Server-only — KEIN "use client", keine Browser-Imports.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'

// Zod-Schema — nur part_id nötig (Metadaten wurden bereits im Init-Request gespeichert)
const ConfirmSchema = z.object({
  part_id: z.string().uuid('part_id muss eine gültige UUID sein'),
})

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Body parsen und validieren
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = ConfirmSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { part_id } = parsed.data

  // 2. Verifizieren dass der Part existiert (Schutz gegen Race Conditions)
  const parts = await db`
    SELECT id, status FROM parts WHERE id = ${part_id} LIMIT 1
  `
  if (parts.length === 0) {
    return NextResponse.json({ error: 'Part not found' }, { status: 404 })
  }

  // 3. Celery-Job über Worker-FastAPI /enqueue auslösen (D-04)
  // Worker läuft als separater Service (Docker Compose lokal / Railway prod)
  const workerUrl = process.env.WORKER_URL ?? 'http://localhost:8000'
  let workerResponse: Response
  try {
    workerResponse = await fetch(`${workerUrl}/enqueue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ part_id }),
    })
  } catch (networkError) {
    // Netzwerkfehler: Worker nicht erreichbar
    return NextResponse.json(
      { error: 'Worker enqueue failed', detail: 'Worker unreachable' },
      { status: 502 }
    )
  }

  if (!workerResponse.ok) {
    return NextResponse.json(
      { error: 'Worker enqueue failed' },
      { status: 502 }
    )
  }

  // 4. HTTP 202 Accepted — Job ist in der Queue, Verarbeitung läuft asynchron
  return NextResponse.json({ part_id, status: 'pending' }, { status: 202 })
}
