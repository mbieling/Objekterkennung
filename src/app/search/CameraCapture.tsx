'use client'

// src/app/search/CameraCapture.tsx
// Phase 7 — Kamera-Erfassung als Client Component (SEARCH-01, SEARCH-02, D-03 bis D-11)
// Vollständige State Machine: idle → requesting → previewing → captured → searching → result | error

import { useState, useRef, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Camera, Upload, RotateCcw, Search, Loader2 } from 'lucide-react'
import { SearchResults } from './SearchResults'

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------
type SearchPhase =
  | 'idle'        // Startbildschirm
  | 'requesting'  // getUserMedia läuft
  | 'previewing'  // Video-Stream aktiv
  | 'captured'    // Standbild, Bestätigung
  | 'searching'   // POST /api/search läuft
  | 'result'      // Antwort vorhanden
  | 'error'       // Fehler

interface SearchResponse {
  results: Array<{
    id: string
    name: string
    part_number: string | null
    project: string | null
    status: 'ready'
    similarity: number
    created_at: string
  }>
  query: {
    threshold: number
    limit: number
    results_count: number
  }
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen (außerhalb der Komponente)
// ---------------------------------------------------------------------------

// D-04: facingMode ideal (nicht exact) — fällt auf Frontkamera zurück statt Hard-Error
async function startCamera(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: 'environment' } },
    audio: false,
  })
}

// Maximale Upload-Größe für Kamera-Aufnahmen und Galerie-Uploads (5 MB)
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

