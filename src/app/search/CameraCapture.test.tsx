// src/app/search/CameraCapture.test.tsx
// Phase 7 — Unit Tests für CameraCapture (SEARCH-01, SEARCH-02, D-05 bis D-11)
// Wave 1: Vollständige Implementierung (Plan 07-02).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CameraCapture } from './CameraCapture'

// ---------------------------------------------------------------------------
// getUserMedia-Mock-Helper
// navigator.mediaDevices ist in jsdom nicht verfügbar — via Object.defineProperty mocken.
// ---------------------------------------------------------------------------
function mockGetUserMedia(success: boolean) {
  const mockStream = {
    getTracks: () => [{ stop: vi.fn() }],
  } as unknown as MediaStream

  Object.defineProperty(global.navigator, 'mediaDevices', {
    value: {
      getUserMedia: success
        ? vi.fn().mockResolvedValue(mockStream)
        : vi.fn().mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError')),
    },
    writable: true,
    configurable: true,
  })
}

// ---------------------------------------------------------------------------
// HTMLVideoElement.prototype.play Mock (jsdom implementiert play() nicht)
// ---------------------------------------------------------------------------
HTMLVideoElement.prototype.play = vi.fn().mockResolvedValue(undefined)

// ---------------------------------------------------------------------------
// canvas.toBlob Mock + getContext Mock (jsdom implementiert beides nicht vollständig)
// ---------------------------------------------------------------------------
const fakeBlob = new Blob(['fake-image'], { type: 'image/jpeg' })
HTMLCanvasElement.prototype.toBlob = vi.fn((callback) => {
  callback(fakeBlob)
})
// jsdom: canvas.getContext('2d') gibt null zurück — wir mocken es mit einem stub-CanvasRenderingContext2D
HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
  drawImage: vi.fn(),
})) as unknown as typeof HTMLCanvasElement.prototype.getContext

// ---------------------------------------------------------------------------
// global.fetch Mock (für POST /api/search)
// ---------------------------------------------------------------------------
global.fetch = vi.fn()

// ---------------------------------------------------------------------------
// URL.createObjectURL / revokeObjectURL Mocks (jsdom hat diese nicht)
// ---------------------------------------------------------------------------
global.URL.createObjectURL = vi.fn().mockReturnValue('blob:fake-url')
global.URL.revokeObjectURL = vi.fn()

