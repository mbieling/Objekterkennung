# Phase 4: Ingestion UI — Research

**Researched:** 2026-05-08
**Domain:** Next.js 16 App Router Client-UI für Async-Upload-Flow mit Polling-basiertem Statusfortschritt
**Confidence:** HIGH (Stack vollständig verifiziert, alle Patterns durch existierenden Code etabliert)

## Summary

Phase 4 verbindet die in Phase 3 fertiggestellten API-Endpunkte (`POST /api/upload/init`, `POST /api/upload/confirm`) mit einem Client-UI, das Ingenieure durch einen 5-stufigen Upload-Flow führt: Datei wählen → SHA-256 berechnen → Init-Request → S3-PUT (mit XHR-Progress) → Confirm-Request → Status-Polling bis ready/failed. Die UI ist eine **Single-Page Client-Komponente** (`"use client"`) mit React-Hook-Form + Zod, einem Custom Hook `usePartStatus` für variables Polling (2s/5s, 5min Timeout), und zwei neuen Server-API-Routes (`GET /api/parts/[id]/status` und `GET /api/parts/[id]/thumbnail`).

Die kritischen Implementierungs-Entscheidungen sind bereits durch CONTEXT.md und UI-SPEC.md vorgegeben (D-01 bis D-11). Diese Recherche liefert die **prescriptive Implementierungs-Patterns** für die fünf Bereiche, die bei der Planung Detail-Klarheit brauchen: (1) dynamische Route-Handler für `[id]` in Next.js 16, (2) `usePartStatus` Hook-Architektur, (3) SHA-256 + XHR-PUT-Flow im Browser, (4) react-hook-form mit File-Input (uncontrolled), (5) Fehlerbehandlung mit Retry-Schwellwert.

**Primary recommendation:** Single-Client-Component (`UploadForm.tsx`) mit allem Upload-State, einem reinen `usePartStatus`-Hook für Polling, zwei thin API-Routes, und react-hook-form für Validierung — keine zusätzlichen Bibliotheken nötig, alles bereits in `package.json` vorhanden.

## User Constraints (from CONTEXT.md)

### Locked Decisions

**Seitenstruktur & Routing**
- **D-01:** Eigene Seite `/upload` — `src/app/upload/page.tsx`. Saubere URL, Ingenieure können direkt bookmarken. Startseite (`/`) wird später zum Dashboard (Phase 5+).
- **D-02:** Startseite bleibt minimal — ein einzelner Button/Link "Teil hochladen" zeigt auf `/upload`. Kein Redirect `/ → /upload`.
- **D-03:** 2-Spalten-Layout auf `/upload` — Formular links, Status-Tracker rechts. Status-Tracker ist initial ausgeblendet und erscheint nach dem ersten Submit.

**Echtzeit-Status-Mechanismus**
- **D-04:** Polling mit variablem Intervall — `setInterval` alle 2s in den ersten 30s, danach alle 5s. Stop bei `status = 'ready'` oder `status = 'failed'`.
- **D-05:** Neuer API-Endpunkt: `GET /api/parts/[id]/status` — liest `parts.status` aus Neon, gibt `{status, thumbnail_count}` zurück.
- **D-06:** Timeout nach 5 Minuten — Polling stoppt, Warn-Meldung: *"Die Verarbeitung dauert länger als erwartet. Seite neu laden, um den Status zu prüfen."* Status in der DB bleibt unverändert.

**Thumbnail-Darstellung**
- **D-07:** Nur 1 Thumbnail — `view_0.png` (Frontansicht). Volle Galerie kommt im Admin-Katalog (Phase 5).
- **D-08:** Presigned URL via Server — `GET /api/parts/[id]/thumbnail` gibt eine temporäre S3-URL zurück (60s Laufzeit). Kein öffentlicher Bucket nötig.

**Formularverhalten**
- **D-09:** Nach Submit: Formular einfrieren — Felder werden `disabled`, Submit-Button deaktiviert. Status-Tracker erscheint rechts mit Badge `pending → processing → ready`.
- **D-10:** Nach `ready`: Reset-Button erscheint — "Neuer Upload" setzt Formular zurück, Status-Tracker wird ausgeblendet.
- **D-11:** Duplikat-Fehler: Inline-Alert — roter Alert-Banner unter dem Datei-Input: *"Diese Datei existiert bereits — Teil-ID: xxxx"*. Kein Toast. Formular bleibt editierbar.

### Claude's Discretion

- Genaue shadcn-Komponenten-Kombination für den Status-Tracker (Badge + Progress + Skeleton empfohlen)
- Pollinglogik als Custom Hook (`usePartStatus`) oder inline im Komponenten-State
- Exakte Fehler-Response-Darstellung für Netzwerkfehler (Fetch-Fehler bei init/confirm)
- `view_0.png` vs. automatische Erkennung des ersten verfügbaren Views

### Deferred Ideas (OUT OF SCOPE)

- **Volle Thumbnail-Galerie (alle 6–8 Views)** — explizit auf Phase 5 (Admin-Katalog) verschoben
- **Admin-Dashboard / Katalog** — Phase 5-Scope, nicht Phase 4
- **Retry-Button für failed-Status** — Phase 5 (ADMIN-04)

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INGEST-01 | Nutzer kann eine STEP-Datei (max. 100 MB) mit Metadaten hochladen (Name, Teilenummer, Projekt, Status) | UI Pattern (Section: Architecture Patterns Pattern 1), File-Validation (Section: Code Examples), react-hook-form Integration (Section: Code Examples), bestehende `/api/upload/init` + `/api/upload/confirm` (verifiziert) |
| INGEST-02 | System zeigt nach dem Upload den Verarbeitungsstatus an (pending → processing → ready → failed) | `usePartStatus`-Hook (Section: Architecture Patterns Pattern 2), neuer `GET /api/parts/[id]/status`-Endpunkt (Section: Code Examples), Status-Badge-Mapping (UI-SPEC.md Color section) |

## Project Constraints (from CLAUDE.md)

| Constraint | Source | Compliance Approach |
|------------|--------|---------------------|
| **shadcn/ui First (mandatory)** | `.claude/rules/frontend.md` + CLAUDE.md | NIEMALS Button, Input, Select, Alert, Badge, Card, Progress, Skeleton, Form, Label neu bauen — alle bereits in `src/components/ui/` vorhanden (verifiziert via `ls`). Falls etwas fehlt: `npx shadcn@latest add <name> --yes`. |
| **Tailwind exclusively** | frontend.md | Keine inline styles, keine CSS-Modules. Nur Tailwind-Klassen + `cn()` aus `@/lib/utils`. |
| **`"use client"` nur wenn nötig** | CONVENTIONS.md | Page (`page.tsx`) bleibt Server Component (setzt nur Page-Title). Interaktive Logik in extrahierter Client-Komponente (`UploadForm.tsx`). API-Routes immer server-only. |
| **Kein `NEXT_PUBLIC_` für Secrets** | security.md | AWS-Keys, DATABASE_URL bleiben server-only. Presigned URLs werden nur vom Server generiert. |
| **Zod-Validierung server-seitig** | security.md, backend.md | Existierende API-Routes validieren bereits mit Zod. Neue Status- und Thumbnail-Routes validieren `[id]` als UUID via Zod oder Regex. |
| **Path-Alias `@/*`** | CONVENTIONS.md | Imports immer `@/components/ui/...`, niemals relative `../../`. |
| **Tests co-located** | TESTING.md | `usePartStatus.test.ts` neben `usePartStatus.ts`; Route-Tests neben `route.ts`. |
| **Loading-State in ALLEN Code-Pfaden zurücksetzen** | frontend.md | Submit-Handler muss `try/catch/finally` haben oder explizite Reset-Logik in allen Branches (Erfolg, Fehler, Timeout). |
| **Commit-Format** | CONVENTIONS.md | `feat(04-XX): description` für Phase-Pläne (an GSD-Konvention angelehnt) — wird vom Planner pro Plan festgelegt. |
| **GSD-Workflow** | CLAUDE.md | Phase 4 ist GSD-getrieben (`.planning/phases/04-ingestion-ui/`); Feature-INDEX.md bleibt unberührt — features-Workflow ist Template-Erbe und wird in diesem Projekt nicht parallel geführt. |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Datei-Picker, Metadaten-Form, Validierung | Browser / Client | — | UI-Logik, kein Server-Roundtrip nötig vor Submit |
| SHA-256-Berechnung der Datei | Browser / Client | — | Pflicht (`crypto.subtle`) — verhindert dass 100 MB an den Server fließen vor Dedup-Check (architektonisch in Phase 3 D-08 festgelegt) |
| Upload-Initialisierung (Dedup + DB-Insert + Presigned URL) | API / Backend | — | Bereits in Phase 3 implementiert: `POST /api/upload/init` |
| S3-PUT der STEP-Datei | Browser / Client | CDN / Storage (S3) | Browser → S3 direkt via Presigned URL (kein Next.js-Proxy für 100 MB) |
| Worker-Dispatch (Celery) | API / Backend | — | Bereits in Phase 3 implementiert: `POST /api/upload/confirm` |
| Status-Lookup (Read `parts.status`) | API / Backend | Database | NEU in Phase 4: `GET /api/parts/[id]/status` — DB-Read, kein Worker-Touch |
| Status-Polling-Schleife | Browser / Client | — | UI-State, `setInterval` mit Cleanup |
| Thumbnail-Presigned-URL-Generierung | API / Backend | CDN / Storage (S3) | NEU in Phase 4: `GET /api/parts/[id]/thumbnail` — server signiert, Client rendert |
| Thumbnail-Anzeige | Browser / Client | — | `<img src={presigned_url}>` — Browser fetcht direkt von S3 |

