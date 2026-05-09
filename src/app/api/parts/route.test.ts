// src/app/api/parts/route.test.ts
// Test-Stubs für GET /api/parts — ADMIN-01
// Wave 0: Stubs anlegen; Wave 1: Implementierungen aktivieren

import { describe, it, vi } from 'vitest'

vi.mock('@/lib/db', () => ({ db: vi.fn() }))

describe('GET /api/parts', () => {
  it.todo('gibt alle Teile als Array zurück')
  it.todo('gibt leeres Array zurück wenn keine Teile vorhanden')
  it.todo('schließt das embedding-Feld aus der Response aus')
})
