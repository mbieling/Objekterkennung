// src/hooks/use-part-status.test.ts
// Tests für usePartStatus-Hook (D-04, D-06, INGEST-02)
// STUBS — Logik wird in Plan 04 (Wave 2) implementiert.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('usePartStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    global.fetch = vi.fn() as unknown as typeof fetch
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.skip('polls every 2s in first 30s', async () => {
    // STUB — Plan 04
  })

  it.skip('switches to 5s after 30s', async () => {
    // STUB — Plan 04
  })

  it.skip('stops on ready', async () => {
    // STUB — Plan 04
  })

  it.skip('stops on failed', async () => {
    // STUB — Plan 04
  })

  it.skip('timeouts after 5 minutes', async () => {
    // STUB — Plan 04
  })

  it.skip('cleans up timers on unmount', async () => {
    // STUB — Plan 04
  })

  it.skip('does not poll when partId is null', async () => {
    // STUB — Plan 04
  })

  it.skip('surfaces error only after 3 consecutive failures', async () => {
    // STUB — Plan 04
  })
})
