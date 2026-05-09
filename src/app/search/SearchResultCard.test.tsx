// src/app/search/SearchResultCard.test.tsx
// Phase 8 — Unit Tests für SearchResultCard (SEARCH-03)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

global.fetch = vi.fn()
global.URL.createObjectURL = vi.fn().mockReturnValue('blob:fake-url')
global.URL.revokeObjectURL = vi.fn()

describe('Phase 8: SearchResultCard', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it.todo('SEARCH-03: zeigt Skeleton während Thumbnail lädt')
  it.todo('SEARCH-03: Badge bg-green-500 bei similarity >= 0.80')
  it.todo('SEARCH-03: Badge bg-amber-500 bei similarity 0.60–0.79')
  it.todo('SEARCH-03: Badge bg-red-500 bei similarity < 0.60')
  it.todo('SEARCH-03: Link href="/parts/{id}" korrekt gesetzt')
  it.todo('SEARCH-03: Name mit truncate dargestellt')
  it.todo('SEARCH-03: Thumbnail erscheint nach erfolgreichem fetch')
  it.todo('SEARCH-03: Skeleton bleibt sichtbar bei Thumbnail-404')
})