## Standard Stack

### Core (alle bereits in `package.json`)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | ^16.1.1 | App Router, Route Handlers für `/api/parts/[id]/status` und `/api/parts/[id]/thumbnail` | Bereits installiert. **Wichtig:** In Next.js 15+ ist `params` ein Promise. [VERIFIED: package.json + Next.js docs] |
| `react` | ^19.0.0 | UI rendering, hooks (`useState`, `useEffect`, `useRef`) | Bereits installiert [VERIFIED: package.json] |
| `react-hook-form` | ^7.71.1 | Formular-State + Validation für Metadaten-Felder | Bereits installiert; Standard-Pattern für shadcn `Form`-Komponente [VERIFIED: package.json + form.tsx] |
| `zod` | ^4.3.5 | Schema-Validation (Client + Server) | Bereits installiert; bereits in init/confirm-Routes verwendet [VERIFIED: package.json + route.ts] |
| `@hookform/resolvers` | ^5.2.2 | Bridge zwischen react-hook-form und Zod | Bereits installiert [VERIFIED: package.json] |
| `@aws-sdk/client-s3` | ^3.1045.0 | S3-Client für presigned thumbnail URLs (server-side) | Bereits installiert + in `src/lib/s3.ts` [VERIFIED: package.json + s3.ts] |
| `@aws-sdk/s3-request-presigner` | ^3.1045.0 | `getSignedUrl()` für GetObjectCommand auf Thumbnail | Bereits installiert + in init-route verwendet [VERIFIED: package.json] |
| `@neondatabase/serverless` | ^1.1.0 | Tagged-template SQL für Status-Lookup | Bereits installiert + in `src/lib/db.ts` [VERIFIED: package.json + db.ts] |
| `lucide-react` | ^0.562.0 | Icons (Upload, CheckCircle2, XCircle, Loader2, RefreshCw, AlertCircle) | Bereits installiert [VERIFIED: package.json] |

### Supporting (shadcn/ui-Komponenten — alle bereits in `src/components/ui/`)
| Component | Verified Path | Used For |
|-----------|---------------|----------|
| `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage` | `src/components/ui/form.tsx` | Formular-Wrapper für Metadaten [VERIFIED] |
| `Input` | `src/components/ui/input.tsx` | Bezeichnung, Teilenummer, Projekt [VERIFIED] |
| `Select`, `SelectTrigger`, `SelectContent`, `SelectItem` | `src/components/ui/select.tsx` | Status-Auswahl [VERIFIED] |
| `Button` | `src/components/ui/button.tsx` | Submit + Reset [VERIFIED] |
| `Badge` | `src/components/ui/badge.tsx` | Status-Anzeige [VERIFIED] |
| `Alert`, `AlertDescription` | `src/components/ui/alert.tsx` | Inline Duplikat-/Netzwerkfehler [VERIFIED] |
| `Progress` | `src/components/ui/progress.tsx` | Upload-Progress (XHR `progress`-Event) [VERIFIED] |
| `Skeleton` | `src/components/ui/skeleton.tsx` | Thumbnail-Platzhalter [VERIFIED] |
| `Card`, `CardHeader`, `CardTitle`, `CardContent` | `src/components/ui/card.tsx` | Container für 2-Spalten-Layout [VERIFIED] |
| `Label` | `src/components/ui/label.tsx` | File-Input-Label (außerhalb Form) [VERIFIED] |

### Alternatives Considered
| Instead of | Could Use | Why Not Used |
|------------|-----------|--------------|
| `XMLHttpRequest` für S3-PUT | `fetch` mit `ReadableStream` + Progress-Tracking | `fetch` hat KEINEN nativen Upload-Progress; nur Download. Für PUT-Progress ist XHR Pflicht. [CITED: MDN — fetch Standard, kein upload progress] |
| Custom Hook `usePartStatus` | Inline `useEffect` in `UploadForm.tsx` | Hook isoliert: Cleanup-Logik, Test-Isolation, wiederverwendbar in Phase 5 (Admin-Katalog für Status-Anzeige). |
| react-hook-form für File-Input | Uncontrolled `useRef<HTMLInputElement>` für File | File-Inputs sind in React generell uncontrolled [CITED: react-hook-form discussions]. Mischbetrieb: react-hook-form für Text-Felder + manuelle File-Validation in `onSubmit`. |
| `crypto.subtle.digest` | Library wie `js-sha256` | `crypto.subtle` ist nativ, kein Bundle-Bloat. 100 MB liest komplett in Memory ein — akzeptabel für Desktop-Browser, kein Streaming nötig. [CITED: MDN SubtleCrypto] |
| Polling | Server-Sent Events / WebSocket / Supabase Realtime | Polling ist explizit von User entschieden (D-04). Realtime ist out-of-scope für v1. |
| Next.js `Image`-Komponente für Thumbnail | Plain `<img>` | Presigned S3 URLs sind dynamisch + 60s gültig — `next/image`-Optimization-Pipeline bringt keinen Mehrwert und benötigt remote-pattern-Konfiguration. UI-SPEC schreibt explizit `<img>` vor. |

**Installation:** Keine. Alle Dependencies bereits vorhanden. [VERIFIED: package.json gelesen]

**Version verification (Stand: 2026-05-08):**
- next ^16.1.1 — verifiziert in `package.json` (kein neuerer Major in Phase 3 erforderlich gewesen)
- react-hook-form ^7.71.1 — verifiziert in `package.json`
- zod ^4.3.5 — verifiziert in `package.json` (Zod 4 ist current major)
- @aws-sdk ^3.1045.0 — verifiziert in `package.json`

## Architecture Patterns

### System Architecture Diagram

```
                ┌─────────────────────────────────────────────────────┐
                │  Browser (Client Component "use client")            │
                │                                                      │
                │  UploadForm.tsx                                     │
                │   ├─ react-hook-form (Bezeichnung/Teil#/Projekt)   │
                │   ├─ ref-File-Input (uncontrolled, manual validate)│
                │   └─ usePartStatus(partId) ← Polling-Hook          │
                └────┬─────────────┬──────────────┬─────────┬─────────┘
                     │             │              │         │
                     │ ① POST /api/upload/init    │         │ ④ GET /api/parts/[id]/status
                     │   (sha256+meta)             │         │   (alle 2s/5s)
                     │             │              │         │
                     ▼             │              │         │ ⑤ GET /api/parts/[id]/thumbnail
              ┌──────────────┐    │              │         │   (1× nach ready)
              │ /api/upload/ │    │              │         │
              │ init         │    │ ② PUT direct │         ▼
              │ (existing)   │    │   to S3      │   ┌────────────────────┐
              └──────┬───────┘    │   via XHR    │   │ /api/parts/[id]/   │
                     │            │   + progress │   │ status  (NEW)      │
                     │            ▼              │   │  → SELECT status   │
                     │      ┌──────────┐         │   │      FROM parts    │
                     │      │ S3       │         │   └────────────────────┘
                     │      │ parts-   │         │   ┌────────────────────┐
                     │      │ steps    │         │   │ /api/parts/[id]/   │
                     │      │ (private)│         │   │ thumbnail (NEW)    │
                     │      └──────────┘         │   │  → presigned URL   │
                     │                            │   │     für view_0.png │
                     │            ③ POST /api/upload/confirm           ───┤
                     ▼                            │                        │
              ┌──────────────┐                   │                        ▼
              │ Neon DB      │◄──────────────────┘                ┌──────────┐
              │ parts table  │                                    │ S3       │
              │  status:     │                                    │ parts-   │
              │  pending →   │                                    │ thumbs   │
              │  processing →│         ┌─────────────┐            └──────────┘
              │  ready/failed│◄────────┤ Worker      │
              └──────────────┘         │ (Phase 3)   │
                                       └─────────────┘
```

