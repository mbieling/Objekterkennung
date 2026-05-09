// src/app/api/parts/[id]/archive/route.test.ts
// Test-Stubs für POST /api/parts/[id]/archive — ADMIN-03 (Soft-Delete)
// Wave 0: Stubs anlegen; Wave 3: Implementierungen aktivieren

import { describe, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: vi.fn() }))

describe('POST /api/parts/[id]/archive', () => {
  it.todo('setzt status="archived" in der DB')
  it.todo('schreibt is_archived-Boolean NICHT (nur status manipulieren)')
  it.todo('gibt 400 zurück bei ungültiger UUID')
  it.todo('gibt 404 zurück wenn Part nicht existiert')
})