// ---------------------------------------------------------------------------
// Test-Suite
// ---------------------------------------------------------------------------
describe('Phase 7: CameraCapture', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // SEARCH-01: Kamera-Aktivierung
  it('SEARCH-01: Kamera-Button click ruft getUserMedia mit facingMode environment auf', async () => {
    mockGetUserMedia(true)
    render(<CameraCapture />)

    const cameraBtn = screen.getByRole('button', { name: /kamera starten/i })
    fireEvent.click(cameraBtn)

    await waitFor(() => {
      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      })
    })
  })

  // SEARCH-01: getUserMedia success → Video-Container sichtbar
  it('SEARCH-01: getUserMedia success → Video-Container sichtbar mit Aufnehmen-Button', async () => {
    mockGetUserMedia(true)
    render(<CameraCapture />)

    fireEvent.click(screen.getByRole('button', { name: /kamera starten/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /aufnehmen/i })).toBeInTheDocument()
    })
  })

  // SEARCH-01: Capture-Flow (D-08)
  it('SEARCH-01: Aufnehmen-Button click → canvas.toBlob aufgerufen, Vorschau angezeigt (D-08)', async () => {
    mockGetUserMedia(true)
    render(<CameraCapture />)

    // Kamera starten
    fireEvent.click(screen.getByRole('button', { name: /kamera starten/i }))
    await waitFor(() => screen.getByRole('button', { name: /aufnehmen/i }))

    // Aufnehmen klicken
    fireEvent.click(screen.getByRole('button', { name: /aufnehmen/i }))

    await waitFor(() => {
      expect(HTMLCanvasElement.prototype.toBlob).toHaveBeenCalled()
      // Vorschau-img sollte erscheinen
      expect(screen.getByRole('img', { name: /aufgenommenes bauteil/i })).toBeInTheDocument()
    })
  })

  // SEARCH-01: Vorschau-State (D-08)
  it('SEARCH-01: Vorschau zeigt Suchen-Button + Wiederholen-Button (D-08)', async () => {
    mockGetUserMedia(true)
    render(<CameraCapture />)

    fireEvent.click(screen.getByRole('button', { name: /kamera starten/i }))
    await waitFor(() => screen.getByRole('button', { name: /aufnehmen/i }))
    fireEvent.click(screen.getByRole('button', { name: /aufnehmen/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /suchen/i })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /wiederholen/i })).toBeInTheDocument()
    })
  })

  // SEARCH-01: Suche abschicken (D-09)
  it('SEARCH-01: Suchen-Button click → fetch POST /api/search mit FormData aufgerufen, Spinner sichtbar (D-09)', async () => {
    mockGetUserMedia(true)
    // fetch bleibt pending → Spinner sichtbar
    vi.mocked(global.fetch).mockReturnValue(new Promise(() => {}))

    render(<CameraCapture />)

    fireEvent.click(screen.getByRole('button', { name: /kamera starten/i }))
    await waitFor(() => screen.getByRole('button', { name: /aufnehmen/i }))
    fireEvent.click(screen.getByRole('button', { name: /aufnehmen/i }))
    await waitFor(() => screen.getByRole('button', { name: /suchen/i }))
    fireEvent.click(screen.getByRole('button', { name: /suchen/i }))

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/search',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        })
      )
      // Spinner sichtbar (aria-label oder text)
      expect(screen.getByText(/suche läuft/i)).toBeInTheDocument()
    })

    // Kein Content-Type-Header in den fetch-Options
    const fetchCall = vi.mocked(global.fetch).mock.calls[0][1] as RequestInit
    expect(fetchCall.headers).toBeUndefined()
  })

  // SEARCH-01+02: Erfolgreiche Suche (D-10)
  it('SEARCH-01+02: POST /api/search 200 → JSON in pre-Block sichtbar (D-10)', async () => {
    mockGetUserMedia(true)
    const mockResponse = {
      results: [{ id: '1', name: 'Flanschplatte', part_number: null, project: null, status: 'ready', similarity: 0.92, created_at: '2026-01-01' }],
      query: { threshold: 0.7, limit: 10, results_count: 1 },
    }
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    } as Response)

    render(<CameraCapture />)

    fireEvent.click(screen.getByRole('button', { name: /kamera starten/i }))
    await waitFor(() => screen.getByRole('button', { name: /aufnehmen/i }))
    fireEvent.click(screen.getByRole('button', { name: /aufnehmen/i }))
    await waitFor(() => screen.getByRole('button', { name: /suchen/i }))
    fireEvent.click(screen.getByRole('button', { name: /suchen/i }))

    await waitFor(() => {
      const pre = screen.getByText(/flanschplatte/i)
      expect(pre).toBeInTheDocument()
    })
  })

  // SEARCH-01+02: Fehler bei Suche (D-11)
  it('SEARCH-01+02: POST /api/search Fehler → Alert + Neu aufnehmen-Button sichtbar (D-11)', async () => {
    mockGetUserMedia(true)
    vi.mocked(global.fetch).mockRejectedValue(new Error('Network error'))

    render(<CameraCapture />)

    fireEvent.click(screen.getByRole('button', { name: /kamera starten/i }))
    await waitFor(() => screen.getByRole('button', { name: /aufnehmen/i }))
    fireEvent.click(screen.getByRole('button', { name: /aufnehmen/i }))
    await waitFor(() => screen.getByRole('button', { name: /suchen/i }))
    fireEvent.click(screen.getByRole('button', { name: /suchen/i }))

    await waitFor(() => {
      expect(screen.getByText(/suche fehlgeschlagen/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /neu aufnehmen/i })).toBeInTheDocument()
    })
  })

  // SEARCH-01: getUserMedia Fehler → Fallback (D-05)
  it('SEARCH-01: getUserMedia Fehler → Alert + File-Input eingeblendet (D-05)', async () => {
    mockGetUserMedia(false)
    render(<CameraCapture />)

    fireEvent.click(screen.getByRole('button', { name: /kamera starten/i }))

    await waitFor(() => {
      expect(screen.getByText(/kamerazugriff verweigert/i)).toBeInTheDocument()
      // File-Input-Trigger ist sichtbar (Galerie-Button)
      expect(screen.getByRole('button', { name: /foto aus galerie wählen/i })).toBeInTheDocument()
    })
  })

  // SEARCH-02: File-Input immer sichtbar in idle-State (D-06)
  it('SEARCH-02: File-Input immer sichtbar in idle-State (D-06)', () => {
    render(<CameraCapture />)
    expect(screen.getByRole('button', { name: /foto aus galerie wählen/i })).toBeInTheDocument()
  })
})
