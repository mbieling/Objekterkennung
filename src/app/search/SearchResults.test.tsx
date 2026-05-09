// src/app/search/SearchResults.test.tsx
// Phase 8 — Unit Tests für SearchResults (SEARCH-04, SEARCH-05)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

// SearchResultCard mocken damit keine fetch-Calls entstehen
vi.mock('./SearchResultCard', () => ({
  SearchResultCard: ({ name, similarity }: { name: string; similarity: number }) => (
    <div data-testid="search-result-card">
      {name} - {Math.round(similarity * 100)}%
    </div>
  ),
}))

// Nach dem Mock importieren
import { SearchResults } from './SearchResults'

global.fetch = vi.fn()
global.URL.createObjectURL = vi.fn().mockReturnValue('blob:fake-url')
global.URL.revokeObjectURL = vi.fn()

const mockSearchResult = {
  results: [
    { id: 'id-01', name: 'Flanschplatte', part_number: 'FP-001', project: null,
      status: 'ready' as const, similarity: 0.92, created_at: '2026-01-01T00:00:00Z' },
    { id: 'id-02', name: 'Schraubenring', part_number: null, project: 'Motor',
      status: 'ready' as const, similarity: 0.67, created_at: '2026-01-01T00:00:00Z' },
    { id: 'id-03', name: 'Dichtungsring', part_number: 'DR-42', project: null,
      status: 'ready' as const, similarity: 0.45, created_at: '2026-01-01T00:00:00Z' },
  ],
  query: { threshold: 0, limit: 50, results_count: 3 },
}

describe('Phase 8: SearchResults', () => {
  const mockOnThresholdChange = vi.fn()
  const mockOnLimitChange = vi.fn()

  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('SEARCH-04: Slider-Filterung — threshold 0.5 zeigt nur Treffer mit similarity >= 0.5', () => {
    render(
      <SearchResults
        searchResult={mockSearchResult}
        displayThreshold={0.5}
        displayLimit={10}
        onThresholdChange={mockOnThresholdChange}
        onLimitChange={mockOnLimitChange}
      />
    )
    const cards = screen.getAllByTestId('search-result-card')
    // 0.92 und 0.67 sind >= 0.5; 0.45 nicht
    expect(cards).toHaveLength(2)
    expect(screen.getByText(/Flanschplatte/)).toBeTruthy()
    expect(screen.getByText(/Schraubenring/)).toBeTruthy()
    expect(screen.queryByText(/Dichtungsring/)).toBeNull()
  })

  it('SEARCH-04: Slider-Filterung — threshold 0.9 zeigt Leer-Zustand wenn kein Treffer >= 0.9', () => {
    render(
      <SearchResults
        searchResult={mockSearchResult}
        displayThreshold={0.9}
        displayLimit={10}
        onThresholdChange={mockOnThresholdChange}
        onLimitChange={mockOnLimitChange}
      />
    )
    const cards = screen.getAllByTestId('search-result-card')
    // Nur 0.92 >= 0.9
    expect(cards).toHaveLength(1)
    expect(screen.getByText(/Flanschplatte/)).toBeTruthy()
  })

  it('SEARCH-04: Leer-Zustand zeigt "Keine ähnlichen Teile gefunden." und Slider-Hinweis', () => {
    render(
      <SearchResults
        searchResult={mockSearchResult}
        displayThreshold={1.0}
        displayLimit={10}
        onThresholdChange={mockOnThresholdChange}
        onLimitChange={mockOnLimitChange}
      />
    )
    expect(screen.getByText('Keine ähnlichen Teile gefunden.')).toBeTruthy()
    expect(screen.getByText('Versuche den Ähnlichkeitsschwellwert zu verringern.')).toBeTruthy()
    expect(screen.queryByTestId('search-result-card')).toBeNull()
  })

  it('SEARCH-05: Limit-Select-Wechsel ruft onLimitChange mit neuem Wert auf', () => {
    render(
      <SearchResults
        searchResult={mockSearchResult}
        displayThreshold={0.0}
        displayLimit={10}
        onThresholdChange={mockOnThresholdChange}
        onLimitChange={mockOnLimitChange}
      />
    )
    const trigger = screen.getByRole('combobox')
    fireEvent.click(trigger)
    fireEvent.click(screen.getByText('20'))
    expect(mockOnLimitChange).toHaveBeenCalledWith(20)
  })

  it('SEARCH-05: Limit-Select zeigt Optionen 10, 20, 50', () => {
    render(
      <SearchResults
        searchResult={mockSearchResult}
        displayThreshold={0.0}
        displayLimit={10}
        onThresholdChange={mockOnThresholdChange}
        onLimitChange={mockOnLimitChange}
      />
    )
    // SelectContent ist lazy — Trigger öffnen
    const trigger = screen.getByRole('combobox')
    fireEvent.click(trigger)
    expect(screen.getByText('20')).toBeTruthy()
    expect(screen.getByText('50')).toBeTruthy()
  })

  it('SEARCH-03: Ergebnis-Liste ist nach similarity DESC sortiert (API-Reihenfolge beibehalten)', () => {
    render(
      <SearchResults
        searchResult={mockSearchResult}
        displayThreshold={0.0}
        displayLimit={10}
        onThresholdChange={mockOnThresholdChange}
        onLimitChange={mockOnLimitChange}
      />
    )
    const cards = screen.getAllByTestId('search-result-card')
    // API liefert bereits sortiert: 0.92 > 0.67 > 0.45
    expect(cards[0].textContent).toContain('Flanschplatte')
    expect(cards[1].textContent).toContain('Schraubenring')
    expect(cards[2].textContent).toContain('Dichtungsring')
  })

  it('SEARCH-03: aria-live="polite" auf Ergebnis-Container gesetzt', () => {
    const { container } = render(
      <SearchResults
        searchResult={mockSearchResult}
        displayThreshold={0.0}
        displayLimit={10}
        onThresholdChange={mockOnThresholdChange}
        onLimitChange={mockOnLimitChange}
      />
    )
    expect(container.querySelector('[aria-live="polite"]')).toBeTruthy()
  })
})
