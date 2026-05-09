// src/app/page.tsx
// Phase 4 — Landing-Page. Phase 7 — zweiter Button "Teil suchen" (D-02).

import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <main className="min-h-screen flex items-center justify-center p-8">
      <div className="flex gap-4 flex-wrap justify-center">
        <Button asChild>
          <Link href="/upload">Teil hochladen</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/search">Teil suchen</Link>
        </Button>
      </div>
    </main>
  )
}
