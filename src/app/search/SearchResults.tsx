'use client'

// src/app/search/SearchResults.tsx
// Phase 8 — Ergebnis-Controller (SEARCH-03, SEARCH-04, SEARCH-05, D-07 bis D-10)

import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { SearchResultCard } from './SearchResultCard'

// SearchResponse-Interface — identisch mit CameraCapture.tsx (kein Cross-Import um Zirkel zu vermeiden)
interface SearchResultItem {
  id: string
  name: string
  part_number: string | null
  project: string | null
  status: 'ready'
  similarity: number
  created_at: string
}

interface SearchResultsProps {
  searchResult: {
    results: SearchResultItem[]
    query: { threshold: number; limit: number; results_count: number }
  }
  displayThreshold: number      // 0.0–1.0; Slider-Wert
  displayLimit: number          // 10 | 20 | 50
  onThresholdChange: (val: number) => void
  onLimitChange: (val: number) => void
}

function SearchResults({
  searchResult,
  displayThreshold,
  displayLimit,
  onThresholdChange,
  onLimitChange,
}: SearchResultsProps) {
  // D-07: Lokale Filterung — API liefert bereits sortiert nach similarity DESC
  const filteredResults = searchResult.results
    .filter(r => r.similarity >= displayThreshold)
    .slice(0, displayLimit)

  return (
    <div className="flex flex-col gap-4">
      {/* D-09: Controls-Zeile direkt über dem Grid */}
      <div className="flex flex-row items-center gap-4 flex-wrap">
        {/* D-06: Threshold-Slider */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Ähnlichkeit</span>
          <Slider
            min={0}
            max={1}
            step={0.05}
            value={[displayThreshold]}
            onValueChange={([val]) => onThresholdChange(val)}
            aria-label="Ähnlichkeitsschwellwert"
            aria-valuetext={`${Math.round(displayThreshold * 100)}%`}
            className="w-32"
          />
          <span className="text-sm font-medium w-10 text-right">
            {Math.round(displayThreshold * 100)}%
          </span>
        </div>
        {/* D-08: Limit-Select — Wechsel triggert neue API-Anfrage via onLimitChange */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Ergebnisse</span>
          <Select
            value={String(displayLimit)}
            onValueChange={(val) => onLimitChange(Number(val))}
          >
            <SelectTrigger className="w-20">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="10">10</SelectItem>
              <SelectItem value="20">20</SelectItem>
              <SelectItem value="50">50</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* D-10: Leer-Zustand */}
      {filteredResults.length === 0 && (
        <div role="status" className="text-center py-8">
          <p className="font-medium">Keine ähnlichen Teile gefunden.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Versuche den Ähnlichkeitsschwellwert zu verringern.
          </p>
        </div>
      )}

      {/* Ergebnis-Grid — 1 Spalte (D-01), aria-live für Screen-Reader */}
      {filteredResults.length > 0 && (
        <div aria-live="polite" className="flex flex-col gap-3">
          {filteredResults.map(r => (
            <SearchResultCard
              key={r.id}
              id={r.id}
              name={r.name}
              similarity={r.similarity}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export { SearchResults }
export type { SearchResultsProps }