**Datenfluss in einem Upload-Cycle:**
1. User wählt Datei → Browser berechnet SHA-256 (`crypto.subtle`)
2. POST `/api/upload/init` mit `{name, sha256, original_filename, file_size_bytes, ...}` → Response: `{part_id, presigned_url}` (oder 409 mit `existing_part_id`)
3. PUT `{presigned_url}` mit File-Body via **XMLHttpRequest** (für progress events) → S3 lädt direkt
4. POST `/api/upload/confirm` mit `{part_id}` → 202; Worker enqueued
5. **Polling startet:** GET `/api/parts/[id]/status` alle 2s (erste 30s) → 5s (danach), bis `status === 'ready'` oder `'failed'`
6. Bei `ready`: GET `/api/parts/[id]/thumbnail` → `{url}` → `<img src={url}>` rendern

### Recommended Project Structure
```
src/
├── app/
│   ├── page.tsx                      # MODIFY: minimaler "Teil hochladen"-Link (D-02)
│   ├── upload/
│   │   ├── page.tsx                  # NEW: Server Component, Page-Title
│   │   ├── UploadForm.tsx            # NEW: "use client", Haupt-Logik
│   │   └── UploadForm.test.tsx       # NEW (optional): Component-Test mit Vitest
│   └── api/
│       └── parts/
│           └── [id]/
│               ├── status/
│               │   ├── route.ts      # NEW: GET /api/parts/[id]/status
│               │   └── route.test.ts # NEW: Vitest mock-tests
│               └── thumbnail/
│                   ├── route.ts      # NEW: GET /api/parts/[id]/thumbnail
│                   └── route.test.ts # NEW: Vitest mock-tests
├── hooks/
│   ├── use-part-status.ts            # NEW: Polling-Hook
│   └── use-part-status.test.ts       # NEW: Hook-Test mit fake timers
└── lib/
    └── (no changes — db/s3 already exist)
```

### Pattern 1: Upload-Form als Client Component mit Phasen-State-Machine

**What:** Eine einzige `"use client"`-Komponente kapselt den gesamten Upload-Flow als endlicher Zustandsautomat.

**When to use:** Multi-Step-Operations (hier: 5 sequenzielle Schritte) mit shared state, die nicht durch Suspense/Server Actions abdeckbar sind, weil sie clientseitige APIs (`crypto.subtle`, XHR) brauchen.

**State-Modell:**
```typescript
type UploadPhase =
  | 'idle'            // Formular leer, Submit-Button enabled
  | 'hashing'         // SHA-256-Berechnung läuft
  | 'initializing'    // POST /api/upload/init läuft
  | 'uploading'       // PUT zu S3 läuft (mit progress 0-100)
  | 'confirming'      // POST /api/upload/confirm läuft
  | 'polling'         // usePartStatus aktiv (D-04)
  | 'ready'           // status='ready', Thumbnail laden
  | 'failed'          // status='failed' (DB) oder Polling-Timeout
  | 'duplicate'       // 409 von init, Form bleibt editierbar (D-11)
  | 'error'           // Netzwerk-/Upload-Fehler
```

**Übergangsregeln** (entscheidend für Plan-Tasks):
- `idle → hashing → initializing`: Nach Submit-Click
- `initializing → duplicate`: Bei HTTP 409 — Form bleibt enabled, Status-Tracker nicht zeigen
- `initializing → uploading`: Bei 200 mit presigned_url; Status-Tracker einblenden, Form-Disable (D-09)
- `uploading → confirming`: Bei XHR `load`-Event mit Status 200/204
- `confirming → polling`: Bei HTTP 202; Hook startet
- `polling → ready`: Wenn Hook `status === 'ready'` zurückgibt → Thumbnail-Fetch
- `polling → failed`: Wenn Hook `status === 'failed'` ODER 5min Timeout
- `ready → idle` (durch "Neuer Upload"-Button D-10): `react-hook-form.reset()`, File-Input clearen, Status-Tracker ausblenden

**Example structure:**
```typescript
// src/app/upload/UploadForm.tsx
'use client'

import { useState, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { usePartStatus } from '@/hooks/use-part-status'
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { AlertCircle, Loader2, Upload, CheckCircle2, XCircle, RefreshCw } from 'lucide-react'

const formSchema = z.object({
  name: z.string().min(1, 'Bezeichnung ist erforderlich.').max(200),
  partNumber: z.string().max(100).optional(),
  project: z.string().max(200).optional(),
  status: z.enum(['pending', 'processing', 'ready', 'failed']).default('pending'),
})

type FormValues = z.infer<typeof formSchema>

export function UploadForm() {
  const [phase, setPhase] = useState<UploadPhase>('idle')
  const [partId, setPartId] = useState<string | null>(null)
  const [uploadPercent, setUploadPercent] = useState(0)
  const [duplicateId, setDuplicateId] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: '', partNumber: '', project: '', status: 'pending' },
  })

  // Hook startet polling SOBALD partId gesetzt UND phase === 'polling' (Hook entscheidet intern)
  const { status: polledStatus, error: pollError, timedOut } = usePartStatus(
    phase === 'polling' || phase === 'ready' ? partId : null
  )

  // Reaktion auf polledStatus
  useEffect(() => {
    if (polledStatus === 'ready' && phase === 'polling') {
      setPhase('ready')
      // Thumbnail fetchen
      fetch(`/api/parts/${partId}/thumbnail`)
        .then(r => r.json())
        .then(({ url }) => setThumbnailUrl(url))
        .catch(() => { /* deferred error handling per UI-SPEC */ })
    }
    if (polledStatus === 'failed' && phase === 'polling') {
      setPhase('failed')
    }
    if (timedOut) setPhase('failed')
  }, [polledStatus, phase, partId, timedOut])

  // ... onSubmit, reset, render
}
```

### Pattern 2: `usePartStatus` Custom Hook mit variablem Polling-Intervall

**What:** Hook abstrahiert das gesamte Polling-Verhalten: zwei Intervalle, Timeout, Stop-Bedingungen, Cleanup.

**When to use:** Hier zwingend (D-04 gibt komplexe Polling-Regeln vor); auch in Phase 5 (Admin-Katalog) wiederverwendbar.

**Signatur:**
```typescript
type PartStatus = 'pending' | 'processing' | 'ready' | 'failed'

interface UsePartStatusResult {
  status: PartStatus | null   // null bis erste Antwort
  thumbnailCount: number
  error: Error | null         // nur nach 3 konsekutiven Fehlern (UI-SPEC)
  timedOut: boolean           // nach 5 Min ohne ready/failed
}

export function usePartStatus(partId: string | null): UsePartStatusResult
```

**Implementierungs-Regeln (kritisch):**
- **Hook deaktiviert sich automatisch bei `partId === null`** (kein Polling, kein Cleanup-Issue beim Reset)
- **Variables Intervall:** Erste 30s `setInterval(2000)`, dann **clearInterval** + `setInterval(5000)` — über `Date.now()`-Tracking statt zweier separater Effects
- **Stop-Bedingung:** Wenn `data.status === 'ready' || data.status === 'failed'` → `clearInterval` + setze internen finalen Status; danach **kein erneutes Fetch** (auch wenn Effect re-runs)
- **Timeout:** `setTimeout(5 * 60 * 1000)` parallel zum Interval. Bei Trigger: `clearInterval` + `setTimedOut(true)`
- **Fehler-Schwellwert (UI-SPEC):** Counter für konsekutive Fetch-Failures. Reset auf 0 bei jedem Erfolg. Erst bei `failures >= 3` `setError(...)` aufrufen. Polling läuft trotzdem weiter.
- **Cleanup:** Im `useEffect`-Return ALLE Timer clearen (interval + timeout). Wenn `partId` zu `null` wechselt → State zurücksetzen (`setStatus(null)`).
- **AbortController:** Jeder Fetch bekommt einen Controller; bei Cleanup oder neuem Tick wird der vorige Request abgebrochen, um Race-Conditions zwischen langsamen Responses und neuem Status zu vermeiden.

