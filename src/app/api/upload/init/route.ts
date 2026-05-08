// src/app/api/upload/init/route.ts
// POST /api/upload/init — Schritt 1 des 2-Schritt-Upload-Flows (D-02)
// Nimmt Metadaten + SHA-256, prüft Duplikate (INGEST-04), legt DB-Eintrag an,
// gibt Presigned S3 PUT-URL zurück.
// Server-only — KEIN "use client", keine Browser-Imports.

import { NextResponse } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { z } from 'zod'
import { db } from '@/lib/db'
import { s3, BUCKET_STEPS } from '@/lib/s3'

// Zod-Schema für den Init-Request-Body (D-07, D-08)
const InitSchema = z.object({
  name: z.string().min(1, 'name ist Pflichtfeld').max(255),
  sha256: z
    .string()
    .length(64, 'sha256 muss 64 Hex-Zeichen lang sein')
    .regex(/^[0-9a-f]+$/i, 'sha256 muss hexadezimal sein'),
  original_filename: z.string().min(1).max(255),
  file_size_bytes: z
    .number()
    .int()
    .positive()
    .max(100 * 1024 * 1024, 'Maximale Dateigröße: 100 MB'),
  part_number: z.string().max(100).optional(),
  project: z.string().max(255).optional(),
})

export async function POST(request: Request): Promise<NextResponse> {
  // 1. Body parsen und validieren
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = InitSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid input', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { name, sha256, original_filename, file_size_bytes, part_number, project } = parsed.data

  // 2. SHA-256-Duplikat-Prüfung (INGEST-04) — vor jedem S3-Aufruf
  const existing = await db`
    SELECT id FROM parts WHERE sha256 = ${sha256} LIMIT 1
  `
  if (existing.length > 0) {
    return NextResponse.json(
      { error: 'Duplicate file', existing_part_id: existing[0].id },
      { status: 409 }
    )
  }

  // 3. parts-Eintrag anlegen (status='pending')
  const [part] = await db`
    INSERT INTO parts (
      name, sha256, original_filename, file_size_bytes,
      part_number, project, status, step_file_path
    )
    VALUES (
      ${name}, ${sha256}, ${original_filename}, ${file_size_bytes},
      ${part_number ?? null}, ${project ?? null}, 'pending', ${''}
    )
    RETURNING id
  `

  // 4. Presigned S3 PUT-URL generieren (900s = 15 Minuten — ausreichend für 100 MB)
  // Content-Type NICHT in signableHeaders — verhindert Content-Type-Mismatch (Pitfall 1)
  const presignedUrl = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: BUCKET_STEPS,
      Key: `${part.id}/original.step`,
      ContentType: 'application/octet-stream',
    }),
    { expiresIn: 900 }
  )

  return NextResponse.json({ part_id: part.id, presigned_url: presignedUrl })
}
