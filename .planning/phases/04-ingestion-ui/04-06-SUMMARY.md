---
phase: 04-ingestion-ui
plan: "06"
subsystem: ingestion-ui
tags: [routing, server-component, homepage, minio, s3]
dependency_graph:
  requires: [04-05-SUMMARY.md]
  provides: [upload-page-route, homepage-link]
  affects: [src/app/upload/page.tsx, src/app/page.tsx, src/lib/s3.ts, src/app/upload/UploadForm.tsx]
tech_stack:
  added: []
  patterns: [next-server-component-wraps-client-component, button-asChild-link-pattern]
key_files:
  created:
    - src/app/upload/page.tsx
  modified:
    - src/app/page.tsx
    - src/lib/s3.ts
    - src/app/upload/UploadForm.tsx
decisions:
  - "D-01 umgesetzt: /upload bleibt Server Component, UploadForm als Client Component eingebettet"
  - "D-02 umgesetzt: Homepage zeigt ausschließlich einen Button 'Teil hochladen' — kein Auto-Redirect"
  - "DECOMPOSEDS3_ENDPOINT env var für lokale MinIO-Instanzen eingeführt (Post-Checkpoint-Fix)"
metrics:
  duration: "~30 min (inkl. Post-Checkpoint-Fixes)"
  completed: "2026-05-08"
---

# Phase 4 Plan 06: /upload Page + Homepage-Link Summary

**One-liner:** /upload Server Component + minimale Homepage-Landing (D-01/D-02) mit MinIO-Endpoint-Fix für lokale Entwicklung.

---

## Was wurde gebaut

### Task 1: Server Component /upload/page.tsx + Homepage-Rewrite

**src/app/upload/page.tsx** (neu erstellt)
- Server Component — kein `'use client'`
- Exportiert `metadata.title = 'STEP-Datei hochladen — Bauteil-Finder'`
- Rendert `<UploadForm />` (Client Component) korrekt eingebettet
- UI-SPEC-konformes Layout: `py-12 px-4 max-w-4xl`, Heading `text-2xl font-semibold mb-8`

**src/app/page.tsx** (vollständiger Rewrite)
- Minimale Landing-Page per D-02: ein einziger shadcn `<Button asChild>` mit `<Link href="/upload">`
- Alle Vercel/Next.js-Template-Logos und Hero-Sections entfernt
- Kein automatischer Redirect (D-02 explizit eingehalten)

**Build-Verifikation:** `npm run build` war vor und nach den Post-Checkpoint-Fixes fehlerfrei (Exit-Code 0).

### Post-Checkpoint-Fixes (Commit 13e1558)

Zwei Fixes wurden nach dem Human-Verify-Checkpoint als Folge der manuellen Verifikation committed:

1. **src/lib/s3.ts** — MinIO-Endpoint-Unterstützung: `DECOMPOSEDS3_ENDPOINT` + `forcePathStyle: true` (CORS-Fix für lokale MinIO-Instanz)
2. **src/app/upload/UploadForm.tsx** — Verbesserte Fehlermeldungen: tatsächliche Fehlerdetails werden angezeigt statt generischer Nachrichten

---

## Human-Verify Ergebnis

Checkpoint wurde mit folgenden Befunden **approved**:

| Success Criterion | Ergebnis |
|---|---|
| **SC1:** `/upload`-Seite lädt korrekt als Server Component mit UploadForm | ✓ Bestätigt |
| **SC1:** Homepage zeigt "Teil hochladen"-Button mit Link zu /upload | ✓ Bestätigt |
| **SC1:** `npm run build` erfolgreich | ✓ Bestätigt |
| **SC1 API-Flow:** Init (POST /api/upload/init) → HTTP 200 | ✓ Bestätigt |
| **SC1 API-Flow:** S3 PUT via Presigned URL → HTTP 200 (nach CORS-Fix auf MinIO) | ✓ Bestätigt |
| **SC1 API-Flow:** Confirm returns 502 bei nicht laufendem Docker-Worker | ✓ Erwartetes Verhalten in lokalem Dev |
| **SC2:** Status-Echtzeit-Update (pending → processing → ready) | Pending — Docker-Worker nicht aktiv |
| **SC3:** Thumbnail erscheint ohne Page-Reload | Pending — Docker-Worker nicht aktiv |
| **SC4:** Duplikat-Upload zeigt Inline-Alert mit existing_part_id | Pending — Worker-Abhängigkeit |

SC2, SC3 und SC4 sind infrastrukturell korrekt implementiert (Unit-Tests grün), konnten aber ohne laufenden Docker-Worker im Human-Verify nicht vollständig End-to-End verifiziert werden. Dies entspricht dem erwarteten Zustand für lokale Entwicklung ohne aktiven Worker.

---

## Must-Haves Erfüllt

| Must-Have | Status |
|---|---|
| /upload-Seite als Server Component erreichbar, rendert UploadForm | ✓ |
| metadata.title 'STEP-Datei hochladen — Bauteil-Finder' | ✓ |
| Startseite zeigt einzelnen Button 'Teil hochladen' → /upload | ✓ |
| Kein automatischer Redirect / → /upload (D-02 explizit) | ✓ |
| npm run build fehlerfrei | ✓ |
| Human-Verify-Checkpoint bestätigt | ✓ |

---

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] DECOMPOSEDS3_ENDPOINT für custom S3-Endpoints**
- **Found during:** Human-Verify (Post-Checkpoint)
- **Issue:** S3-Client in `src/lib/s3.ts` verwendete kein konfigurierbares Endpoint, was den S3-PUT über MinIO (lokale Entwicklung) mit einem CORS-Fehler blockierte. Der Standard-AWS-S3-Client funktioniert nicht mit lokalen MinIO-Instanzen ohne expliziten Endpoint und `forcePathStyle: true`.
- **Fix:** `DECOMPOSEDS3_ENDPOINT` env var wird bedingt eingebunden: `...(process.env.DECOMPOSEDS3_ENDPOINT ? { endpoint: process.env.DECOMPOSEDS3_ENDPOINT, forcePathStyle: true } : {})`. Bei leerem `DECOMPOSEDS3_ENDPOINT` verhält sich der Client identisch wie zuvor (AWS-kompatibel).
- **Files modified:** `src/lib/s3.ts`
- **Commit:** `13e1558`

**2. [Rule 1 - Bug] Verbesserte Fehlermeldungen in UploadForm**
- **Found during:** Human-Verify (Post-Checkpoint)
- **Issue:** Fehlermeldungen in `UploadForm.tsx` zeigten bei API-Fehlern nur generische Texte ohne den tatsächlichen Fehlerdetail aus der Server-Antwort.
- **Fix:** UploadForm zeigt jetzt den tatsächlichen Fehlertext aus der API-Antwort im Inline-Alert.
- **Files modified:** `src/app/upload/UploadForm.tsx`
- **Commit:** `13e1558`

---

## Commits

| Commit | Type | Description |
|---|---|---|
| `a738038` | feat(04-06) | /upload Server Component + minimale Homepage (D-01, D-02) |
| `13e1558` | fix(04-06) | DECOMPOSEDS3_ENDPOINT für MinIO, verbesserte Upload-Fehlermeldungen |

---

## Known Stubs

Keine Stubs vorhanden. Alle Komponenten sind vollständig verdrahtet.

---

## Self-Check: PASSED

- `src/app/upload/page.tsx` existiert ✓
- `src/app/page.tsx` enthält `href="/upload"` ✓
- Commit `a738038` in git log ✓
- Commit `13e1558` in git log ✓
