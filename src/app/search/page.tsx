// src/app/search/page.tsx
// Phase 7 — /search Server Component (D-01)
// Metadata + Layout-Shell; CameraCapture ist Client Component

import type { Metadata } from 'next'
import { CameraCapture } from './CameraCapture'

export const metadata: Metadata = {
  title: 'Bauteil suchen — Bauteil-Finder',
}

export default function SearchPage() {
  return (
    <div className="py-8 px-4">
      <div className="max-w-md mx-auto">
        <h1 className="text-2xl font-semibold mb-8">Bauteil fotografieren</h1>
        <CameraCapture />
      </div>
    </div>
  )
}
