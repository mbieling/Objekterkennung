// src/app/search/SearchResults.test.tsx
// Phase 8 — Unit Tests für SearchResults (SEARCH-04, SEARCH-05)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

global.fetch = vi.fn()
global.URL.createObjectURL = vi.fn().mockReturnValue('blob:fake-url')
global.URL.revokeObjectURL = vi.fn()

describe('Phase 8: SearchResults', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it.todo('SEARCH-04: Slider-Filterung — threshold 0.5 zeigt nur Treffer mit similarity >= 0.5')
  it.todo('SEARCH-04: Slider-Filterung — threshold 0.9 zeigt Leer-Zustand wenn kein Treffer >= 0.9')
  it.todo('SEARCH-04: Leer-Zustand zeigt "Keine ähnlichen Teile gefunden." und Slider-Hinweis')
  it.todo('SEARCH-05: Limit-Select-Wechsel ruft onLimitChange mit neuem Wert auf')
  it.todo('SEARCH-05: Limit-Select zeigt Optionen 10, 20, 50')
  it.todo('SEARCH-03: Ergebnis-Liste ist nach similarity DESC sortiert (API-Reihenfolge beibehalten)')
  it.todo('SEARCH-03: aria-live="polite" auf Ergebnis-Container gesetzt')
})
