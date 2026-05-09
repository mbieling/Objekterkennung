// src/app/api/parts/[id]/route.test.ts
// Test-Stubs für PATCH (ADMIN-02) und DELETE (ADMIN-03)
// Wave 0: Stubs anlegen; Wave 2–3: Implementierungen aktivieren

import { describe, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: vi.fn() }))
vi.mock('@/lib/s3', () => ({
  s3: { send: vi.fn() },
  BUCKET_STEPS: 'parts-steps',
  BUCKET_THUMBNAILS: 'parts-thumbnails',
}))
vi.mock('@aws-sdk/client-s3', () => ({
  DeleteObjectsCommand: vi.fn(),
}))

describe('PATCH /api/parts/[id]', () => {
  it.todo('aktualisiert name, part_number, project, status')
  it.todo('gibt 400 zurück bei ungültiger UUID')
  it.todo('gibt 404 zurück wenn Part nicht existiert')
  it.todo('lehnt status="archived" im Body ab (HTTP 400)')
})

describe('DELETE /api/parts/[id]', () => {
  it.todo('löscht S3-Objekte (parts-steps + parts-thumbnails) VOR DB-Löschung')
  it.todo('ruft DeleteObjectsCommand (plural/Batch) auf, nicht DeleteObjectCommand (singular)')
  it.todo('löscht DB-Zeile nach S3-Cleanup')
  it.todo('gibt 400 zurück bei ungültiger UUID')
  it.todo('gibt 404 zurück wenn Part nicht existiert')
})
