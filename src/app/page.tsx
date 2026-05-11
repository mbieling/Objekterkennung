// src/app/page.tsx
// Landing-Page: Hero mit zwei Hauptaktionen (Hochladen / Suchen).

import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8 py-16 sm:py-24 text-center">
      <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
        Bauteil-Finder
      </h1>
      <p className="mt-4 text-base sm:text-lg text-muted-foreground">
        STEP-Dateien hochladen und geometrisch ähnliche Bauteile per Kamera finden.
      </p>
      <div className="mt-10 flex gap-3 flex-wrap justify-center">
        <Button asChild size="lg">
          <Link href="/upload">Teil hochladen</Link>
        </Button>
        <Button variant="outline" size="lg" asChild>
          <Link href="/search">Teil suchen</Link>
        </Button>
      </div>
    </div>
  )
}
