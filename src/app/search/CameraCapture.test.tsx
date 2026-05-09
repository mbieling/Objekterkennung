// src/app/search/CameraCapture.test.tsx
// Phase 7 — Unit Test Stubs für CameraCapture (SEARCH-01, SEARCH-02, D-05 bis D-11)
// Wave 0: Testgerüst mit getUserMedia-Mock-Infrastruktur. Implementierung folgt in Wave 1 (Plan 07-02).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { CameraCapture } from './CameraCapture'

// ---------------------------------------------------------------------------
// getUserMedia-Mock-Helper
// navigator.mediaDevices ist in jsdom nicht verfügbar — via Object.defineProperty mocken.
// Analog zu global.fetch = vi.fn() in UploadForm.test.tsx.
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
// canvas.toBlob Mock (für Capture-Tests — jsdom implementiert toBlob nicht)
// ---------------------------------------------------------------------------
HTMLCanvasElement.prototype.toBlob = vi.fn((callback) => {
  callback(new Blob(['fake-image'], { type: 'image/jpeg' }))
})

// ---------------------------------------------------------------------------
// global.fetch Mock (für POST /api/search)
// ---------------------------------------------------------------------------
global.fetch = vi.fn()

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
  it.todo('SEARCH-01: Kamera-Button click ruft getUserMedia mit facingMode environment auf')

  // SEARCH-01: getUserMedia success → Video-Container sichtbar
  it.todo('SEARCH-01: getUserMedia success → Video-Container sichtbar mit Aufnehmen-Button')

  // SEARCH-01: Capture-Flow (D-08)
  it.todo('SEARCH-01: Aufnehmen-Button click → canvas.toBlob aufgerufen, Vorschau angezeigt (D-08)')

  // SEARCH-01: Vorschau-State (D-08)
  it.todo('SEARCH-01: Vorschau zeigt Suchen-Button + Wiederholen-Button (D-08)')

  // SEARCH-01: Suche abschicken (D-09)
  it.todo('SEARCH-01: Suchen-Button click → fetch POST /api/search mit FormData aufgerufen, Spinner sichtbar (D-09)')

  // SEARCH-01+02: Erfolgreiche Suche (D-10)
  it.todo('SEARCH-01+02: POST /api/search 200 → JSON in pre-Block sichtbar (D-10)')

  // SEARCH-01+02: Fehler bei Suche (D-11)
  it.todo('SEARCH-01+02: POST /api/search Fehler → Alert + Neu aufnehmen-Button sichtbar (D-11)')

  // SEARCH-01: getUserMedia Fehler → Fallback (D-05)
  it.todo('SEARCH-01: getUserMedia Fehler → Alert + File-Input eingeblendet (D-05)')

  // SEARCH-02: File-Input immer sichtbar in idle-State (D-06)
  it.todo('SEARCH-02: File-Input immer sichtbar in idle-State (D-06)')
})
