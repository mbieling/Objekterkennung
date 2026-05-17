'use client'

// src/app/search/SearchResults.tsx
// Ergebnis-Controller — zeigt Treffer, threshold-Slider, Limit-Select und
// (Hebel 1) ein Konfidenz-Banner bei unsicheren Ergebnissen.

import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { SearchResultCard } from './SearchResultCard'

interface SearchResultItem {
  id: string
  name: string
  part_number: string | null
  project: string | null
  status: 'ready'
  similarity: number
  created_at: string
  view_hits?: number
  geo_score?: number
}

interface SearchResultsProps {
  searchResult: {
    results: SearchResultItem[]
    query: {
      threshold: number
      limit: number
      results_count: number
      margin?: number | null
      confidence?: 'high' | 'medium' | 'low'
    }
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
  // Lokale Filterung — API liefert bereits sortiert nach final_score DESC
  const filteredResults = searchResult.results
    .filter(r => r.similarity >= displayThreshold)
    .slice(0, displayLimit)

  const confidence = searchResult.query.confidence
  // Konfidenz-Banner nur zeigen, wenn nach lokalem Filter noch mehrere Treffer da sind —
  // ein "unsicheres" Top-1, das den lokalen Threshold als einziges schafft, ist effektiv eindeutig.
  const showConfidenceBanner = filteredResults.length >= 2 && confidence != null

  return (
    <div className="flex flex-col gap-4">
      {/* Hebel 1: Konfidenz-Banner */}
      {showConfidenceBanner && confidence === 'low' && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Mehrere ähnliche Kandidaten</strong> — die Top-Treffer liegen sehr
            nah beieinander. Bitte das richtige Bauteil manuell auswählen oder ein
            weiteres Foto aus einem anderen Winkel hinzufügen.
          </AlertDescription>
        </Alert>
      )}
      {showConfidenceBanner && confidence === 'medium' && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Top-Treffer wahrscheinlich richtig, aber andere Kandidaten sind ähnlich nah.
            Bitte gegebenenfalls Foto-Auswahl prüfen.
          </AlertDescription>
        </Alert>
      )}
      {showConfidenceBanner && confidence === 'high' && (
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertDescription>
            Eindeutiger Top-Treffer — klar bessere Übereinstimmung als die Alternativen.
          </AlertDescription>
        </Alert>
      )}

      {/* Controls-Zeile */}
      <div className="flex flex-row items-center gap-4 flex-wrap">
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

      {/* Leer-Zustand */}
      {filteredResults.length === 0 && (
        <div role="status" className="text-center py-8">
          <p className="font-medium">Keine ähnlichen Teile gefunden.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Versuche den Ähnlichkeitsschwellwert zu verringern.
          </p>
        </div>
      )}

      {/* Ergebnis-Grid — 1 Spalte, aria-live für Screen-Reader */}
      {filteredResults.length > 0 && (
        <div aria-live="polite" className="flex flex-col gap-3">
          {filteredResults.map((r, idx) => (
            <SearchResultCard
              key={r.id}
              id={r.id}
              name={r.name}
              part_number={r.part_number}
              similarity={r.similarity}
              view_hits={r.view_hits}
              is_top_hit={idx === 0 && (confidence === 'high' || confidence === 'medium')}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export { SearchResults }
export type { SearchResultsProps }
