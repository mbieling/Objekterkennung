// Tests für usePartDetail-Hook (D-03, D-12, D-13, DETAIL-01, DETAIL-02)
// Aktiviert in Plan 09-03 (Wave 2) — alle Tests grün nach Hook-Implementierung.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

// usePartDetail noch nicht implementiert — Import wird in Wave 2 (09-03) aufgelöst.
// import { usePartDetail } from './usePartDetail'

function mockFetchResponse(body: unknown, status = 200) {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response)
}

describe('usePartDetail', () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.todo('gibt { part, thumbnailUrls, isLoading: false } nach erfolgreichem parallelen fetch zurück')
  it.todo('gibt { error: "not_found" } zurück wenn parts-API 404 liefert')
  it.todo('thumbnailUrls ist [] wenn /thumbnails non-ok Antwort liefert')
  it.todo('isLoading ist true initial und false nach Promise.all-Auflösung')
})
