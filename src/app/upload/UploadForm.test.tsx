// src/app/upload/UploadForm.test.tsx
// Tests für UploadForm-Komponente (D-09, D-10, D-11, INGEST-01)
// STUBS — Logik wird in Plan 05 (Wave 2) implementiert.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('UploadForm', () => {
  beforeEach(() => {
    global.fetch = vi.fn() as unknown as typeof fetch
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.skip('validates name required', async () => {
    // STUB — Plan 05
  })

  it.skip('validates file size', async () => {
    // STUB — Plan 05
  })

  it.skip('validates file extension', async () => {
    // STUB — Plan 05
  })

  it.skip('shows duplicate alert with existing_part_id on HTTP 409', async () => {
    // STUB — Plan 05
  })

  it.skip('disables fields after submit (D-09)', async () => {
    // STUB — Plan 05
  })

  it.skip('shows reset button only after status=ready (D-10)', async () => {
    // STUB — Plan 05
  })
})