**Example:**
```typescript
// src/hooks/use-part-status.ts
'use client'
import { useEffect, useRef, useState } from 'react'

type PartStatus = 'pending' | 'processing' | 'ready' | 'failed'
const FAST_INTERVAL_MS = 2_000
const SLOW_INTERVAL_MS = 5_000
const FAST_PHASE_DURATION_MS = 30_000
const TIMEOUT_MS = 5 * 60 * 1_000
const FAILURE_THRESHOLD = 3

export function usePartStatus(partId: string | null) {
  const [status, setStatus] = useState<PartStatus | null>(null)
  const [thumbnailCount, setThumbnailCount] = useState(0)
  const [error, setError] = useState<Error | null>(null)
  const [timedOut, setTimedOut] = useState(false)
  const failuresRef = useRef(0)
  const startedAtRef = useRef<number | null>(null)

  useEffect(() => {
    if (!partId) {
      setStatus(null); setError(null); setTimedOut(false)
      failuresRef.current = 0
      return
    }

    startedAtRef.current = Date.now()
    let intervalId: ReturnType<typeof setInterval> | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null
    let stopped = false
    const controller = new AbortController()

    const fetchStatus = async () => {
      try {
        const res = await fetch(`/api/parts/${partId}/status`, { signal: controller.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json() as { status: PartStatus; thumbnail_count: number }
        failuresRef.current = 0
        setError(null)
        setStatus(data.status)
        setThumbnailCount(data.thumbnail_count)
        if (data.status === 'ready' || data.status === 'failed') {
          stopped = true
          if (intervalId) clearInterval(intervalId)
          if (timeoutId) clearTimeout(timeoutId)
        }
      } catch (e) {
        if (controller.signal.aborted) return
        failuresRef.current += 1
        if (failuresRef.current >= FAILURE_THRESHOLD) setError(e as Error)
      }
    }

    // Initial-Fetch sofort
    fetchStatus()

    // Phase 1: schnelles Intervall
    intervalId = setInterval(() => {
      if (stopped) return
      const elapsed = Date.now() - (startedAtRef.current ?? Date.now())
      // Wechsel zu langsamem Intervall nach 30s
      if (elapsed >= FAST_PHASE_DURATION_MS && intervalId) {
        clearInterval(intervalId)
        intervalId = setInterval(fetchStatus, SLOW_INTERVAL_MS)
      }
      fetchStatus()
    }, FAST_INTERVAL_MS)

    // Timeout nach 5 Min
    timeoutId = setTimeout(() => {
      stopped = true
      setTimedOut(true)
      if (intervalId) clearInterval(intervalId)
    }, TIMEOUT_MS)

    return () => {
      controller.abort()
      if (intervalId) clearInterval(intervalId)
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [partId])

  return { status, thumbnailCount, error, timedOut }
}
```

### Pattern 3: Direct-to-S3 PUT mit XMLHttpRequest für Progress Events

**What:** XHR statt `fetch`, weil **`fetch` keinen Upload-Progress unterstützt** (nur Download). [VERIFIED: MDN — Fetch API hat kein `onprogress` für Request-Body]

**When to use:** Bei jedem Direct-to-Storage-Upload, wo ein Progress-Indikator gewünscht ist.

**Pattern:**
```typescript
function uploadToS3(presignedUrl: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', presignedUrl, true)
    // KEIN Content-Type-Header setzen — würde Signatur ungültig machen
    // (init-route hat ContentType bewusst NICHT in signableHeaders, siehe init/route.ts Pitfall-Kommentar)
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress((e.loaded / e.total) * 100)
    })
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`S3 PUT failed: HTTP ${xhr.status}`))
    })
    xhr.addEventListener('error', () => reject(new Error('Network error during S3 upload')))
    xhr.addEventListener('abort', () => reject(new Error('Upload aborted')))
    xhr.send(file)
  })
}
```

**Kritisch (aus Phase 3 Init-Route lernend):** Der Init-Endpoint signiert den Presigned URL mit `ContentType: 'application/octet-stream'`, jedoch **ohne** Content-Type in `signableHeaders`. Das bedeutet: Der Browser darf KEINEN `Content-Type`-Header beim PUT setzen — sonst Signatur-Mismatch. `xhr.setRequestHeader('Content-Type', ...)` weglassen. Bestätigt durch Kommentar in `src/app/api/upload/init/route.ts:75–77`.

### Pattern 4: SHA-256 im Browser via Web Crypto

**What:** Native Browser-API `crypto.subtle.digest('SHA-256', ArrayBuffer)`.

**Constraint (verifiziert):** Web Crypto API unterstützt **kein Streaming** — die gesamte Datei muss als ArrayBuffer in Memory geladen werden. [CITED: MDN SubtleCrypto.digest]

**Trade-off:** Bei 100 MB max-Filesize ist das auf Desktop unproblematisch (~100 MB RAM kurzfristig). Mobile/iOS-Browser könnten bei 100 MB an Memory-Limits stoßen — aber diese App ist explizit Desktop-fokussiert (Search-Workflow auf Mobil ist Phase 7).

**Pattern:**
```typescript
async function sha256OfFile(file: File): Promise<string> {
  const buffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
```

### Pattern 5: react-hook-form mit File-Input (mixed: controlled fields + uncontrolled file)

