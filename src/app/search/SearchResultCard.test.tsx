// src/app/search/SearchResultCard.test.tsx
// Phase 8 — Unit Tests für SearchResultCard (SEARCH-03)

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { SearchResultCard } from './SearchResultCard'

global.fetch = vi.fn()
global.URL.createObjectURL = vi.fn().mockReturnValue('blob:fake-url')
global.URL.revokeObjectURL = vi.fn()

describe('Phase 8: SearchResultCard', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { vi.restoreAllMocks() })

  it('SEARCH-03: zeigt Skeleton während Thumbnail lädt', () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))
    const { container } = render(
      <SearchResultCard id="test-id" name="Testbauteil" part_number={null} similarity={0.75} />
    )
    // Skeleton sollte sichtbar sein (animate-pulse Klasse)
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })

  // Hebel 1: Farbschwellen angehoben — DINOv3-Baseline in CAD-Render-Domäne ist hoch.
  //   ≥ 0.88 grün, ≥ 0.78 amber, < 0.78 rot.
  it('SEARCH-03: Badge bg-green-500 bei similarity >= 0.88', () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))
    const { container } = render(
      <SearchResultCard id="test-id" name="Teil" part_number={null} similarity={0.90} />
    )
    const badge = container.querySelector('[class*="bg-green-500"]')
    expect(badge).toBeTruthy()
    expect(badge?.textContent).toBe('90%')
  })

  it('SEARCH-03: Badge bg-green-500 bei similarity 0.95', () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))
    const { container } = render(
      <SearchResultCard id="test-id" name="Teil" part_number={null} similarity={0.95} />
    )
    expect(container.querySelector('[class*="bg-green-500"]')).toBeTruthy()
  })

  it('SEARCH-03: Badge bg-amber-500 bei similarity 0.78–0.87', () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))
    const { container } = render(
      <SearchResultCard id="test-id" name="Teil" part_number={null} similarity={0.80} />
    )
    const badge = container.querySelector('[class*="bg-amber-500"]')
    expect(badge).toBeTruthy()
    expect(badge?.textContent).toBe('80%')
  })

  it('SEARCH-03: Badge bg-red-500 bei similarity < 0.78', () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))
    const { container } = render(
      <SearchResultCard id="test-id" name="Teil" part_number={null} similarity={0.67} />
    )
    const badge = container.querySelector('[class*="bg-red-500"]')
    expect(badge).toBeTruthy()
    expect(badge?.textContent).toBe('67%')
  })

  it('SEARCH-03: Link href="/parts/{id}" korrekt gesetzt', () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))
    const { container } = render(
      <SearchResultCard id="abc-123" name="Teil" part_number={null} similarity={0.75} />
    )
    const link = container.querySelector('a')
    expect(link?.getAttribute('href')).toBe('/parts/abc-123')
  })

  it('SEARCH-03: Name mit truncate dargestellt', () => {
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))
    render(<SearchResultCard id="test-id" name="Flanschplatte" part_number={null} similarity={0.75} />)
    expect(screen.getByText('Flanschplatte')).toBeTruthy()
  })

  it('SEARCH-03: Thumbnail erscheint nach erfolgreichem fetch', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ url: 'https://example.com/thumb.png' }),
    } as Response)
    const { container } = render(
      <SearchResultCard id="test-id" name="Teil" part_number={null} similarity={0.75} />
    )
    await waitFor(() => {
      expect(container.querySelector('img')).toBeTruthy()
    })
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://example.com/thumb.png')
  })

  it('SEARCH-03: Skeleton bleibt sichtbar bei Thumbnail-404', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: async () => null,
    } as Response)
    const { container } = render(
      <SearchResultCard id="test-id" name="Teil" part_number={null} similarity={0.75} />
    )
    // Nach fetch-Fehler: kein img, Skeleton bleibt
    await new Promise(r => setTimeout(r, 50))
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.animate-pulse')).toBeTruthy()
  })
})
