// src/hooks/use-part-status.test.ts
// Tests für usePartStatus-Hook (D-04, D-06, INGEST-02)
// Aktiviert in Plan 04 (Wave 2) — alle 8 Tests grün mit fake timers.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePartStatus } from './use-part-status'

function mockFetchResponse(body: unknown, status = 200) {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response)
}

describe('usePartStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    global.fetch = vi.fn() as unknown as typeof fetch
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('polls every 2s in first 30s', async () => {
    // Initial-Fetch + alle Tick-Fetches geben pending zurück
    for (let i = 0; i < 10; i++) mockFetchResponse({ status: 'pending', thumbnail_count: 0 })

    renderHook(() => usePartStatus('123e4567-e89b-12d3-a456-426614174000'))
    // Initial-Fetch
    await act(async () => { await Promise.resolve() })
    // 2s später: 2. Fetch
    await act(async () => { vi.advanceTimersByTime(2000); await Promise.resolve() })
    // 4s: 3. Fetch
    await act(async () => { vi.advanceTimersByTime(2000); await Promise.resolve() })
    // 6s: 4. Fetch
    await act(async () => { vi.advanceTimersByTime(2000); await Promise.resolve() })

    // 4 fetches in den ersten 6s (initial + 3 Ticks)
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(3)
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeLessThanOrEqual(5)
  })

  it('switches to 5s after 30s', async () => {
    for (let i = 0; i < 30; i++) mockFetchResponse({ status: 'pending', thumbnail_count: 0 })

    renderHook(() => usePartStatus('123e4567-e89b-12d3-a456-426614174000'))
    await act(async () => { await Promise.resolve() })

    // Auf 30s vorspulen (in 2s-Intervall: ~15 Ticks)
    await act(async () => { vi.advanceTimersByTime(30_000); await Promise.resolve() })
    const callsAt30s = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    // Weitere 10s — bei 5s-Intervall sollten ~2 weitere Calls passieren
    await act(async () => { vi.advanceTimersByTime(10_000); await Promise.resolve() })
    const callsAt40s = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    expect(callsAt40s - callsAt30s).toBeGreaterThanOrEqual(1)
    expect(callsAt40s - callsAt30s).toBeLessThanOrEqual(3)
  })

  it('stops on ready', async () => {
    mockFetchResponse({ status: 'ready', thumbnail_count: 8 })

    const { result } = renderHook(() => usePartStatus('123e4567-e89b-12d3-a456-426614174000'))
    await act(async () => { await Promise.resolve() })

    expect(result.current.status).toBe('ready')
    const callsAfterReady = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length

    // Weitere Zeit vorspulen — keine weiteren Fetches
    await act(async () => { vi.advanceTimersByTime(60_000); await Promise.resolve() })
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterReady)
  })

  it('stops on failed', async () => {
    mockFetchResponse({ status: 'failed', thumbnail_count: 0 })
    const { result } = renderHook(() => usePartStatus('123e4567-e89b-12d3-a456-426614174000'))
    await act(async () => { await Promise.resolve() })
    expect(result.current.status).toBe('failed')
    const callsAfterFailed = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length
    await act(async () => { vi.advanceTimersByTime(60_000); await Promise.resolve() })
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterFailed)
  })

  it('timeouts after 5 minutes', async () => {
    for (let i = 0; i < 200; i++) mockFetchResponse({ status: 'pending', thumbnail_count: 0 })
    const { result } = renderHook(() => usePartStatus('123e4567-e89b-12d3-a456-426614174000'))
    await act(async () => { await Promise.resolve() })
    await act(async () => { vi.advanceTimersByTime(5 * 60 * 1000 + 100); await Promise.resolve() })
    expect(result.current.timedOut).toBe(true)
  })

  it('cleans up timers on unmount', async () => {
    for (let i = 0; i < 10; i++) mockFetchResponse({ status: 'pending', thumbnail_count: 0 })
    const { unmount } = renderHook(() => usePartStatus('123e4567-e89b-12d3-a456-426614174000'))
    await act(async () => { await Promise.resolve() })
    unmount()
    const callsAfterUnmount = (global.fetch as ReturnType<typeof vi.fn>).mock.calls.length
    await act(async () => { vi.advanceTimersByTime(60_000); await Promise.resolve() })
    // Keine weiteren Fetches nach Unmount
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callsAfterUnmount)
  })

  it('does not poll when partId is null', async () => {
    renderHook(() => usePartStatus(null))
    await act(async () => { vi.advanceTimersByTime(60_000); await Promise.resolve() })
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(0)
  })

  it('surfaces error only after 3 consecutive failures', async () => {
    // 3 Failures, dann 1 Erfolg
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(new Error('net1'))
      .mockRejectedValueOnce(new Error('net2'))
      .mockRejectedValueOnce(new Error('net3'))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: 'pending', thumbnail_count: 0 }) } as Response)

    const { result } = renderHook(() => usePartStatus('123e4567-e89b-12d3-a456-426614174000'))
    await act(async () => { await Promise.resolve() })  // initial — 1. failure
    expect(result.current.error).toBeNull()
    await act(async () => { vi.advanceTimersByTime(2000); await Promise.resolve() })  // 2. failure
    expect(result.current.error).toBeNull()
    await act(async () => { vi.advanceTimersByTime(2000); await Promise.resolve() })  // 3. failure
    expect(result.current.error).toBeInstanceOf(Error)
    await act(async () => { vi.advanceTimersByTime(2000); await Promise.resolve() })  // success → reset
    expect(result.current.error).toBeNull()
  })
})
