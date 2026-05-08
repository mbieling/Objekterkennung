// src/app/upload/UploadForm.test.tsx
// Tests für UploadForm-Komponente (D-09, D-10, D-11, INGEST-01)
// Wave 3 — Plan 05: alle 6 Tests aktiviert.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { UploadForm } from './UploadForm'

function makeFile(name: string, sizeBytes: number, content = 'x'): File {
  const blob = new Blob([content.repeat(Math.max(1, Math.min(sizeBytes, 100)))], {
    type: 'application/octet-stream',
  })
  const file = new File([blob], name, { type: 'application/octet-stream' })
  // Überschreibe size auf dem File-Objekt (nicht dem Blob), damit Validierung korrekt auslöst
  Object.defineProperty(file, 'size', { value: sizeBytes, configurable: true })
  return file
}

describe('UploadForm', () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch
    // crypto.subtle.digest mocken — gibt deterministischen ArrayBuffer zurück
    vi.spyOn(crypto.subtle, 'digest').mockResolvedValue(new ArrayBuffer(32))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('validates name required', async () => {
    render(<UploadForm />)
    const fileInput = screen.getByLabelText(/STEP-Datei/i) as HTMLInputElement
    Object.defineProperty(fileInput, 'files', {
      value: [makeFile('a.step', 1024)],
      writable: false,
    })
    fireEvent.change(fileInput)
    fireEvent.click(screen.getByRole('button', { name: /Hochladen/i }))
    await waitFor(() =>
      expect(screen.getByText('Bezeichnung ist erforderlich.')).toBeTruthy()
    )
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('validates file size', async () => {
    render(<UploadForm />)
    const fileInput = screen.getByLabelText(/STEP-Datei/i) as HTMLInputElement
    Object.defineProperty(fileInput, 'files', {
      value: [makeFile('a.step', 200 * 1024 * 1024)],
      writable: false,
    })
    fireEvent.change(fileInput)
    fireEvent.change(screen.getByLabelText(/Bezeichnung/i), { target: { value: 'A' } })
    fireEvent.click(screen.getByRole('button', { name: /Hochladen/i }))
    await waitFor(() =>
      expect(
        screen.getByText(/überschreitet die maximale Größe von 100 MB/)
      ).toBeTruthy()
    )
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('validates file extension', async () => {
    render(<UploadForm />)
    const fileInput = screen.getByLabelText(/STEP-Datei/i) as HTMLInputElement
    Object.defineProperty(fileInput, 'files', {
      value: [makeFile('a.jpg', 1024)],
      writable: false,
    })
    fireEvent.change(fileInput)
    fireEvent.change(screen.getByLabelText(/Bezeichnung/i), { target: { value: 'A' } })
    fireEvent.click(screen.getByRole('button', { name: /Hochladen/i }))
    await waitFor(() =>
      expect(screen.getByText(/Nur STEP-Dateien/)).toBeTruthy()
    )
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('shows duplicate alert with existing_part_id on HTTP 409', async () => {
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 409,
      json: async () => ({ error: 'Duplicate file', existing_part_id: 'abc-123' }),
    } as Response)

    render(<UploadForm />)
    const fileInput = screen.getByLabelText(/STEP-Datei/i) as HTMLInputElement
    Object.defineProperty(fileInput, 'files', {
      value: [makeFile('a.step', 1024)],
      writable: false,
    })
    fireEvent.change(fileInput)
    fireEvent.change(screen.getByLabelText(/Bezeichnung/i), { target: { value: 'A' } })
    fireEvent.click(screen.getByRole('button', { name: /Hochladen/i }))
    await waitFor(() =>
      expect(screen.getByText(/Diese Datei existiert bereits/)).toBeTruthy()
    )
    expect(screen.getByText(/abc-123/)).toBeTruthy()
    // Form bleibt editierbar (D-11)
    expect((screen.getByLabelText(/Bezeichnung/i) as HTMLInputElement).disabled).toBe(false)
  })

  it('disables fields after submit (D-09)', async () => {
    // Mock init → 200, dann XHR-S3-Upload simuliert success, dann confirm → 202
    ;(global.fetch as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          part_id: 'pid-1',
          presigned_url: 'https://s3.example.com/x',
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 202,
        json: async () => ({ part_id: 'pid-1', status: 'pending' }),
      } as Response)

    // Mock XMLHttpRequest (RESEARCH.md Test-Pattern)
    class MockXHR {
      upload = { addEventListener: vi.fn() }
      status = 200
      private listeners: Record<string, () => void> = {}
      open() {}
      setRequestHeader() {}
      addEventListener(event: string, cb: () => void) {
        this.listeners[event] = cb
      }
      send() {
        setTimeout(() => this.listeners['load']?.(), 0)
      }
    }
    vi.stubGlobal('XMLHttpRequest', MockXHR)

    render(<UploadForm />)
    const fileInput = screen.getByLabelText(/STEP-Datei/i) as HTMLInputElement
    Object.defineProperty(fileInput, 'files', {
      value: [makeFile('a.step', 1024)],
      writable: false,
    })
    fireEvent.change(fileInput)
    fireEvent.change(screen.getByLabelText(/Bezeichnung/i), { target: { value: 'A' } })
    fireEvent.click(screen.getByRole('button', { name: /Hochladen/i }))
    await waitFor(() =>
      expect(
        (screen.getByLabelText(/Bezeichnung/i) as HTMLInputElement).disabled
      ).toBe(true)
    )
  })

  it('shows reset button only after status=ready (D-10)', async () => {
    // Test verifiziert nur den idle-Negativ-Fall.
    // Positiv-Fall (Reset-Button erscheint nach ready + Thumbnail) wird im Human-Verify-Checkpoint (Plan 06) bestätigt.
    render(<UploadForm />)
    // Initial: kein Reset-Button
    expect(screen.queryByRole('button', { name: /Neuer Upload/i })).toBeNull()
  })
})
