'use client'

// src/app/search/SearchResultCard.tsx
// Einzelne Trefferkarte. Hebel 1 (Farbschwellen angehoben) + Hebel 2 (view_hits-Hinweis).

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface SearchResultCardProps {
  id: string
  name: string
  part_number: string | null
  similarity: number       // Float 0–1 aus API (rohes top_sim)
  view_hits?: number       // Anzahl Views (von 16), die als Hit zählten (Hebel 2)
  is_top_hit?: boolean     // True wenn dieses Ergebnis der eindeutige Top-Treffer ist
}

function SearchResultCard({
  id,
  name,
  part_number,
  similarity,
  view_hits,
  is_top_hit,
}: SearchResultCardProps) {
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/parts/${id}/thumbnail`)
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (data?.url) setThumbnailUrl(data.url) })
      .catch(() => { /* Skeleton bleibt sichtbar */ })
  }, [id])

  const matchPercent = Math.round(similarity * 100)

  // Farbschwellen angehoben (Hebel 1): DINOv3-Baseline in CAD-Render ist ~0.65–0.75 —
  // alles in dem Bereich ist NICHT "ziemlich sicher", sondern Rauschen.
  //   ≥ 0.88  grün   (sehr starker Treffer)
  //   ≥ 0.78  amber  (möglicher Treffer — manuell prüfen)
  //   < 0.78  rot    (wahrscheinlich Rauschen)
  const badgeClass = cn(
    similarity >= 0.88
      ? 'bg-green-500 text-white hover:bg-green-500'
      : similarity >= 0.78
      ? 'bg-amber-500 text-white hover:bg-amber-500'
      : 'bg-red-500 text-white hover:bg-red-500'
  )

  return (
    <Link
      href={`/parts/${id}`}
      className="block"
      aria-label={`Bauteil ${name} anzeigen, Ähnlichkeit ${matchPercent}%`}
    >
      <Card
        className={cn(
          'overflow-hidden hover:shadow-md transition-shadow cursor-pointer',
          is_top_hit && 'ring-2 ring-primary'
        )}
      >
        <div className="flex gap-3 p-3">
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
          <div className="flex flex-col justify-between flex-1 min-w-0 py-0.5">
            <p className="text-sm font-medium leading-tight truncate">{name}</p>
            {part_number && (
              <p className="text-xs text-muted-foreground truncate">{part_number}</p>
            )}
            <div className="flex justify-end items-center gap-2">
              {/* Hebel 2: view_hits als sekundäre Info — wie viele Perspektiven passten */}
              {typeof view_hits === 'number' && view_hits > 0 && (
                <span
                  className="text-[10px] text-muted-foreground"
                  title="Anzahl Render-Perspektiven, die zu deinem Foto passten"
                >
                  {view_hits}/16 Views
                </span>
              )}
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
