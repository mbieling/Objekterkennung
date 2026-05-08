// src/app/page.tsx
// Phase 4 — minimale Landing-Page (D-02). Späterer Dashboard-Ausbau in Phase 5+.

import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <Button asChild>
        <Link href="/upload">Teil hochladen</Link>
      </Button>
    </main>
  )
}
