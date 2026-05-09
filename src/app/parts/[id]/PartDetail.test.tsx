// Tests für PartDetail-Komponente (D-01..D-11, DETAIL-01, DETAIL-02)
// Aktiviert in Plan 09-03 (Wave 2) — alle Tests grün nach Hook + Component-Implementierung.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { PartDetail } from './PartDetail'
import { usePartDetail } from '../../../hooks/usePartDetail'

vi.mock('../../../hooks/usePartDetail')
// The mock path must match the resolved import path used in PartDetail.tsx
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    back: vi.fn(),
    push: vi.fn(),
  }),
}))

const mockPart = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  name: 'Flansch M12',
  part_number: 'FL-042',
  project: 'Getriebe',
  status: 'ready' as const,
  thumbnail_count: 3,
  created_at: '2026-05-09T10:00:00Z',
}

describe('PartDetail', () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // DETAIL-01: Metadaten vollständig anzeigen
  it('zeigt alle 5 Metadatenfelder wenn geladen (name, part_number, project, status, created_at)', () => {
    vi.mocked(usePartDetail).mockReturnValue({
      part: mockPart,
      thumbnailUrls: ['https://example.com/view_0.png'],
      isLoading: false,
      error: null,
    })

    render(<PartDetail id={mockPart.id} />)

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Flansch M12')
    expect(screen.getByText('FL-042')).toBeInTheDocument()
    expect(screen.getByText('Getriebe')).toBeInTheDocument()
    expect(screen.getByText('Bereit')).toBeInTheDocument()
    // Datum formatiert als de-DE: 09.05.2026
    expect(screen.getByText('09.05.2026')).toBeInTheDocument()
  })

  // DETAIL-01: Skeleton während Laden
  it('zeigt Skeleton-Layout während API-Request aussteht (isLoading=true)', () => {
    vi.mocked(usePartDetail).mockReturnValue({
      part: null,
      thumbnailUrls: [],
      isLoading: true,
      error: null,
    })

    const { container } = render(<PartDetail id="some-id" />)
    // Skeleton-Elemente sind vorhanden (animate-pulse ist die Skeleton-CSS-Klasse)
    const skeletons = container.querySelectorAll('.animate-pulse')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  // DETAIL-01: 404-Fehler-State
  it('zeigt Fehlermeldung "Bauteil nicht gefunden" wenn API 404 zurückgibt', () => {
    vi.mocked(usePartDetail).mockReturnValue({
      part: null,
      thumbnailUrls: [],
      isLoading: false,
      error: 'not_found',
    })

    render(<PartDetail id="nonexistent-id" />)

    expect(screen.getByText('Bauteil nicht gefunden.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /zurück zur suche/i })).toBeInTheDocument()
  })

  // DETAIL-01: StatusBadge-Farben pro Status
  it('StatusBadge zeigt grünen "Bereit"-Badge für status=ready', () => {
    vi.mocked(usePartDetail).mockReturnValue({
      part: { ...mockPart, status: 'ready' },
      thumbnailUrls: [],
      isLoading: false,
      error: null,
    })

    render(<PartDetail id={mockPart.id} />)
    expect(screen.getByText('Bereit')).toBeInTheDocument()
  })

  it('StatusBadge zeigt "Fehlgeschlagen" destructive-Badge für status=failed', () => {
    vi.mocked(usePartDetail).mockReturnValue({
      part: { ...mockPart, status: 'failed' },
      thumbnailUrls: [],
      isLoading: false,
      error: null,
    })

    render(<PartDetail id={mockPart.id} />)
    expect(screen.getByText('Fehlgeschlagen')).toBeInTheDocument()
  })

  // DETAIL-02: Download-Button-States
  it('Download-Button ist disabled mit Hinweis "Datei wird noch verarbeitet" wenn status!=ready', () => {
    vi.mocked(usePartDetail).mockReturnValue({
      part: { ...mockPart, status: 'processing' },
      thumbnailUrls: [],
      isLoading: false,
      error: null,
    })

    render(<PartDetail id={mockPart.id} />)

    const downloadBtn = screen.getByRole('button', { name: /step herunterladen/i })
    expect(downloadBtn).toBeDisabled()
    expect(screen.getByText('Datei wird noch verarbeitet')).toBeInTheDocument()
  })

  it('Download-Button ruft /api/parts/[id]/download auf und setzt window.location.href bei status=ready', async () => {
    vi.mocked(usePartDetail).mockReturnValue({
      part: { ...mockPart, status: 'ready' },
      thumbnailUrls: [],
      isLoading: false,
      error: null,
    })

    const presignedUrl = 'https://s3.example.com/presigned-download-url'
    ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ url: presignedUrl, filename: 'Flansch_M12.step' }),
    } as Response)

    // window.location.href mock
    const originalLocation = window.location
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { href: '' },
    })

    render(<PartDetail id={mockPart.id} />)

    const downloadBtn = screen.getByRole('button', { name: /step herunterladen/i })
    expect(downloadBtn).not.toBeDisabled()
    fireEvent.click(downloadBtn)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(`/api/parts/${mockPart.id}/download`)
      expect(window.location.href).toBe(presignedUrl)
    })

    // Cleanup
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    })
  })
})
