// Tests für usePartDetail-Hook (D-03, D-12, D-13, DETAIL-01, DETAIL-02)
// Aktiviert in Plan 09-03 (Wave 2) — alle Tests grün nach Hook-Implementierung.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePartDetail } from './usePartDetail'

function mockFetchResponse(body: unknown, status = 200) {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response)
}

const mockPart = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Flansch M12',
  part_number: 'FL-042',
  project: 'Getriebe',
  status: 'ready' as const,
  thumbnail_count: 3,
  created_at: '2026-05-09T10:00:00Z',
}

describe('usePartDetail', () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('gibt { part, thumbnailUrls, isLoading: false } nach erfolgreichem parallelen fetch zurück', async () => {
    // Promise.all: zuerst parts-API, dann thumbnails-API
    mockFetchResponse({ part: mockPart })
    mockFetchResponse({ urls: ['https://s3.example.com/view_0.png', 'https://s3.example.com/view_1.png'] })

    const { result } = renderHook(() => usePartDetail(mockPart.id))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.part).toEqual(mockPart)
    expect(result.current.thumbnailUrls).toHaveLength(2)
    expect(result.current.error).toBeNull()
  })

  it('gibt { error: "not_found" } zurück wenn parts-API 404 liefert', async () => {
    mockFetchResponse({ error: 'Part not found' }, 404)
    mockFetchResponse({ urls: [] })

    const { result } = renderHook(() => usePartDetail(mockPart.id))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.isLoading).toBe(false)
    expect(result.current.part).toBeNull()
    expect(result.current.error).toBe('not_found')
  })

  it('thumbnailUrls ist [] wenn /thumbnails non-ok Antwort liefert', async () => {
    mockFetchResponse({ part: mockPart })
    // Thumbnails-API liefert non-ok → Hook gibt leeres Array zurück
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Server error' }),
    } as Response)

    const { result } = renderHook(() => usePartDetail(mockPart.id))

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    expect(result.current.thumbnailUrls).toEqual([])
    expect(result.current.part).toEqual(mockPart)
  })

  it('isLoading ist true initial und false nach Promise.all-Auflösung', async () => {
    mockFetchResponse({ part: mockPart })
    mockFetchResponse({ urls: [] })

    const { result } = renderHook(() => usePartDetail(mockPart.id))

    // Initial: isLoading = true
    expect(result.current.isLoading).toBe(true)

    await act(async () => {
      await Promise.resolve()
      await Promise.resolve()
    })

    // Nach Auflösung: isLoading = false
    expect(result.current.isLoading).toBe(false)
  })
})
