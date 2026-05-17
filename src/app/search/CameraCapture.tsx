'use client'

// src/app/search/CameraCapture.tsx
// Multi-Foto-Suche: 1..N Fotos werden gesammelt und gemeinsam an /api/search geschickt.
// Backend mergt per Bauteil mit MAX-Similarity über alle Foto×View-Paare.
// State Machine: idle → requesting → previewing → captured(N≥1) → searching → result | error

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Camera, Upload, RotateCcw, Search, Loader2, Plus, X } from 'lucide-react'
import { SearchResults } from './SearchResults'

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------
type SearchPhase =
  | 'idle'
  | 'requesting'
  | 'previewing'
  | 'captured'
  | 'searching'
  | 'result'
  | 'error'

interface SearchResponse {
  results: Array<{
    id: string
    name: string
    part_number: string | null
    project: string | null
    status: 'ready'
    similarity: number
    created_at: string
    // Hebel 2/3 ergänzte Felder (alle optional, damit ältere API-Antworten weiter geparsed werden)
    view_hits?: number
    geo_score?: number
    combined_score?: number
    final_score?: number
  }>
  query: {
    threshold: number
    limit: number
    photo_count?: number  // ergänzt durch Multi-Foto-API
    results_count: number
    margin?: number | null
    confidence?: 'high' | 'medium' | 'low'
  }
}

// ---------------------------------------------------------------------------
// Konstanten
// ---------------------------------------------------------------------------
// Muss mit MAX_PHOTOS_PER_QUERY in src/app/api/search/route.ts übereinstimmen.
const MAX_PHOTOS = 5
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------
async function startCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false,
  })
}

function captureFrame(video: HTMLVideoElement): Promise<Blob> {
  const MAX_WIDTH = 1024
  const scale = Math.min(1, MAX_WIDTH / video.videoWidth)
  const w = Math.round(video.videoWidth * scale) || MAX_WIDTH
  const h = Math.round(video.videoHeight * scale) || Math.round(MAX_WIDTH * 0.75)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  canvas.getContext('2d')!.drawImage(video, 0, 0, w, h)
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('canvas.toBlob lieferte null')),
      'image/jpeg',
      0.85
    )
  })
}

