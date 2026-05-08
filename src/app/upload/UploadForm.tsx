// src/app/upload/UploadForm.tsx
// Phase 4 — Upload-Form als Client Component (D-09, D-10, D-11, INGEST-01, INGEST-02).
// Kapselt den 5-stufigen Upload-Flow als endlichen Zustandsautomaten:
// idle → hashing → initializing → uploading → confirming → polling → ready/failed/duplicate/error
'use client'

import { useState, useRef, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { Label } from '@/components/ui/label'
import { AlertCircle, Loader2, Upload, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'
import { usePartStatus } from '@/hooks/use-part-status'

// Phasen-Zustandsautomat (RESEARCH.md Pattern 1)
type UploadPhase =
  | 'idle'           // Form leer, Submit enabled
  | 'hashing'        // SHA-256 läuft
  | 'initializing'   // POST /api/upload/init läuft
  | 'uploading'      // PUT zu S3 läuft (mit progress 0-100)
  | 'confirming'     // POST /api/upload/confirm läuft
  | 'polling'        // usePartStatus aktiv
  | 'ready'          // status='ready', Thumbnail laden
  | 'failed'         // status='failed' oder Polling-Timeout
  | 'duplicate'      // 409 von init — Form bleibt editierbar
  | 'error'          // Netzwerk-/Upload-Fehler

const MAX_FILE_BYTES = 100 * 1024 * 1024        // 100 MB
const STEP_EXT_RE = /\.(step|stp)$/i

// Zod-Schema (UI-SPEC Copywriting Contract + OQ2 RESOLVED — kein status-Feld)
// KEIN status-Feld in Phase 4 — Init-Endpoint hardcoded 'pending'.
// Status-Editierung kommt in Phase 5 (Admin-Katalog, ADMIN-Scope).
const formSchema = z.object({
  name: z.string().min(1, 'Bezeichnung ist erforderlich.').max(200),
  partNumber: z.string().max(100).optional(),
  project: z.string().max(200).optional(),
})

type FormValues = z.infer<typeof formSchema>

// SHA-256 im Browser via Web Crypto API (RESEARCH.md Pattern 4)
// Lädt komplette Datei in Memory — akzeptabel für Desktop (max 100 MB)
async function sha256OfFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

// S3 PUT via XMLHttpRequest mit Progress Events (RESEARCH.md Pattern 3)
// KRITISCH: KEIN setRequestHeader('Content-Type', ...) — Pitfall 4 (zerstört Signatur)
// init/route.ts Zeile 75-77: ContentType bewusst NICHT in signableHeaders
function uploadToS3(presignedUrl: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', presignedUrl, true)
    // KEIN setRequestHeader('Content-Type', ...) — würde Presigned-URL-Signatur invalidieren (Pitfall 4)
    xhr.upload.addEventListener('progress', e => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 100)
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`S3 PUT failed: HTTP ${xhr.status}`))
    })
    xhr.addEventListener('error', () => reject(new Error('Network error during S3 upload')))
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')))
    xhr.send(file)
  })
}

