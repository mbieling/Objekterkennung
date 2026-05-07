// src/lib/db.test.ts
// Integrations-Smoke-Test für Phase 1: Database Foundation
//
// VORAUSSETZUNGEN für einen erfolgreichen Testlauf:
// 1. .env.local enthält DATABASE_URL (Neon connection string)
// 2. supabase/migrations/001_parts_schema.sql wurde in Neon eingespielt
// 3. Die parts-Tabelle existiert in der Datenbank
//
// Ausführen: npm test -- src/lib/db.test.ts
import { describe, it, expect } from 'vitest'
import { db } from './db'

describe('db (Neon)', () => {
  it('verbindet sich mit der parts-Tabelle ohne Fehler', async () => {
    const rows = await db`SELECT id FROM parts LIMIT 1`

    // Leere Tabelle ist OK — kein Fehler = Verbindung funktioniert
    expect(Array.isArray(rows)).toBe(true)
  })

  it('parts-Tabelle hat die erwarteten 17 Spalten', async () => {
    const rows = await db`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'parts'
      ORDER BY ordinal_position
    `

    const columnNames = rows.map((r) => r.column_name)

    const required = [
      'id', 'name', 'part_number', 'project', 'status',
      'sha256', 'original_filename', 'file_size_bytes', 'step_file_path',
      'thumbnail_urls', 'embedding', 'embedding_model', 'embedding_version',
      'is_archived', 'created_at', 'updated_at',
    ]

    for (const col of required) {
      expect(columnNames).toContain(col)
    }
  })

  it('HNSW-Index auf embedding ist aktiv', async () => {
    const rows = await db`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'parts' AND indexdef ILIKE '%hnsw%'
    `

    expect(rows.length).toBeGreaterThanOrEqual(1)
    expect(rows[0].indexname).toBe('parts_embedding_hnsw_idx')
  })
})
