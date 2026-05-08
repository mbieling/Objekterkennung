// src/hooks/use-part-status.ts
// Custom Hook für Status-Polling — D-04, D-06, INGEST-02
// Variables Intervall (2s erste 30s, dann 5s), 5-Min-Timeout, Failure-Threshold 3.
// Client-only — verwendet setInterval/setTimeout/AbortController.
'use client'

import { useEffect, useRef, useState } from 'react'

export type PartStatus = 'pending' | 'processing' | 'ready' | 'failed'

export interface UsePartStatusResult {
  status: PartStatus | null
  thumbnailCount: number
  error: Error | null
  timedOut: boolean
}

// Module-level constants (analog zu use-mobile.tsx MOBILE_BREAKPOINT)
const FAST_INTERVAL_MS = 2_000
const SLOW_INTERVAL_MS = 5_000
const FAST_PHASE_DURATION_MS = 30_000
const TIMEOUT_MS = 5 * 60 * 1_000
const FAILURE_THRESHOLD = 3

export function usePartStatus(partId: string | null): UsePartStatusResult {
  const [status, setStatus] = useState<PartStatus | null>(null)
  const [thumbnailCount, setThumbnailCount] = useState(0)
  const [error, setError] = useState<Error | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const failuresRef = useRef(0)

  useEffect(() => {
    // Reset bei partId=null (kein Polling)
    if (!partId) {
      setStatus(null)
      setThumbnailCount(0)
      setError(null)
      setTimedOut(false)
      failuresRef.current = 0
      return
    }

    const startedAt = Date.now()
    let stopped = false
    let switched = false
    const intervalRef = { id: null as ReturnType<typeof setInterval> | null }
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    const controller = new AbortController()

    const fetchStatus = async () => {
      if (stopped) return
      try {
        const res = await fetch(`/api/parts/${partId}/status`, { signal: controller.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = (await res.json()) as { status: PartStatus; thumbnail_count: number }
        failuresRef.current = 0
        setError(null)
        setStatus(data.status)
        setThumbnailCount(data.thumbnail_count)
        // Stop-Bedingung — D-04
        if (data.status === 'ready' || data.status === 'failed') {
          stopped = true
          if (intervalRef.id) clearInterval(intervalRef.id)
          if (timeoutId) clearTimeout(timeoutId)
        }
      } catch (e) {
        if (controller.signal.aborted) return
        failuresRef.current += 1
        // Failure-Threshold — UI-SPEC.md
        if (failuresRef.current >= FAILURE_THRESHOLD) {
          setError(e as Error)
        }
      }
    }

    // Initial-Fetch sofort (bevor erstes Intervall feuert)
    fetchStatus()

    // Intervall: feuert fetchStatus + One-Shot-Wechsel zu langsam nach 30s — D-04
    const tick = () => {
      if (stopped) return
      if (!switched && Date.now() - startedAt >= FAST_PHASE_DURATION_MS) {
        switched = true
        if (intervalRef.id) clearInterval(intervalRef.id)
        intervalRef.id = setInterval(tick, SLOW_INTERVAL_MS)
      }
      fetchStatus()
    }
    intervalRef.id = setInterval(tick, FAST_INTERVAL_MS)

    // 5-Minuten-Timeout — D-06
    timeoutId = setTimeout(() => {
      stopped = true
      setTimedOut(true)
      if (intervalRef.id) clearInterval(intervalRef.id)
    }, TIMEOUT_MS)

    // Cleanup — verhindert Memory-Leak (Pitfall 2 aus RESEARCH.md)
    return () => {
      stopped = true
      controller.abort()
      if (intervalRef.id) clearInterval(intervalRef.id)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [partId])

  return { status, thumbnailCount, error, timedOut }
}