**What:** File-Inputs sind in React **immer** uncontrolled (Browser-Sicherheit). [CITED: react-hook-form discussions #1946 + #4665]

**Pattern (verifiziert in shadcn-Form-Beispielen):**
- Text-Felder über react-hook-form mit `Form` + `FormField` + `FormControl` (wie in der bestehenden `form.tsx`)
- File-Input außerhalb von `Form` als plain `<input type="file" ref={fileInputRef} />` mit shadcn `<Label>`
- Validierung im Submit-Handler (vor `init`-Call):
  - Datei vorhanden? `if (!fileInputRef.current?.files?.[0]) → Fehler "Bitte eine STEP-Datei auswählen."`
  - Größe: `if (file.size > 100 * 1024 * 1024) → "Datei überschreitet 100 MB."`
  - Endung: `if (!/\.(step|stp)$/i.test(file.name)) → "Nur STEP-Dateien (.step, .stp) werden akzeptiert."`
- Fehler-Anzeige: lokaler `useState<string | null>` für File-Errors, gerendert direkt unter `<input>` (NICHT via `FormMessage`, da File außerhalb des Form-Contexts)

### Anti-Patterns to Avoid

- **`fetch` für S3-PUT:** Würde funktionieren, aber Progress-Events fehlen → User-Erfahrung schlecht. XHR ist das richtige Werkzeug.
- **Setzen eines Content-Type-Headers beim PUT:** Bricht die Presigned-URL-Signatur. Existierender init-Code-Kommentar warnt explizit.
- **Polling ohne Cleanup:** `setInterval` ohne Return-Cleanup verursacht Memory-Leaks und Multiple-Fetches bei Re-Renders. Pflicht: Return-Function in `useEffect` clearen alles.
- **`router.push('/upload')` für Reset:** Statt das Form-State zu reset (D-10) — würde unnötigen Re-Mount triggern. `react-hook-form.reset()` + `setPhase('idle')` ist der saubere Weg.
- **Server Component für `UploadForm`:** Hooks (`useState`, `useEffect`, `useForm`) gehen NICHT in Server Components. `"use client"` ist Pflicht.
- **`<img>`-Caching nicht beachtet:** Presigned URLs sind 60s gültig. Wenn der Browser das `<img>` aus seinem Cache lädt, ist das ok; wird die URL aber zwischengelagert (z.B. in localStorage) und später wiederverwendet → 403. Lösung: Nicht persistent speichern, immer aus Hook-State.
- **`crypto.subtle.digest` ohne HTTPS:** Web Crypto ist **nur in Secure Contexts** (HTTPS oder localhost) verfügbar. Lokales Development auf `localhost:3000` funktioniert; Vercel-Deployments sind immer HTTPS. Trotzdem im Plan eine Verify-Step für `window.isSecureContext` einplanen.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Form-State + Validation | Custom `useState` für jedes Feld + manuelle Error-Tracking | `react-hook-form` + `zodResolver` (bereits installed) | Field-level errors, dirty-state, reset, type-inference — kommt out-of-the-box |
| Schema-Validation Client+Server | Manuelle If-Checks | Zod-Schema einmal definiert, beidseitig nutzbar | DRY; Server-Schema in `init/route.ts` ist bereits Vorbild |
| Status-Badge mit Variants | Eigene `<div>`-Hierarchie | shadcn `<Badge>` mit `variant` (UI-SPEC mappt Status→variant) | Alle Tokens, Focus-Ring, Accessibility schon dabei |
| Progress-Bar | `<div>` mit `style={{width: pct}}` | shadcn `<Progress value={pct} />` (Radix) | Accessible, animiert |
| File-Upload mit Progress | Library wie `axios` | XMLHttpRequest direkt (nativ) | Eine Library weniger; XHR funktioniert seit 1999 stabil |
| Hash-Berechnung | `js-sha256` o.ä. | `crypto.subtle.digest` (nativ) | Web-Standard, Bundle-frei |
| UUID-Validation in Routes | Regex inline | Zod `z.string().uuid()` (bereits in `confirm/route.ts` als Vorbild) | Konsistent zur bestehenden Codebase |
| Toast-System | Eigene Render-Logik | `src/hooks/use-toast.ts` (bereits da) — **aber laut D-11 KEIN Toast für Duplikat**; Inline-Alert | UI-SPEC schreibt Verhalten exakt vor |

**Key insight:** Phase 4 ist eine **reine Compositions-Phase** — alle benötigten Bibliotheken und shadcn-Komponenten existieren. Es sollte kein einziger Plan eine neue Dependency installieren oder eine eigene UI-Primitive bauen.

## Common Pitfalls

### Pitfall 1: Next.js 16 dynamic route `params` ist ein Promise
**What goes wrong:** Code wie `params.id` ohne `await` → TypeScript-Fehler oder Runtime-Warning.
**Why it happens:** In Next.js 14 war `params` synchron; ab Next.js 15+ ist es ein Promise. [VERIFIED: Next.js docs + `package.json` zeigt next@^16.1.1]
**How to avoid:** Signatur **immer** als `{ params: Promise<{ id: string }> }` typen und `await params` direkt am Anfang des Handlers.
**Warning signs:** TypeScript-Error "Property 'id' does not exist on type 'Promise<...>'", oder Console-Warning "params should be awaited".

```typescript
// ✓ Korrekt für Next.js 16
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  // ...
}
```

### Pitfall 2: Polling läuft nach Component-Unmount weiter
**What goes wrong:** User navigiert weg, Hook-Component unmounted, aber `setInterval` läuft weiter und feuert `setState` auf einer toten Komponente → React-Warning, Memory-Leak.
**Why it happens:** Cleanup-Function im `useEffect` vergessen.
**How to avoid:** `useEffect` MUSS eine Cleanup-Function returnieren, die `clearInterval`, `clearTimeout` und `controller.abort()` aufruft. Außerdem `partId === null` als Reset-Trigger nutzen.
**Warning signs:** Console-Warning "Can't perform a React state update on an unmounted component", Network-Tab zeigt anhaltende Requests nach Page-Navigation.

### Pitfall 3: SHA-256-Berechnung blockiert Main-Thread
**What goes wrong:** `crypto.subtle.digest` auf 100 MB Datei → ~500-2000ms Main-Thread-Block → UI eingefroren, Loading-Spinner ruckelt.
**Why it happens:** `crypto.subtle.digest` läuft im Main-Thread (kein Web-Worker by default).
**How to avoid:** Vor dem `await file.arrayBuffer()` einen UI-Phase-Wechsel auf `'hashing'` setzen (zeigt Spinner/disabled-State), damit der User weiß, dass etwas passiert. Optional (out-of-scope für Phase 4): SHA-256 in einen Web Worker auslagern. Phase 10 (Hardening) kann das adressieren.
**Warning signs:** Lighthouse-Metrik "Long Task" auf der Upload-Page; User-Reports "Browser hängt nach Datei-Klick".

### Pitfall 4: `Content-Type` beim PUT zerstört Presigned-URL-Signatur
**What goes wrong:** XHR sendet bei `xhr.send(file)` automatisch `Content-Type: application/octet-stream` ODER der Entwickler setzt manuell `xhr.setRequestHeader('Content-Type', file.type)` → S3 antwortet mit 403 SignatureDoesNotMatch.
**Why it happens:** Der Init-Endpoint signiert mit `ContentType: 'application/octet-stream'`, aber Content-Type ist explizit NICHT in `signableHeaders` aufgenommen (siehe Kommentar in `init/route.ts:75–77`). Manche Browser senden den Header trotzdem.
**How to avoid:** **Keinen** `Content-Type` über `setRequestHeader` setzen. XHR + Blob-Body sendet ohnehin `application/octet-stream` als Default — was zur Signatur passt. Falls 403 trotzdem auftritt: Bei Phase-Spike testen und ggf. `signableHeaders` in init-route anpassen (Cross-Phase-Concern, im Plan dokumentieren).
**Warning signs:** S3-PUT antwortet mit XML-Body `<Code>SignatureDoesNotMatch</Code>` und HTTP 403.

### Pitfall 5: Race Condition zwischen schnellem Status-Wechsel und Thumbnail-Fetch
**What goes wrong:** Worker setzt `status='ready'` + Thumbnail-Upload abgeschlossen, aber Hook hat letztes Polling-Tick noch nicht erreicht. ODER: Hook fetched `/status`, bekommt 'ready' zurück, fetcht `/thumbnail`, aber Worker hatte zwar `parts.status='ready'` gesetzt aber das Thumbnail-Upload zu S3 ist noch nicht fertig (extreme race).
**Why it happens:** `parts.status='ready'` ist ein DB-Write; Thumbnail-Existenz in S3 ist unabhängig.
**How to avoid:** `GET /api/parts/[id]/thumbnail` sollte das Existieren des `view_0.png`-Objekts via `HeadObjectCommand` validieren BEVOR der Presigned URL signiert wird. Bei 404: Response `{error: 'thumbnail_not_ready', retry: true}` → UI kann nach 1-2s erneut versuchen ODER (einfacher, per UI-SPEC akzeptiert) Skeleton zeigt einen "Lädt..."-Zustand. UI-SPEC sagt explizit: "No fallback if thumbnail fetch fails in Phase 4 (deferred to Phase 10 Hardening)" — also reicht ein einfaches Failure-Loglevel + Skeleton bleibt visible.
**Warning signs:** Sporadische 404 von S3 bei Thumbnail-Render; Skeleton zeigt sich für >2s.

### Pitfall 6: Status-Tracker zeigt "Bereit" bevor Thumbnail geladen ist
**What goes wrong:** Polling ergibt `'ready'`, Status-Badge wechselt sofort zu "Bereit", aber Thumbnail braucht noch 200-500ms zum Laden → User sieht für kurze Zeit ein leeres Skeleton-Feld neben "Bereit"-Badge.
**Why it happens:** Status-Update und Thumbnail-Fetch sind separate async-Operationen.
**How to avoid:** UI-SPEC akzeptiert das ("Verarbeitung abgeschlossen. Vorschau wird geladen..."): Status-Description-Text bei `ready` zeigt "Vorschau wird geladen..." bis `thumbnailUrl !== null`. Der "Neuer Upload"-Button erscheint laut UI-SPEC erst NACH dem Thumbnail-Load (Step 9 in Interaction Contract).
**Warning signs:** Reset-Button zu früh klickbar; "leeres" Status-Tracker-Card zwischen Badge und Description.

### Pitfall 7: Doppel-Submit bei langsamem Klick
**What goes wrong:** User klickt Submit zweimal schnell hintereinander → zwei `init`-Requests → zweite bekommt 409 (Duplikat zu erstem) → verwirrender Fehler.
**Why it happens:** Submit-Button nicht sofort disabled.
**How to avoid:** Beim Form-Submit als ALLERERSTE Aktion `setPhase('hashing')` und `<Button disabled={phase !== 'idle'}>` verwenden. react-hook-form bietet zusätzlich `formState.isSubmitting` als Schutz.
**Warning signs:** Doppelte Init-Logs im Server; gelegentlich 409 trotz frischer Datei.

## Code Examples

Verified patterns from official sources and existing codebase:

### Pattern: GET /api/parts/[id]/status Route (NEW)

```typescript
// src/app/api/parts/[id]/status/route.ts
// GET /api/parts/[id]/status — D-05
// Liest aus parts-Tabelle. KEIN Worker-Touch.
// Server-only — KEIN "use client".

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'

const ParamsSchema = z.object({
  id: z.string().uuid('id muss eine gültige UUID sein'),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }   // Next.js 16: Promise!
): Promise<NextResponse> {
  const { id } = await params

  const parsed = ParamsSchema.safeParse({ id })
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 })
  }

  const rows = await db`
    SELECT status, thumbnail_count
    FROM parts
    WHERE id = ${id}
    LIMIT 1
  `
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Part not found' }, { status: 404 })
  }

  return NextResponse.json({
    status: rows[0].status,            // 'pending' | 'processing' | 'ready' | 'failed'
    thumbnail_count: rows[0].thumbnail_count ?? 0,
  })
}
```

> **DB-Schema-Annahme:** Die Spalte `thumbnail_count` muss in der `parts`-Tabelle existieren. **Source: 04-CONTEXT.md D-05 + 04-UI-SPEC.md "GET /api/parts/[id]/status" sagt: `{ status, thumbnail_count }`.** Migration aus Phase 1 (`supabase/migrations/001_parts_schema.sql`) sollte diese Spalte haben — falls nicht, ist eine kleine Schema-Migration in Wave 0 nötig. Der Planner muss dies im Plan-Check prüfen [ASSUMED].

### Pattern: GET /api/parts/[id]/thumbnail Route (NEW)

```typescript
// src/app/api/parts/[id]/thumbnail/route.ts
// GET /api/parts/[id]/thumbnail — D-08
// Erzeugt 60-Sekunden-Presigned-URL für view_0.png.
// Server-only.

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { db } from '@/lib/db'
import { s3, BUCKET_THUMBNAILS } from '@/lib/s3'

const ParamsSchema = z.object({
  id: z.string().uuid(),
})

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const { id } = await params
  const parsed = ParamsSchema.safeParse({ id })
  if (!parsed.success) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  // Verifiziere dass part existiert + status='ready'
  const rows = await db`SELECT status FROM parts WHERE id = ${id} LIMIT 1`
  if (rows.length === 0) return NextResponse.json({ error: 'Part not found' }, { status: 404 })
  if (rows[0].status !== 'ready') {
    return NextResponse.json({ error: 'Thumbnail not ready' }, { status: 409 })
  }

  const key = `${id}/view_0.png`

  // Optional: HeadObject prüft Existenz BEVOR signiert wird (vermeidet 404 nach Klick)
  try {
    await s3.send(new HeadObjectCommand({ Bucket: BUCKET_THUMBNAILS, Key: key }))
  } catch {
    return NextResponse.json({ error: 'Thumbnail object missing' }, { status: 404 })
  }

  const url = await getSignedUrl(
    s3,
    new GetObjectCommand({ Bucket: BUCKET_THUMBNAILS, Key: key }),
    { expiresIn: 60 }
  )

  return NextResponse.json({ url })
}
```

### Pattern: Submit-Handler im UploadForm

```typescript
// In UploadForm.tsx, innerhalb der Komponente:

const onSubmit = async (values: FormValues) => {
  // 1. File-Validation
  const file = fileInputRef.current?.files?.[0]
  if (!file) { setFileError('Bitte eine STEP-Datei auswählen.'); return }
  if (file.size > 100 * 1024 * 1024) { setFileError('Datei überschreitet die maximale Größe von 100 MB.'); return }
  if (!/\.(step|stp)$/i.test(file.name)) { setFileError('Nur STEP-Dateien (.step, .stp) werden akzeptiert.'); return }
  setFileError(null)
  setDuplicateId(null)
  setErrorMsg(null)

  try {
    // 2. SHA-256
    setPhase('hashing')
    const sha256 = await sha256OfFile(file)

    // 3. Init
    setPhase('initializing')
    const initRes = await fetch('/api/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: values.name,
        sha256,
        original_filename: file.name,
        file_size_bytes: file.size,
        part_number: values.partNumber || undefined,
        project: values.project || undefined,
      }),
    })

    if (initRes.status === 409) {
      const data = await initRes.json()
      setDuplicateId(data.existing_part_id)
      setPhase('duplicate')   // Form bleibt enabled (D-11)
      return
    }
    if (!initRes.ok) throw new Error('Init failed')
    const { part_id, presigned_url } = await initRes.json()
    setPartId(part_id)

    // 4. S3-PUT
    setPhase('uploading')
    setUploadPercent(0)
    await uploadToS3(presigned_url, file, setUploadPercent)

    // 5. Confirm
    setPhase('confirming')
    const confirmRes = await fetch('/api/upload/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ part_id }),
    })
    if (!confirmRes.ok) throw new Error('Confirm failed')

    // 6. Polling startet (Hook reaktiviert sich durch partId-Setting + phase==='polling')
    setPhase('polling')
  } catch (e) {
    setErrorMsg('Upload fehlgeschlagen. Bitte Verbindung prüfen und erneut versuchen.')
    setPhase('error')
  }
}
```

### Pattern: Reset-Handler für "Neuer Upload" (D-10)

```typescript
const handleReset = () => {
  form.reset({ name: '', partNumber: '', project: '', status: 'pending' })
  if (fileInputRef.current) fileInputRef.current.value = ''
  setPartId(null)              // Triggert Hook-Cleanup automatisch
  setPhase('idle')
  setUploadPercent(0)
  setDuplicateId(null)
  setErrorMsg(null)
  setThumbnailUrl(null)
  setFileError(null)
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `params: { id: string }` (sync) | `params: Promise<{ id: string }>` (async) | Next.js 15 (2024) | Pflicht `await params` in allen dynamic Route-Handlers |
| `axios` für Upload | XHR oder `fetch` direkt | Seit fetch-API stable; XHR seit IE7 | Keine Library-Dependency; 0 Bundle-Bloat |
| Supabase Realtime für Status-Updates | Polling (D-04 user-Entscheidung) | n/a | Realtime hätte less-traffic-Vorteil; Polling ist robuster und einfacher zu debuggen, ausreichend für Internal-Tool |
| `react-hook-form` v6 | v7 (current) | 2021 | API-Vorhandlung ohne `Controller`-Wrapper für native Inputs (`register`-basiert) |
| Zod v3 | Zod v4 (current) | 2024 | `z.enum([...])` ohne `as const` nötig; bessere TS-Types |

**Deprecated/outdated:**
- IVFFlat als pgvector-Index — durch HNSW ersetzt (Phase 1 Decision, nicht Phase 4 relevant, aber STATE.md erwähnt)
- `getServerSideProps` / Pages Router — durch App Router (Phase 4 ist App Router native)

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `parts.thumbnail_count`-Spalte existiert in der DB-Schema | Code Examples (Status Route) | Plan-Check / Wave-0-Task muss Migration einplanen falls Spalte fehlt. Im Worst Case: Status-Endpoint gibt nur `status` zurück, UI ignoriert `thumbnail_count` (das Feld wird in Phase 4 ohnehin nicht gerendert — UI-SPEC zeigt nur 1 Thumbnail). Niedriges Risiko. | [ASSUMED] |
| A2 | S3-Object-Key für Thumbnails ist `{part_id}/view_0.png` (Bucket: `parts-thumbnails`) | Code Examples (Thumbnail Route) | Falls Worker (Phase 3) andere Pfad-Konvention nutzt → 404. Verifizierbar via STATE.md "PNG-Pfadkonvention: view_0..view_7.png" (locked decision) und `src/lib/s3.ts` (`BUCKET_THUMBNAILS` env var). Mittleres Risiko — Plan sollte ein Test-Task einplanen, das die Pfad-Konvention via S3 listObjects bestätigt. | [VERIFIED via STATE.md decision: "PNG-Pfadkonvention: view_0..view_7.png"] |
| A3 | Browser-SHA-256 bei 100 MB Files ist akzeptabel performant auf Desktop | Pitfall 3 | User-Erfahrung: 0.5–2s "frozen UI" während Hashing. Mitigation: Phase-Wechsel auf 'hashing' zeigt Spinner. Out-of-Scope für Phase 4 wäre Web-Worker-Auslagerung (Phase 10 Hardening). Niedriges Risiko. | [ASSUMED] |
| A4 | Vercel-Deployment unterstützt 60s+ Request-Lifetime für Status-Polling-Route | Architecture | Status-Route ist sehr leichtgewichtig (single SELECT) — sollte jederzeit unter 1s antworten. Vercel default Hobby-Limit 10s, Pro 60s — beides mehr als genug. Niedriges Risiko. | [ASSUMED] |
| A5 | UI-SPEC schreibt vor, dass `thumbnail_count` nicht in der UI gerendert wird (nur als Implementierungs-Detail im Status-Response) | Code Examples (Status Route) | Wenn der Planner doch `thumbnail_count` rendern will, ist die DB-Migration (A1) blockierend. Trace-Verifikation: 04-UI-SPEC.md Status-Tracker rendert nur `status` als Badge + Description — `thumbnail_count` wird nicht angezeigt. | [VERIFIED via UI-SPEC.md] |

## Open Questions (RESOLVED)

> Alle Open Questions wurden zu Plan-Entscheidungen aufgelöst. Diese Section dokumentiert die Resolution; sie ist für Implementierende verbindlich.

1. **Existiert `thumbnail_count` in `parts`-Tabelle?** — **RESOLVED**
   - Resolution: Plan 01 (Wave 0) erstellt die Migration `supabase/migrations/002_add_thumbnail_count.sql` mit `ALTER TABLE parts ADD COLUMN IF NOT EXISTS thumbnail_count INT NOT NULL DEFAULT 0` als BLOCKING-Wave-0-Task. Damit ist die Spalte vor Wave 1 (Status-Route) garantiert vorhanden. Worker-seitiges Befüllen ist Cross-Phase-Concern (Phase 3 / Phase 5); in Phase 4 reicht der Default 0, da die UI `thumbnail_count` nicht rendert (UI-SPEC zeigt nur 1 Thumbnail, gefetcht via separater Thumbnail-Route).

2. **Soll der Init-Request `status` aus dem Form übernehmen?** — **RESOLVED (Option a — Field entfernen)**
   - Resolution: Das `status`-Select-Feld wird aus dem Phase-4-Upload-Formular **entfernt**. Begründung: Der Phase-3-Init-Endpoint akzeptiert keinen `status`-Parameter und hardcoded `pending` — ein nicht-funktionales UI-Feld erzeugt QA-Frust und Scope-Reduction (PROHIBITED per Planner-Rules). Das Feld wird in Phase 5 (Admin-Katalog, ADMIN-Scope) eingeführt, sobald es editierbar und persistierbar ist. Plan 05 entfernt sowohl das Zod-Schema-Feld `status` als auch die JSX-`Select`-Komponente und dokumentiert die Verschiebung im Plan-Action-Block.

3. **Wie behandelt das Polling den `phase === 'failed'`-Übergang vs. `failed` aus DB?** — **RESOLVED (kein Reset-Button bei failed)**
   - Resolution: Bei `status === 'failed'` (sowohl DB-Failed als auch Polling-Timeout) erscheint **KEIN** Reset-Button — strikt konsistent mit D-10 (UI-SPEC: "Reset button appears only after `status === 'ready'`"). Der User sieht die deutsche Fehler-Description ("Die Verarbeitung ist fehlgeschlagen…" bzw. Timeout-Hinweis "Seite neu laden, um den Status zu prüfen.") und reloadet die Page manuell. Plan 06's Human-Verify-Checkpoint enthält einen expliziten Verifikations-Schritt, der dieses Verhalten bestätigt. Retry-Button für `failed` ist explizit Phase-5-Scope (ADMIN-04).

4. **Sicherheits-Check: Sollten Status- und Thumbnail-Routes Authentifizierung haben?** — **RESOLVED (keine Auth in Phase 4)**
   - Resolution: REQUIREMENTS.md führt "OAuth / SSO Login für Pilot nicht notwendig" explizit als Out-of-Scope. UUID v4 als Resource-ID liefert 122-bit Entropie und ist damit für den Pilot-Betrieb als Schutz gegen Enumeration ausreichend. Beide neue Routes (`/api/parts/[id]/status`, `/api/parts/[id]/thumbnail`) folgen demselben Pattern wie die Phase-3-Routes (`/api/upload/init`, `/api/upload/confirm`) — Zod-UUID-Validierung als einzige Eingabe-Härtung, keine Session-Checks. Auth wird in Phase 10 (Hardening) nachgerüstet, falls v1 produktiv geht.

## Environment Availability

> Phase 4 ist eine reine Code-/Config-Phase. Keine externen Tools erforderlich, die nicht bereits in Phase 3 verifiziert wurden.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js Dev/Build | ✓ (vorausgesetzt) | ≥20 (per `@types/node ^20`) | — |
| npm | Package Management | ✓ | (lockfile vorhanden) | — |
| Vitest | Unit-Tests | ✓ | ^4.1.2 | — |
| Playwright | E2E-Tests (optional) | ✓ | ^1.58.2 | — |
| Browser mit `crypto.subtle` | Client-side SHA-256 | ✓ (alle modernen Browser, HTTPS/localhost) | Web Crypto API stable seit 2017 | — |
| Browser mit XHR Upload Progress | Client-side Upload-Progress | ✓ (alle Browser seit IE10) | XMLHttpRequest Level 2 | — |
| Lokal laufender Worker (für E2E) | Voll funktionaler End-to-End-Test | Bedingt (Docker Compose von Phase 3) | (siehe `docker-compose.yml`) | E2E auf Mock-Worker; Unit-Tests laufen ohne Worker |
| Neon DB / Production-S3 | Status- und Thumbnail-Routes funktional testen | Bedingt (Production-Env) | — | Mock `db` und `s3` in Vitest-Tests (analog `init/route.test.ts`) |

**Missing dependencies with no fallback:** Keine.

**Missing dependencies with fallback:** Bei lokalem E2E ohne laufenden Worker → Tests gegen gemockten Worker oder gegen Production-Worker (mit Risiko, echte Test-Parts in der DB anzulegen). Empfehlung: Vitest-Tests mit `vi.mock` als primäre Validierung; Playwright-E2E nur wenn Docker-Compose-Umgebung bereit ist.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 4.1.2 (Unit + Integration) + Playwright 1.58.2 (E2E) |
| Config file | `vitest.config.ts` (jsdom environment, `@/`-alias) + `playwright.config.ts` (Chromium + Mobile Safari) |
| Quick run command | `npm test -- --run src/app/api/parts src/hooks/use-part-status` (only neue Tests) |
| Full suite command | `npm run test:all` (vitest + playwright) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INGEST-01 | User füllt Form aus + wählt Datei + submit → POST /api/upload/init mit korrektem Body | integration | `npm test -- src/app/upload/UploadForm.test.tsx` | ❌ Wave 0 |
| INGEST-01 | File-Validation: zu groß (>100 MB) → Inline-Fehler "Datei überschreitet..." | unit | `npm test -- src/app/upload/UploadForm.test.tsx -t "validates file size"` | ❌ Wave 0 |
| INGEST-01 | File-Validation: falsche Endung → Inline-Fehler "Nur STEP-Dateien..." | unit | `npm test -- src/app/upload/UploadForm.test.tsx -t "validates file extension"` | ❌ Wave 0 |
| INGEST-01 | Bezeichnung leer → Zod-Fehler "Bezeichnung ist erforderlich." | unit | `npm test -- src/app/upload/UploadForm.test.tsx -t "validates name required"` | ❌ Wave 0 |
| INGEST-01 | Duplikat-Response (HTTP 409) → Inline-Alert mit existing_part_id | integration | `npm test -- src/app/upload/UploadForm.test.tsx -t "shows duplicate alert"` | ❌ Wave 0 |
| INGEST-02 | `usePartStatus` Hook: pollt alle 2s in den ersten 30s | unit (fake timers) | `npm test -- src/hooks/use-part-status.test.ts -t "polls every 2s in first 30s"` | ❌ Wave 0 |
| INGEST-02 | `usePartStatus` Hook: wechselt auf 5s-Intervall nach 30s | unit (fake timers) | `npm test -- src/hooks/use-part-status.test.ts -t "switches to 5s after 30s"` | ❌ Wave 0 |
| INGEST-02 | `usePartStatus` Hook: stoppt Polling bei status='ready' | unit (fake timers) | `npm test -- src/hooks/use-part-status.test.ts -t "stops on ready"` | ❌ Wave 0 |
| INGEST-02 | `usePartStatus` Hook: Timeout nach 5min → `timedOut: true` | unit (fake timers) | `npm test -- src/hooks/use-part-status.test.ts -t "timeouts after 5 minutes"` | ❌ Wave 0 |
| INGEST-02 | `usePartStatus` Hook: Cleanup bei `partId === null` und unmount | unit | `npm test -- src/hooks/use-part-status.test.ts -t "cleans up timers on unmount"` | ❌ Wave 0 |
| INGEST-02 | GET /api/parts/[id]/status: gibt status + thumbnail_count zurück | integration | `npm test -- src/app/api/parts/\[id\]/status/route.test.ts` | ❌ Wave 0 |
| INGEST-02 | GET /api/parts/[id]/status: 404 bei unbekannter UUID | integration | `npm test -- src/app/api/parts/\[id\]/status/route.test.ts -t "returns 404 for unknown id"` | ❌ Wave 0 |
| INGEST-02 | GET /api/parts/[id]/status: 400 bei ungültiger UUID | integration | `npm test -- src/app/api/parts/\[id\]/status/route.test.ts -t "returns 400 for invalid uuid"` | ❌ Wave 0 |
| INGEST-02 | GET /api/parts/[id]/thumbnail: gibt Presigned URL zurück bei status='ready' | integration | `npm test -- src/app/api/parts/\[id\]/thumbnail/route.test.ts` | ❌ Wave 0 |
| INGEST-02 | GET /api/parts/[id]/thumbnail: 409 wenn status !== 'ready' | integration | `npm test -- src/app/api/parts/\[id\]/thumbnail/route.test.ts -t "returns 409 if not ready"` | ❌ Wave 0 |
| INGEST-01+02 (E2E) | Upload-Flow happy path: User → Form → Datei → submit → Status wechselt → Thumbnail erscheint | e2e (manual until live worker) | `npm run test:e2e -- tests/PROJ-INGEST-04.spec.ts` (oder als Phase-eigener Spec-Name) | ❌ Wave 0 (Stub) |
| INGEST-01 (E2E) | Duplikat-Detection: zwei identische Datei-Uploads → zweiter zeigt Inline-Alert | e2e | analog | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm test -- --run src/app/api/parts src/hooks/use-part-status src/app/upload` (alle Phase-4-Tests)
- **Per wave merge:** `npm test` (volle Vitest-Suite — bestätigt keine Regressionen in Phase 1–3)
- **Phase gate:** `npm run test:all` grün vor `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `src/app/api/parts/[id]/status/route.test.ts` — covers INGEST-02 status route Tests
- [ ] `src/app/api/parts/[id]/thumbnail/route.test.ts` — covers INGEST-02 thumbnail route Tests
- [ ] `src/hooks/use-part-status.test.ts` — covers INGEST-02 polling logic (fake timers)
- [ ] `src/app/upload/UploadForm.test.tsx` — covers INGEST-01 form behavior
- [ ] `tests/PROJ-INGEST-04.spec.ts` (oder phase-04-upload.spec.ts) — E2E-Stub
- [ ] **DB-Migration für `thumbnail_count`** falls fehlend — Wave-0-Verify-Task

*(Falls existing test infrastructure in Phase 3 bereits genug Stubs enthält, kann der Planner diese Tasks zusammenfassen. `init/route.test.ts` und `confirm/route.test.ts` sind als Vorlage dokumentiert.)*

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | nein | Pilot ohne Auth (REQUIREMENTS.md OOS) — Phase-10-Hardening |
| V3 Session Management | nein | Keine Sessions in v1 |
| V4 Access Control | teilweise | UUIDs als unenumerierbare Resource-IDs (122-bit Entropie) — kein expliziter ACL-Check |
| V5 Input Validation | yes | Zod-Schemas in allen Routes (siehe `init/route.ts`, `confirm/route.ts`) — Status- und Thumbnail-Route MÜSSEN dasselbe Pattern: `z.string().uuid()` für `[id]`. Client-seitige Validation (file size, file extension) ist UX, nicht Sicherheit — Server-Validation ist Quelle der Wahrheit. |
| V6 Cryptography | yes | `crypto.subtle.digest` (Web-Standard, niemals selbst hand-rollen). AWS SDK signiert URLs (niemals selbst signieren). |
| V13 API & Web Service | yes | REST-Endpoints geben strukturierte JSON-Errors zurück, kein Stack-Trace. Existierender Stil in Phase 3 ist konform. |

### Known Threat Patterns for Next.js + S3 + Browser-Upload

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| **SSRF/Path-Traversal über `[id]`** | Tampering | Strikte UUID-Validierung via `z.string().uuid()` BEVOR `id` in S3-Key oder DB-Query landet (verhindert dass `..` oder `null` einen ungültigen Key erzeugen) |
| **Presigned URL leak** | Information Disclosure | 60s Lifetime (Thumbnail) und 900s (Steps) — kurz genug. Keine Persistierung in localStorage. |
| **Direct S3 enumeration** | Information Disclosure | Buckets sind privat (`BUCKET_THUMBNAILS` ohne public read) — verifiziert durch Phase 1 RLS-Policies (analog für S3 Bucket Policies). |
| **XSS via Filename** | Tampering | `original_filename` wird nur als Text gerendert in zukünftigen Phasen, in Phase 4 nicht ausgegeben. Falls doch: Next.js JSX escaped automatisch. |
| **CSRF auf Status-/Thumbnail-Routes** | Tampering | Beide sind GET-only, idempotent, kein State-Change. CSRF-Schutz nicht erforderlich. |
| **Information disclosure via DB-Errors** | Information Disclosure | Catch-all in Routes; Response-Body nur `{error: 'Part not found'}` — kein Stack, kein Detail (Phase-3-Pattern bewahren) |
| **Race condition: Confirm vs. Worker** | Tampering | Confirm verifiziert Existenz von `part_id` in DB BEVOR Worker enqueued — Phase 3 already mitigated |

**Phase-spezifische Kontrollen:**
- Status- und Thumbnail-Route MÜSSEN `z.string().uuid()` validieren — nicht-UUID-IDs gehen niemals in DB-Queries oder S3-Keys.
- `getSignedUrl` läuft mit minimal scope: nur GetObject auf einem spezifischen Key. Kein wildcard.
- `Content-Type` der Status- und Thumbnail-Responses ist `application/json` (NextResponse default) — keine Mime-Sniffing-Risiken.

## Sources

### Primary (HIGH confidence)
- **Existing codebase** — `src/app/api/upload/init/route.ts`, `src/app/api/upload/confirm/route.ts`, `src/components/ui/*` (alle gelesen) — etablierte Patterns
- **Phase-3 init-Route Pitfall-Kommentar** — `// Content-Type NICHT in signableHeaders — verhindert Content-Type-Mismatch (Pitfall 1)` — direkter Hinweis für XHR-Implementierung
- **MDN: SubtleCrypto.digest** — https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest — Hash-Berechnung
- **MDN: XMLHttpRequest Upload Progress** — Standard browser API
- **Next.js docs: Route Handlers** — https://nextjs.org/docs/app/getting-started/route-handlers — `params: Promise<...>` Pattern bestätigt
- **shadcn/ui form.tsx** — `src/components/ui/form.tsx` (gelesen) — react-hook-form Integration

### Secondary (MEDIUM confidence)
- **CONTEXT.md (D-01–D-11)** — User-Entscheidungen, locked
- **UI-SPEC.md (Phase 4)** — Visual + Interaction-Contract, locked + reviewed
- **04-CONTEXT.md `existing assets` Liste** — alle UI-Komponenten + Hooks vorab inventarisiert
- **STATE.md "PNG-Pfadkonvention"** — `view_0..view_7.png` als locked decision

### Tertiary (LOW confidence — falls trotzdem relevant)
- WebSearch zu react-hook-form file-input — bestätigt "uncontrolled" Pattern, aber spezifische Beispiele kommen aus Issue-Tracker (nicht offizielle Doku)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Alle Dependencies in `package.json` verifiziert; alle shadcn-Komponenten in `src/components/ui/` per `ls` bestätigt
- Architecture (Routes + Hook + Form): HIGH — Patterns folgen 1:1 existierendem Phase-3-Stil; keine Spekulation
- Pitfalls: HIGH — Pitfalls 1 (params-Promise), 4 (Content-Type), 5 (race) sind verifiziert; Pitfall 3 (Main-Thread) ist gut bekannt aus Web-Crypto-Praxis
- Open Questions (#1 thumbnail_count): LOW-MEDIUM — DB-Migration aus Phase 1 nicht direkt gelesen; Plan-Check muss klären
- Security: MEDIUM — Pilot ohne Auth ist explizite Projekt-Entscheidung; ASVS-Anwendung pragmatisch

**Research date:** 2026-05-08
**Valid until:** 2026-06-07 (30 Tage — Stack ist stable, keine erwarteten Breaking Changes in Next.js 16.1.x oder react-hook-form 7.x)

---

*Phase: 4 — Ingestion UI*
*Research erstellt: 2026-05-08*
*Sources: 04-CONTEXT.md, 04-UI-SPEC.md, REQUIREMENTS.md, ROADMAP.md, STATE.md, .planning/codebase/{ARCHITECTURE,CONVENTIONS,STACK,STRUCTURE,TESTING}.md, package.json, src/app/api/upload/{init,confirm}/route.ts, src/lib/{db,s3}.ts, src/components/ui/*, .claude/rules/{frontend,backend,security}.md*
