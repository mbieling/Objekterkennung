'use client'

// src/app/search/SearchResultCard.tsx
// Phase 8 — Einzelne Trefferkarte (SEARCH-03, D-01 bis D-05)

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface SearchResultCardProps {
  id: string
  name: string
  similarity: number  // Float 0–1 aus API
}

function SearchResultCard({ id, name, similarity }: SearchResultCardProps) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)

  // Thumbnail lazy laden — nur [id] im Deps-Array, kein thumbnailUrl (verhindert Endlosloop)
  useEffect(() => {
    fetch(`/api/parts/${id}/thumbnail`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data?.url) setThumbnailUrl(data.url) })
      .catch(() => { /* Skeleton bleibt sichtbar */ })
  }, [id])

  const matchPercent = Math.round(similarity * 100)

  // D-04: Farb-Schwellwerte — direkte className statt shadcn-Varianten
  // hover:bg-* Override nötig — shadcn Badge hat eigenen Hover-State
  const badgeClass = cn(
    similarity >= 0.8
      ? 'bg-green-500 text-white hover:bg-green-500'
      : similarity >= 0.6
      ? 'bg-amber-500 text-white hover:bg-amber-500'
      : 'bg-red-500 text-white hover:bg-red-500'
  )

  return (
    // D-03: Karte ist anklickbar — Link zu /parts/[id] (Phase 9 erstellt Zielseite; 404 akzeptiert)
    <Link
      href={`/parts/${id}`}
      className="block"
      aria-label={`Bauteil ${name} anzeigen, Ähnlichkeit ${matchPercent}%`}
    >
      <Card className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
        <div className="flex gap-3 p-3">
          {/* D-02: Thumbnail 64×64 quadratisch, Skeleton-Placeholder beim Laden */}
          <div className="relative w-16 h-16 shrink-0 rounded-md overflow-hidden bg-muted">
            {thumbnailUrl ? (
              <img
                src={thumbnailUrl}
                alt={`${name} Thumbnail`}
                className="w-full h-full object-cover"
                onError={() => setThumbnailUrl(null)}
              />
            ) : (
              <Skeleton className="w-full h-full" />
            )}
          </div>
          {/* D-02: Name + Badge */}
          <div className="flex flex-col justify-between flex-1 min-w-0 py-0.5">
            <p className="text-sm font-medium leading-tight truncate">{name}</p>
            {/* D-05: Badge rechts unten, nach Name */}
            <div className="flex justify-end">
              <Badge className={badgeClass}>{matchPercent}%</Badge>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  )
}

export { SearchResultCard }
export type { SearchResultCardProps }
