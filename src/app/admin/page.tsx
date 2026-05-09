// src/app/admin/page.tsx
// Phase 5 — /admin Server Component Shell.
// KEIN "use client" — CatalogTable ist Client Component, page.tsx bleibt server-side.

import type { Metadata } from 'next'
import { CatalogTable } from './CatalogTable'

export const metadata: Metadata = {
  title: 'Teile-Katalog — Bauteil-Finder',
}

export default function AdminPage() {
  return (
    <main className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <CatalogTable />
      </div>
    </main>
  )
}