export function UploadForm() {
  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [partId, setPartId] = useState<string | null>(null)
  const [uploadPercent, setUploadPercent] = useState(0)
  const [duplicateId, setDuplicateId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', partNumber: '', project: '' },
  })

  // Hook deaktiviert sich bei partId=null automatisch (Cleanup via usePartStatus)
  // Polling aktiv wenn phase === 'polling' | 'ready' | 'failed' (D-04)
  const polledPartId = (phase === 'polling' || phase === 'ready' || phase === 'failed') ? partId : null
  const { status: polledStatus, error: pollError, timedOut } = usePartStatus(polledPartId)

  // Status-Reaktion: Übergang polling → ready/failed (RESEARCH.md Pattern 1 Übergangsregeln)
  useEffect(() => {
    if (polledStatus === 'ready' && phase === 'polling') {
      setPhase('ready')
      // Thumbnail fetchen nach status='ready' (D-07, D-08)
      const controller = new AbortController()
      fetch(`/api/parts/${partId}/thumbnail`, { signal: controller.signal })
        .then(r => r.ok ? r.json() : Promise.reject(new Error(`thumb HTTP ${r.status}`)))
        .then(({ url }: { url: string }) => setThumbnailUrl(url))
        .catch(() => {
          // UI-SPEC: Skeleton bleibt sichtbar, kein Fallback in Phase 4 (deferred to Phase 10)
        })
      return () => controller.abort()
    }
    if (polledStatus === 'failed' && phase === 'polling') setPhase('failed')
    if (timedOut && phase === 'polling') setPhase('failed')
  }, [polledStatus, phase, partId, timedOut])

  // Submit-Handler: file-validation → hashing → init → uploading → confirming → polling
  // Pitfall 7: Doppel-Submit verhindert durch sofortiges phase='hashing' (Button disabled)
  const onSubmit = async (values: FormValues) => {
    // 1. File-Validierung (RESEARCH.md Pattern 5)
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setFileError('Bitte eine STEP-Datei auswählen.')
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setFileError('Datei überschreitet die maximale Größe von 100 MB.')
      return
    }
    if (!STEP_EXT_RE.test(file.name)) {
      setFileError('Nur STEP-Dateien (.step, .stp) werden akzeptiert.')
      return
    }
    setFileError(null)
    setDuplicateId(null)
    setErrorMsg(null)

    try {
      // 2. SHA-256 berechnen (Pitfall 3: phase='hashing' zeigt Spinner)
      setPhase('hashing')
      const sha256 = await sha256OfFile(file)

      // 3. Init-Request (POST /api/upload/init)
      setPhase('initializing')
      const initRes = await fetch('/api/upload/init', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name,
          sha256,
          original_filename: file.name,
          file_size_bytes: file.size,
          part_number: values.partNumber || undefined,
          project: values.project || undefined,
        }),
      })

      // HTTP 409 = Duplikat (D-11) — Form bleibt editierbar, kein Status-Tracker
      if (initRes.status === 409) {
        const data = await initRes.json()
        setDuplicateId(data.existing_part_id)
        setPhase('duplicate')   // Form bleibt enabled
        return
      }
      if (!initRes.ok) throw new Error('Init failed')
      const { part_id, presigned_url } = await initRes.json()
      setPartId(part_id)

      // 4. S3-PUT via XHR mit Progress Events (KEIN Content-Type-Header!)
      setPhase('uploading')
      setUploadPercent(0)
      await uploadToS3(presigned_url, file, setUploadPercent)

      // 5. Confirm (POST /api/upload/confirm)
      setPhase('confirming')
      const confirmRes = await fetch('/api/upload/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ part_id }),
      })
      if (!confirmRes.ok) throw new Error('Confirm failed')

      // 6. Polling starten (D-04) — Hook reaktiviert sich über polledPartId
      setPhase('polling')
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setErrorMsg(`Upload fehlgeschlagen: ${msg}`)
      setPhase('error')
    }
  }

  // Reset-Handler für "Neuer Upload" (D-10) — erscheint NUR nach Thumbnail-Load
  const handleReset = () => {
    form.reset({ name: '', partNumber: '', project: '' })
    if (fileInputRef.current) fileInputRef.current.value = ''
    setPartId(null)              // Triggert Hook-Cleanup automatisch
    setPhase('idle')
    setUploadPercent(0)
    setDuplicateId(null)
    setErrorMsg(null)
    setThumbnailUrl(null)
    setFileError(null)
  }

  // Hilfswerte für UI-Rendering
  const isFormDisabled = phase !== 'idle' && phase !== 'duplicate'
  const showStatusTracker = phase !== 'idle' && phase !== 'duplicate' && phase !== 'error'

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* LINKE SPALTE: Upload-Formular (D-03) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Bauteil-Daten</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File Input — uncontrolled (RESEARCH.md Pattern 5, außerhalb Form) */}
          <div className="space-y-1">
            <Label htmlFor="step-file">STEP-Datei</Label>
            <input
              id="step-file"
              type="file"
              ref={fileInputRef}
              accept=".step,.stp"
              disabled={isFormDisabled}
              className="block w-full text-sm text-foreground file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-secondary file:text-secondary-foreground hover:file:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px]"
            />
            <p className="text-xs text-muted-foreground">Maximale Dateigröße: 100 MB</p>
            {fileError && (
              <p className="text-sm text-destructive">{fileError}</p>
            )}
          </div>

          {/* Duplikat-Alert (D-11) — inline, kein Toast */}
          {duplicateId && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Diese Datei existiert bereits — Teil-ID: {duplicateId}
              </AlertDescription>
            </Alert>
          )}

          {/* Netzwerkfehler-Alert */}
          {errorMsg && phase === 'error' && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{errorMsg}</AlertDescription>
            </Alert>
          )}

          {/* Formularfelder mit react-hook-form + Zod */}
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Bezeichnung (required) */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bezeichnung</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="z. B. Flanschplatte 50mm"
                        disabled={isFormDisabled}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Teilenummer (optional) */}
              <FormField
                control={form.control}
                name="partNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Teilenummer</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="z. B. MFG-4711 (optional)"
                        disabled={isFormDisabled}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Projekt (optional) */}
              <FormField
                control={form.control}
                name="project"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Projekt</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="z. B. Getriebe-Revision 2026 (optional)"
                        disabled={isFormDisabled}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* KEIN status-Select in Phase 4 — OQ2 RESOLVED, siehe 04-RESEARCH.md */}

              {/* Submit-Button */}
              <Button
                type="submit"
                disabled={isFormDisabled}
                className="w-full"
              >
                {isFormDisabled ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Wird hochgeladen…
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" />
                    Hochladen
                  </>
                )}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>

      {/* RECHTE SPALTE: Status-Tracker (D-03, D-09) — initial ausgeblendet */}
      {showStatusTracker && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Verarbeitungsstatus</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Progress-Bar während S3-Upload (D-09) */}
            {phase === 'uploading' && (
              <div className="space-y-1">
                <Progress value={uploadPercent} className="w-full" />
                <p className="text-xs text-muted-foreground text-right">{Math.round(uploadPercent)}%</p>
              </div>
            )}

            {/* Status-Badge mit Farb-Mapping aus UI-SPEC Color section */}
            {polledStatus && (
              <div className="flex items-center gap-2">
                {polledStatus === 'pending' && (
                  <Badge variant="secondary">Ausstehend</Badge>
                )}
                {polledStatus === 'processing' && (
                  <Badge variant="outline" className="text-blue-600 border-blue-300">
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                    Wird verarbeitet…
                  </Badge>
                )}
                {polledStatus === 'ready' && (
                  <Badge className="text-green-700 bg-green-50 border-green-200 hover:bg-green-50">
                    <CheckCircle2 className="mr-1 h-3 w-3" />
                    Bereit
                  </Badge>
                )}
                {polledStatus === 'failed' && (
                  <Badge variant="destructive">
                    <XCircle className="mr-1 h-3 w-3" />
                    Fehlgeschlagen
                  </Badge>
                )}
              </div>
            )}

            {/* Status-Beschreibungstexte (UI-SPEC Copywriting Contract) */}
            {polledStatus === 'pending' && (
              <p className="text-sm text-muted-foreground">Warte auf Worker…</p>
            )}
            {polledStatus === 'processing' && (
              <p className="text-sm text-muted-foreground">
                3D-Ansichten werden berechnet. Dies kann 30–120 Sekunden dauern.
              </p>
            )}
            {polledStatus === 'ready' && (
              <p className="text-sm text-muted-foreground">
                Verarbeitung abgeschlossen. Vorschau wird geladen…
              </p>
            )}
            {polledStatus === 'failed' && (
              <p className="text-sm text-destructive">
                Die Verarbeitung ist fehlgeschlagen. Bitte prüfe die STEP-Datei und versuche es erneut.
              </p>
            )}

            {/* Verarbeitungsphasen ohne polledStatus (hashing, initializing, confirming) */}
            {!polledStatus && (phase === 'hashing' || phase === 'initializing' || phase === 'confirming') && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                {phase === 'hashing' && 'Prüfsumme wird berechnet…'}
                {phase === 'initializing' && 'Upload wird initialisiert…'}
                {phase === 'confirming' && 'Verarbeitung wird gestartet…'}
              </div>
            )}

            {/* Thumbnail (D-07, D-08) — Skeleton bis URL geladen, dann <img> */}
            {phase === 'ready' && (
              <div>
                {thumbnailUrl ? (
                  <img
                    src={thumbnailUrl}
                    alt="Frontansicht"
                    className="w-48 h-48 object-contain rounded-md border"
                  />
                ) : (
                  <Skeleton className="w-48 h-48" />
                )}
              </div>
            )}

            {/* Timeout-Warnung (D-06) */}
            {timedOut && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Die Verarbeitung dauert länger als erwartet. Seite neu laden, um den Status zu prüfen.
                </AlertDescription>
              </Alert>
            )}

            {/* Netzwerkfehler im Polling */}
            {pollError && !timedOut && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Upload fehlgeschlagen. Bitte Verbindung prüfen und erneut versuchen.
                </AlertDescription>
              </Alert>
            )}

            {/* "Neuer Upload"-Button — D-10: erscheint NUR nach Thumbnail-Load */}
            {phase === 'ready' && thumbnailUrl && (
              <Button onClick={handleReset} variant="outline">
                <RefreshCw className="mr-2 h-4 w-4" />
                Neuer Upload
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
