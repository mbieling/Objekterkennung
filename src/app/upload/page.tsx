// src/app/upload/page.tsx
// Phase 4 — /upload Server Component Wrapper (D-01).
// KEIN "use client" — UploadForm ist Client Component, page.tsx bleibt server-side.

import type { Metadata } from 'next'
import { UploadForm } from './UploadForm'

export const metadata: Metadata = {
  title: 'STEP-Datei hochladen — Bauteil-Finder',
}

export default function UploadPage() {
  return (
    <div className="py-12 px-4">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold mb-8">STEP-Datei hochladen</h1>
        <UploadForm />
      </div>
    </div>
  )
}