// ---------------------------------------------------------------------------
// Komponente
// ---------------------------------------------------------------------------
function CameraCapture() {
  const [phase, setPhase] = useState<SearchPhase>('idle')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [capturedBlobs, setCapturedBlobs] = useState<Blob[]>([])
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null)
  // Default-Slider-Wert auf 0.70 angehoben. Für DINOv3 in der CAD-Render-Domäne liegt
  // alles unter ~0.70 im Rauschen — niedrigere Defaults erzeugen Schein-Treffer im UI.
  const [displayThreshold, setDisplayThreshold] = useState<number>(0.70)
  const [displayLimit, setDisplayLimit] = useState<number>(10)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Stream → Video-Element verbinden, sobald 'previewing' aktiv ist
  useEffect(() => {
    if (phase === 'previewing' && streamRef.current && videoRef.current) {
      try {
        videoRef.current.srcObject = streamRef.current
      } catch {
        // jsdom unterstützt srcObject nicht — in Tests ignorieren
      }
      videoRef.current.play().catch(() => {
        // play() kann fehlschlagen wenn der Nutzer navigiert oder in Tests
      })
    }
  }, [phase])

  // Stream-Cleanup beim Unmount + alle ObjectURLs freigeben
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      previewUrls.forEach(URL.revokeObjectURL)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------------------------
  // Foto-Verwaltung (gemeinsame Logik für Kamera + Galerie)
  // ---------------------------------------------------------------------------
  function addPhoto(blob: Blob) {
    if (capturedBlobs.length >= MAX_PHOTOS) {
      setErrorMessage(`Maximal ${MAX_PHOTOS} Fotos pro Suche.`)
      return
    }
    setCapturedBlobs(prev => [...prev, blob])
    setPreviewUrls(prev => [...prev, URL.createObjectURL(blob)])
    setPhase('captured')
  }

  function removePhoto(index: number) {
    const url = previewUrls[index]
    if (url) URL.revokeObjectURL(url)
    setCapturedBlobs(prev => prev.filter((_, i) => i !== index))
    setPreviewUrls(prev => prev.filter((_, i) => i !== index))
    // Wenn alle weg sind → zurück zu idle
    if (capturedBlobs.length === 1) {
      setPhase('idle')
    }
  }

  function clearAllPhotos() {
    previewUrls.forEach(URL.revokeObjectURL)
    setCapturedBlobs([])
    setPreviewUrls([])
  }

  // ---------------------------------------------------------------------------
  // Handler
  // ---------------------------------------------------------------------------
  async function handleStartCamera() {
    setPhase('requesting')
    setErrorMessage(null)
    try {
      const stream = await startCamera()
      streamRef.current = stream
      setPhase('previewing')
    } catch (err) {
      const isDomException = err instanceof DOMException
      const isNotAllowed = isDomException && err.name === 'NotAllowedError'
      const msg = isNotAllowed
        ? 'Kamerazugriff verweigert. Bitte erlaube den Kamerazugriff in den Browser-Einstellungen oder wähle ein Foto aus der Galerie.'
        : 'Kamera konnte nicht gestartet werden. Wähle ein Foto aus der Galerie.'
      setErrorMessage(msg)
      // Wenn vorher schon Fotos da waren, bleiben wir in 'captured'; sonst zurück zu idle
      setPhase(capturedBlobs.length > 0 ? 'captured' : 'idle')
    }
  }

  async function handleCapture() {
    if (!videoRef.current) return
    const blob = await captureFrame(videoRef.current)
    if (blob.size > MAX_IMAGE_BYTES) {
      setErrorMessage('Aufnahme ist zu groß. Bitte Umgebungsbeleuchtung verbessern und erneut versuchen.')
      return
    }
    // Stream stoppen nach Aufnahme (Foto-Modus, kein kontinuierlicher Stream)
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    addPhoto(blob)
  }

  function handleRetry() {
    clearAllPhotos()
    setPhase('idle')
    setErrorMessage(null)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    // Input resetten, damit dieselbe Datei zweimal gewählt werden kann
    e.target.value = ''
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Nur Bilddateien (JPEG, PNG) erlaubt.')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setErrorMessage(`Datei ist zu groß (${Math.round(file.size / 1024 / 1024)} MB). Maximal: 5 MB.`)
      return
    }
    addPhoto(file)
  }

  async function executeSearch(limit: number) {
    if (capturedBlobs.length === 0) return
    setPhase('searching')
    setErrorMessage(null)
    const formData = new FormData()
    capturedBlobs.forEach((blob, idx) => {
      formData.append('image', blob, `capture-${idx}.jpg`)
    })
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30_000)
    try {
      const res = await fetch(
        `/api/search?threshold=0&limit=${Math.max(50, limit)}`,
        {
          method: 'POST',
          body: formData,
          signal: controller.signal,
        }
      )
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: SearchResponse = await res.json()
      setSearchResult(data)
      setPhase('result')
    } catch (err) {
      let msg: string
      if (err instanceof DOMException && err.name === 'AbortError') {
        msg = 'Suche hat zu lange gedauert. Bitte erneut versuchen.'
      } else if (err instanceof Error && err.message.startsWith('HTTP ')) {
        msg = 'Suche fehlgeschlagen (Server-Fehler). Bitte erneut versuchen.'
      } else {
        msg = 'Suche fehlgeschlagen. Bitte überprüfe deine Verbindung und versuche es erneut.'
      }
      setErrorMessage(msg)
      setPhase('error')
    } finally {
      clearTimeout(timeoutId)
    }
  }

  function handleSearch() { executeSearch(displayLimit) }
  function handleSearchWithLimit(newLimit: number) { executeSearch(newLimit) }

  // ---------------------------------------------------------------------------
  // UI-Bausteine
  // ---------------------------------------------------------------------------
  const FileInputTrigger = (
    <Button variant="ghost" className="w-full min-h-[44px]" onClick={() => fileInputRef.current?.click()}>
      <Upload className="mr-2 h-4 w-4" />
      {capturedBlobs.length === 0 ? 'Foto aus Galerie wählen' : 'Foto aus Galerie hinzufügen'}
    </Button>
  )

  const ThumbnailStrip = (
    <div className="flex gap-2 overflow-x-auto pb-2" aria-label="Aufgenommene Fotos">
      {previewUrls.map((url, idx) => (
        <div key={url} className="relative flex-shrink-0">
          <img
            src={url}
            alt={`Foto ${idx + 1}`}
            className="w-20 h-20 object-cover rounded-md border border-border"
          />
          <button
            type="button"
            onClick={() => removePhoto(idx)}
            className="absolute -top-1 -right-1 bg-background border border-border rounded-full p-0.5 shadow-sm hover:bg-muted"
            aria-label={`Foto ${idx + 1} entfernen`}
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  )

  // ---------------------------------------------------------------------------
  // Rendering nach State
  // ---------------------------------------------------------------------------
  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {phase === 'idle' && (
        <Card>
          <CardContent className="pt-6 flex flex-col gap-4 items-center">
            {errorMessage && (
              <Alert variant="destructive">
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}
            <Button className="w-full min-h-[44px]" onClick={handleStartCamera}>
              <Camera className="mr-2 h-4 w-4" />
              Kamera starten
            </Button>
            {FileInputTrigger}
          </CardContent>
        </Card>
      )}

      {phase === 'requesting' && (
        <div className="flex flex-col gap-4">
          <Skeleton className="w-full aspect-[4/3] max-w-sm mx-auto rounded-lg" />
          <p className="text-sm text-muted-foreground text-center">Kamera wird aktiviert...</p>
        </div>
      )}

      {phase === 'previewing' && (
        <div className="flex flex-col gap-4">
          {capturedBlobs.length > 0 && ThumbnailStrip}
          <div className="relative w-full aspect-[4/3] max-w-sm mx-auto">
            <video
              ref={videoRef}
              className="w-full h-full object-cover rounded-lg"
              playsInline
              muted
              autoPlay
              aria-label="Kamera-Vorschau"
            />
            <div
              className="absolute inset-[10%] border-2 border-white/70 rounded-xl pointer-events-none"
              aria-hidden="true"
            />
          </div>
          <Button className="w-full h-12" onClick={handleCapture}>
            <Camera className="mr-2 h-4 w-4" />
            Aufnehmen
            {capturedBlobs.length > 0 && (
              <span className="ml-2 text-xs opacity-70">
                ({capturedBlobs.length}/{MAX_PHOTOS} bereits aufgenommen)
              </span>
            )}
          </Button>
          {FileInputTrigger}
        </div>
      )}

      {phase === 'captured' && (
        <div className="flex flex-col gap-4">
          {errorMessage && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}
          {/* Großes Hauptbild: zuletzt aufgenommenes Foto */}
          {previewUrls.length > 0 && (
            <img
              src={previewUrls[previewUrls.length - 1]}
              alt="Aufgenommenes Bauteil"
              className="w-full max-w-sm mx-auto rounded-lg object-cover aspect-[4/3]"
            />
          )}
          {/* Thumbnail-Strip aller bisherigen Fotos */}
          {previewUrls.length > 1 && ThumbnailStrip}
          {/* Aktionen */}
          <div className="flex gap-2">
            <Button className="flex-1 min-h-[44px]" onClick={handleSearch}>
              <Search className="mr-2 h-4 w-4" />
              {capturedBlobs.length === 1
                ? 'Suchen'
                : `Mit ${capturedBlobs.length} Fotos suchen`}
            </Button>
            <Button variant="outline" className="flex-1 min-h-[44px]" onClick={handleRetry}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Wiederholen
            </Button>
          </div>
          {capturedBlobs.length < MAX_PHOTOS && (
            <>
              <Button
                variant="secondary"
                className="w-full min-h-[44px]"
                onClick={handleStartCamera}
              >
                <Plus className="mr-2 h-4 w-4" />
                Weiteres Foto aufnehmen
              </Button>
              {FileInputTrigger}
            </>
          )}
          {capturedBlobs.length >= MAX_PHOTOS && (
            <p className="text-xs text-muted-foreground text-center">
              Maximale Anzahl ({MAX_PHOTOS}) erreicht.
            </p>
          )}
        </div>
      )}

      {phase === 'searching' && (
        searchResult ? (
          <div className="flex flex-col gap-4">
            <div className="relative">
              <div className="absolute inset-0 bg-background/70 flex items-center justify-center rounded-lg z-10">
                <Loader2 className="animate-spin h-8 w-8" aria-label="Neue Suche läuft" />
              </div>
              <SearchResults
                searchResult={searchResult}
                displayThreshold={displayThreshold}
                displayLimit={displayLimit}
                onThresholdChange={setDisplayThreshold}
                onLimitChange={(newLimit) => setDisplayLimit(newLimit)}
              />
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-8" aria-live="polite">
            <Loader2 className="animate-spin h-8 w-8" aria-label="Suche läuft" />
            <p className="text-sm text-muted-foreground">
              {capturedBlobs.length > 1
                ? `Suche mit ${capturedBlobs.length} Fotos läuft...`
                : 'Suche läuft...'}
            </p>
          </div>
        )
      )}

      {phase === 'result' && searchResult && (
        <div className="flex flex-col gap-4">
          {searchResult.query.photo_count && searchResult.query.photo_count > 1 && (
            <p className="text-xs text-muted-foreground">
              Ergebnisse aus {searchResult.query.photo_count} Fotos kombiniert
              (beste Übereinstimmung pro Bauteil).
            </p>
          )}
          <SearchResults
            searchResult={searchResult}
            displayThreshold={displayThreshold}
            displayLimit={displayLimit}
            onThresholdChange={setDisplayThreshold}
            onLimitChange={(newLimit) => {
              setDisplayLimit(newLimit)
              handleSearchWithLimit(newLimit)
            }}
          />
          <Button variant="outline" className="w-full min-h-[44px]" onClick={handleRetry}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Neu aufnehmen
          </Button>
        </div>
      )}

      {phase === 'error' && (
        <div className="flex flex-col gap-4">
          <Alert variant="destructive">
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
          <Button
            variant="outline"
            className="w-full min-h-[44px]"
            onClick={() => {
              setPhase('idle')
              setErrorMessage(null)
            }}
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Neu aufnehmen
          </Button>
        </div>
      )}
    </div>
  )
}

export { CameraCapture }
