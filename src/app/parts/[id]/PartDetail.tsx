'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Download } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { usePartDetail, type Part } from '../../../hooks/usePartDetail'

// D-10: StatusBadge — exakt wie in CatalogTable.tsx (direkt kopiert)
function StatusBadge({ status }: { status: Part['status'] }) {
  if (status === 'ready')
    return <Badge className="text-green-700 bg-green-50 border-green-200 hover:bg-green-50">Bereit</Badge>
  if (status === 'pending')
    return <Badge variant="secondary">Ausstehend</Badge>
  if (status === 'processing')
    return <Badge variant="outline" className="text-blue-600 border-blue-300">Wird verarbeitet…</Badge>
  if (status === 'failed')
    return <Badge variant="destructive">Fehlgeschlagen</Badge>
  return null
}

// Datum-Formatierung — exakt wie in CatalogTable.tsx
function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(new Date(iso))
}

interface PartDetailProps {
  id: string
}

export function PartDetail({ id }: PartDetailProps) {
  const router = useRouter()
  const { part, thumbnailUrls, isLoading, error } = usePartDetail(id)
  const [activeIndex, setActiveIndex] = useState(0)
  const [isDownloading, setIsDownloading] = useState(false)

  // D-08: router.back() wenn History vorhanden, sonst /search
  function handleBack() {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back()
    } else {
      router.push('/search')
    }
  }

  // D-05: Presigned URL holen → window.location.href (kein Next.js-Proxy)
  async function handleDownload() {
    if (!part || part.status !== 'ready') return
    setIsDownloading(true)
    try {
      const res = await fetch(`/api/parts/${id}/download`)
      if (!res.ok) return
      const { url } = await res.json()
      window.location.href = url
    } finally {
      setIsDownloading(false)
    }
  }

  // Skeleton-Layout während Laden (D-04)
  if (isLoading) {
    return (
      <>
        <Skeleton className="h-6 w-32 mb-6" />
        <Skeleton className="w-[320px] h-[320px] md:w-[480px] md:h-[480px] rounded-lg mx-auto mb-3" />
        <div className="flex gap-2 mb-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="w-16 h-16 shrink-0 rounded-md" />
          ))}
        </div>
        <Skeleton className="h-8 w-3/4 mb-4" />
        <div className="space-y-3 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-5 w-full" />
          ))}
        </div>
        <Skeleton className="h-10 w-full" />
      </>
    )
  }

  // Fehler-State (DETAIL-01: 404 oder Netzwerkfehler)
  if (error || !part) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground mb-4">Bauteil nicht gefunden.</p>
        <Link href="/search">
          <Button variant="outline">Zurück zur Suche</Button>
        </Link>
      </div>
    )
  }

  // Anzahl der Skeleton-Items für Thumbnail-Strip (D-11: Fallback 6 wenn thumbnail_count = 0)
  const skeletonCount = part.thumbnail_count > 0 ? part.thumbnail_count : 6
  const hasUrls = thumbnailUrls.length > 0

  return (
    <>
      {/* D-08: Back Link */}
      <button
        onClick={handleBack}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Zurück zur Suche
      </button>

      {/* D-01, D-02: Hauptbild */}
      <div className="relative w-[320px] h-[320px] md:w-[480px] md:h-[480px] rounded-lg overflow-hidden bg-muted mx-auto mb-3">
        {hasUrls ? (
          <img
            src={thumbnailUrls[activeIndex] ?? thumbnailUrls[0]}
            alt={`${part.name} — Ansicht ${activeIndex + 1}`}
            className="w-full h-full object-contain"
            onError={e => {
              ;(e.currentTarget as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <Skeleton className="w-full h-full" />
        )}
      </div>

      {/* D-01: Thumbnail-Leiste (horizontal scrollable) */}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-6">
        {hasUrls
          ? thumbnailUrls.map((url, i) => (
              <button
                key={i}
                onClick={() => setActiveIndex(i)}
                aria-label={`Ansicht ${i + 1}`}
                aria-pressed={i === activeIndex}
                data-active={i === activeIndex}
                className="relative w-16 h-16 shrink-0 rounded-md overflow-hidden bg-muted cursor-pointer ring-2 ring-transparent transition-all focus-visible:ring-ring data-[active=true]:ring-primary"
              >
                <img
                  src={url}
                  alt={`Ansicht ${i + 1}`}
                  className="w-full h-full object-contain"
                />
              </button>
            ))
          : Array.from({ length: skeletonCount }).map((_, i) => (
              <Skeleton key={i} className="w-16 h-16 shrink-0 rounded-md" />
            ))}
      </div>

      {/* D-09: Layout — H1 Name */}
      <h1 className="text-2xl font-semibold leading-tight mb-4">{part.name}</h1>

      {/* D-09: Metadaten-Block als <dl> (DETAIL-01) */}
      <dl className="space-y-3 mb-6">
        <div className="flex justify-between items-baseline gap-4">
          <dt className="text-sm text-muted-foreground shrink-0">Teilenummer</dt>
          <dd className="text-sm font-normal text-right">{part.part_number ?? '—'}</dd>
        </div>
        <div className="flex justify-between items-baseline gap-4">
          <dt className="text-sm text-muted-foreground shrink-0">Projekt</dt>
          <dd className="text-sm font-normal text-right">{part.project ?? '—'}</dd>
        </div>
        <div className="flex justify-between items-baseline gap-4">
          <dt className="text-sm text-muted-foreground shrink-0">Status</dt>
          <dd><StatusBadge status={part.status} /></dd>
        </div>
        <div className="flex justify-between items-baseline gap-4">
          <dt className="text-sm text-muted-foreground shrink-0">Hochgeladen</dt>
          <dd className="text-sm font-normal text-right">{formatDate(part.created_at)}</dd>
        </div>
      </dl>

      {/* D-07, D-11: Download-Button (disabled wenn status != ready) */}
      {part.status === 'ready' ? (
        <Button
          className="w-full gap-2"
          onClick={handleDownload}
          disabled={isDownloading}
          aria-disabled={isDownloading}
        >
          <Download className="h-4 w-4" />
          STEP herunterladen
        </Button>
      ) : (
        <div className="space-y-2">
          <Button className="w-full gap-2" disabled aria-disabled>
            <Download className="h-4 w-4" />
            STEP herunterladen
          </Button>
          <p className="text-xs text-center text-muted-foreground">
            Datei wird noch verarbeitet
          </p>
        </div>
      )}
    </>
  )
}
