// Custom Hook für Part-Detail-Seite — D-03, D-12, D-13, DETAIL-01, DETAIL-02
// Parallele API-Anfragen: GET /api/parts/[id] + GET /api/parts/[id]/thumbnails
'use client'

import { useState, useEffect } from 'react'

export interface Part {
  id: string
  name: string
  part_number: string | null
  project: string | null
  status: 'pending' | 'processing' | 'ready' | 'failed'
  thumbnail_count: number
  created_at: string
}

export interface UsePartDetailResult {
  part: Part | null
  thumbnailUrls: string[]
  isLoading: boolean
  error: 'not_found' | 'error' | null
}

export function usePartDetail(id: string): UsePartDetailResult {
  const [part, setPart] = useState<Part | null>(null)
  const [thumbnailUrls, setThumbnailUrls] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<'not_found' | 'error' | null>(null)

  useEffect(() => {
    if (!id) return

    setIsLoading(true)
    setPart(null)
    setThumbnailUrls([])
    setError(null)

    // D-03: Alle Presigned URLs in einer API-Anfrage (parallel)
    Promise.all([
      fetch(`/api/parts/${id}`).then(r => {
        if (r.status === 404) return Promise.reject(404)
        if (!r.ok) return Promise.reject('error')
        return r.json()
      }),
      fetch(`/api/parts/${id}/thumbnails`).then(r =>
        r.ok ? r.json() : { urls: [] }
      ),
    ])
      .then(([partData, thumbData]) => {
        setPart(partData.part)
        setThumbnailUrls(thumbData.urls ?? [])
      })
      .catch(err => {
        setError(err === 404 ? 'not_found' : 'error')
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [id])  // NUR [id] — kein thumbnailUrls im Deps-Array (Endlosloop-Pitfall)

  return { part, thumbnailUrls, isLoading, error }
}
