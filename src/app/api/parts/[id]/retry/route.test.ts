// src/app/api/parts/[id]/retry/route.test.ts
// Test-Stubs für POST /api/parts/[id]/retry — ADMIN-04
// Wave 0: Stubs anlegen; Wave 3: Implementierungen aktivieren

import { describe, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: vi.fn() }))

describe('POST /api/parts/[id]/retry', () => {
  it.todo('setzt status="pending" in DB BEVOR Worker aufgerufen wird')
  it.todo('ruft WORKER_URL/enqueue auf (identisch zu confirm/route.ts)')
  it.todo('gibt 409 zurück wenn status != "failed"')
  it.todo('gibt 400 zurück bei ungültiger UUID')
  it.todo('gibt 404 zurück wenn Part nicht existiert')
  it.todo('gibt 202 zurück bei Erfolg')
})