// Claude's Discretion: max 1024px Breite, JPEG 0.85
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null)
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null)
  // Phase 8: Threshold + Limit für SearchResults (D-06, D-08)
  const [displayThreshold, setDisplayThreshold] = useState<number>(0.5)
  const [displayLimit, setDisplayLimit] = useState<number>(10)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Stream → video-Element verbinden, sobald 'previewing' aktiv ist und das DOM-Element existiert.
  // Ohne diesen Effect wäre videoRef.current null (video nicht gerendert während 'requesting').
  useEffect(() => {
    if (phase === 'previewing' && streamRef.current && videoRef.current) {
      try {
        videoRef.current.srcObject = streamRef.current
      } catch {
        // jsdom unterstützt srcObject nicht — in Tests ignorieren
      }
      videoRef.current.play().catch(() => {
        // play() kann fehlschlagen wenn der Nutzer navigiert oder in Tests — ignorieren
      })
    }
  }, [phase])

  // Stream-Cleanup beim Unmount (Pattern 4 aus RESEARCH.md)
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop())
        streamRef.current = null
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---------------------------------------------------------------------------
  // Handler
  // ---------------------------------------------------------------------------

  async function handleStartCamera() {
    setPhase('requesting')
    try {
      const stream = await startCamera()
      streamRef.current = stream
      setPhase('previewing')  // löst den useEffect aus, der srcObject setzt
    } catch (err) {
      const isDomException = err instanceof DOMException
      const isNotAllowed = isDomException && err.name === 'NotAllowedError'
      const msg = isNotAllowed
        ? 'Kamerazugriff verweigert. Bitte erlaube den Kamerazugriff in den Browser-Einstellungen oder wähle ein Foto aus der Galerie.'
        : 'Kamera konnte nicht gestartet werden. Wähle ein Foto aus der Galerie.'
      setErrorMessage(msg)
      setPhase('idle')
    }
  }

  async function handleCapture() {
    if (!videoRef.current) return
    const blob = await captureFrame(videoRef.current)
    if (blob.size > MAX_IMAGE_BYTES) {
      setErrorMessage('Aufnahme ist zu groß. Bitte Umgebungsbeleuchtung verbessern und erneut versuchen.')
      return
    }
    // Stream stoppen nach Aufnahme
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    setCapturedBlob(blob)
    setPreviewUrl(URL.createObjectURL(blob))
    setPhase('captured')
  }

  function handleRetry() {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPhase('idle')
    setCapturedBlob(null)
    setPreviewUrl(null)
    setErrorMessage(null)
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    // T-7-01: MIME-Typ-Check (Threat Modell: Tampering)
    if (!file.type.startsWith('image/')) {
      setErrorMessage('Nur Bilddateien (JPEG, PNG) erlaubt.')
      return
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setErrorMessage(`Datei ist zu groß (${Math.round(file.size / 1024 / 1024)} MB). Maximal: 5 MB.`)
      return
    }
    setCapturedBlob(file)
    setPreviewUrl(URL.createObjectURL(file))
    setPhase('captured')
  }

  // D-09: 30s AbortController-Timeout; D-08: limit-Parameter steuert Ergebnismenge
  async function executeSearch(limit: number) {
    if (!capturedBlob) return
    setPhase('searching')
    setErrorMessage(null)
    const formData = new FormData()
    formData.append('image', capturedBlob, 'capture.jpg')
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30_000)
    try {
      const res = await fetch(
        `/api/search?threshold=0&limit=${Math.max(50, limit)}`,
        {
          method: 'POST',
          body: formData,
          // KEIN Content-Type-Header — Browser setzt multipart Boundary automatisch
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
  // Wiederverwendbarer File-Input-Trigger (D-06: in allen States außer searching)
  // ---------------------------------------------------------------------------
  const FileInputTrigger = (
    <Button variant="ghost" className="w-full min-h-[44px]" onClick={() => fileInputRef.current?.click()}>
      <Upload className="mr-2 h-4 w-4" />
      Foto aus Galerie wählen
    </Button>
  )

  // ---------------------------------------------------------------------------
  // Rendering nach State
  // ---------------------------------------------------------------------------
  return (
    <div>
      {/* File-Input (immer im DOM, visuell versteckt) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* idle-State */}
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

      {/* requesting-State */}
      {phase === 'requesting' && (
        <div className="flex flex-col gap-4">
          <Skeleton className="w-full aspect-[4/3] max-w-sm mx-auto rounded-lg" />
          <p className="text-sm text-muted-foreground text-center">Kamera wird aktiviert...</p>
        </div>
      )}

      {/* previewing-State */}
      {phase === 'previewing' && (
        <div className="flex flex-col gap-4">
          <div className="relative w-full aspect-[4/3] max-w-sm mx-auto">
            <video
              ref={videoRef}
              className="w-full h-full object-cover rounded-lg"
              playsInline
              muted
              autoPlay
              aria-label="Kamera-Vorschau"
            />
            {/* Framing-Overlay (D-07) */}
            <div
              className="absolute inset-[10%] border-2 border-white/70 rounded-xl pointer-events-none"
              aria-hidden="true"
            />
          </div>
          <Button className="w-full h-12" onClick={handleCapture}>
            <Camera className="mr-2 h-4 w-4" />
            Aufnehmen
          </Button>
          {FileInputTrigger}
        </div>
      )}

      {/* captured-State */}
      {phase === 'captured' && (
        <div className="flex flex-col gap-4">
          {previewUrl && (
            <img
              src={previewUrl}
              alt="Aufgenommenes Bauteil"
              className="w-full max-w-sm mx-auto rounded-lg object-cover aspect-[4/3]"
            />
          )}
          <div className="flex gap-4">
            <Button className="flex-1 min-h-[44px]" onClick={handleSearch}>
              <Search className="mr-2 h-4 w-4" />
              Suchen
            </Button>
            <Button variant="outline" className="flex-1 min-h-[44px]" onClick={handleRetry}>
              <RotateCcw className="mr-2 h-4 w-4" />
              Wiederholen
            </Button>
          </div>
          {FileInputTrigger}
        </div>
      )}

      {/* searching-State (D-11: Overlay über altem Grid wenn Re-Suche; reiner Spinner bei Erst-Suche) */}
      {phase === 'searching' && (
        searchResult ? (
          // Re-Suche: Grid bleibt sichtbar, Spinner-Overlay darüber
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
                onLimitChange={(newLimit) => {
                  // Speichert den neuen Wert; kein Re-Search während laufender Suche.
                  // Der gespeicherte Wert wird beim nächsten handleSearch verwendet.
                  setDisplayLimit(newLimit)
                }}
              />
            </div>
          </div>
        ) : (
          // Erst-Suche: reiner Spinner
          <div className="flex flex-col items-center gap-4 py-8" aria-live="polite">
            <Loader2 className="animate-spin h-8 w-8" aria-label="Suche läuft" />
            <p className="text-sm text-muted-foreground">Suche läuft...</p>
          </div>
        )
      )}

      {/* result-State — SearchResults ersetzt den pre-JSON-Placeholder (Phase 8) */}
      {phase === 'result' && searchResult && (
        <div className="flex flex-col gap-4">
          <SearchResults
            searchResult={searchResult}
            displayThreshold={displayThreshold}
            displayLimit={displayLimit}
            onThresholdChange={setDisplayThreshold}
            onLimitChange={(newLimit) => {
              setDisplayLimit(newLimit)
              // D-08: Limit-Wechsel triggert neue API-Anfrage
              handleSearchWithLimit(newLimit)
            }}
          />
          <Button variant="outline" className="w-full min-h-[44px]" onClick={handleRetry}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Neu aufnehmen
          </Button>
        </div>
      )}

      {/* error-State (D-11) */}
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
