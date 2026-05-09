// Tests für PartDetail-Komponente (D-01..D-11, DETAIL-01, DETAIL-02)
// Aktiviert in Plan 09-03 (Wave 2) — alle Tests grün nach Hook + Component-Implementierung.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

// PartDetail noch nicht implementiert — Import wird in Wave 2 (09-03) aufgelöst.
// import { PartDetail } from './PartDetail'

function mockFetchResponse(body: unknown, status = 200) {
  ;(global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response)
}

describe('PartDetail', () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  // DETAIL-01: Metadaten vollständig anzeigen
  it.todo('zeigt alle 5 Metadatenfelder wenn geladen (name, part_number, project, status, created_at)')

  // DETAIL-01: Skeleton während Laden
  it.todo('zeigt Skeleton-Layout während API-Request aussteht (isLoading=true)')

  // DETAIL-01: 404-Fehler-State
  it.todo('zeigt Fehlermeldung "Bauteil nicht gefunden" wenn API 404 zurückgibt')

  // DETAIL-01: StatusBadge-Farben pro Status
  it.todo('StatusBadge zeigt grünen "Bereit"-Badge für status=ready')
  it.todo('StatusBadge zeigt "Fehlgeschlagen" destructive-Badge für status=failed')

  // DETAIL-02: Download-Button-States
  it.todo('Download-Button ist disabled mit Hinweis "Datei wird noch verarbeitet" wenn status!=ready')
  it.todo('Download-Button ruft /api/parts/[id]/download auf und setzt window.location.href bei status=ready')
})
