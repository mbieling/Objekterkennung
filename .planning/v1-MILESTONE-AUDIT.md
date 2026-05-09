---
milestone: v1
audited: 2026-05-09T00:00:00Z
status: tech_debt
blockers_fixed: ["BLOCKER-01 (2026-05-09)", "BLOCKER-02 (2026-05-09)"]
scores:
  requirements: 10/15
  phases: 10/10
  integration: 21/23 connections wired
  flows: 3/4 E2E flows complete
gaps:
  requirements:
    - id: "INGEST-02"
      status: "partial"
      phase: "Phase 4"
      claimed_by_plans: ["04-02", "04-03", "04-04", "04-05", "04-06"]
      completed_by_plans: ["04-02", "04-04", "04-05"]
      verification_status: "partial"
      evidence: "Status-Polling implementiert und getestet. Thumbnail-Anzeige nach Abschluss kaputt: isSafeImageUrl() in UploadForm.tsx erlaubt nur *.supabase.co — alle AWS S3 presigned URLs werden abgelehnt → Skeleton statt Thumbnail."
    - id: "INGEST-03"
      status: "partial"
      phase: "Phase 2"
      claimed_by_plans: ["02-01", "02-02", "02-03"]
      completed_by_plans: ["02-02", "02-03"]
      verification_status: "partial"
      evidence: "Implementierung vorhanden (render_views(), 8 PNGs). Nie im echten Docker-Container gegen Sample-STEP-Datei ausgeführt. Zusätzlich: thumbnail_count wird in process_step.py nie in DB geschrieben → /api/parts/[id]/thumbnails gibt immer [] zurück."
    - id: "ADMIN-01"
      status: "partial"
      phase: "Phase 5"
      claimed_by_plans: ["05-02", "05-04"]
      completed_by_plans: ["05-02", "05-04"]
      verification_status: "partial"
      evidence: "Katalog-Liste implementiert und getestet. Thumbnail-Spalte kaputt: isSafeImageUrl() in CatalogTable.tsx erlaubt nur *.supabase.co — alle AWS S3 presigned URLs für ready-Teile werden abgelehnt → Skeleton statt Thumbnail."
    - id: "SEARCH-01"
      status: "partial"
      phase: "Phase 7"
      claimed_by_plans: ["07-01", "07-02", "07-03", "07-04"]
      completed_by_plans: ["07-02", "07-03", "07-04"]
      verification_status: "partial"
      evidence: "Code vollständig implementiert (getUserMedia, State Machine, Playwright-Tests). Manuelles Testen auf echtem Mobilgerät ausstehend. Phase-7-Human-Verify-Checkpoint wurde approved für SEARCH-02 (File-Input), aber SEARCH-01 (Kamera-Capture) erfordert echtes Gerät."
    - id: "DETAIL-01"
      status: "partial"
      phase: "Phase 9"
      claimed_by_plans: ["09-01", "09-02", "09-03", "09-04"]
      completed_by_plans: ["09-03", "09-04"]
      verification_status: "partial"
      evidence: "Metadaten-Anzeige vollständig. Thumbnail-Galerie (6–8 Views) kaputt: worker/process_step.py schreibt thumbnail_count nie in DB. /api/parts/[id]/thumbnails gibt immer { urls: [] } zurück (guard: thumbnail_count === 0). Galerie zeigt permanent Skeleton statt gerenderte Views."
  integration:
    - id: "BLOCKER-01"
      description: "worker/process_step.py schreibt thumbnail_count nie in DB"
      affected_requirements: ["DETAIL-01", "INGEST-03"]
      fix: "In process_step.py den DB-UPDATE um thumbnail_count = len(png_paths) erweitern"
    - id: "BLOCKER-02"
      description: "isSafeImageUrl() in UploadForm.tsx und CatalogTable.tsx erlaubt nur *.supabase.co — Projekt nutzt AWS S3"
      affected_requirements: ["INGEST-02", "ADMIN-01"]
      fix: "Allowlist um *.amazonaws.com (prod) und http://localhost:* (dev/MinIO) erweitern"
  flows:
    - id: "DETAIL-GALLERY"
      description: "Part Detail Thumbnail-Galerie zeigt permanent Skeleton (BLOCKER-01)"
      affected_requirements: ["DETAIL-01"]
tech_debt:
  - phase: "02-python-worker-spike"
    items:
      - "Docker-Container wurde nie gegen echte STEP-Datei ausgeführt (E2E-Beweis fehlt)"
      - "V3d_XnegYposZneg für iso_rear — empirisch noch zu bestätigen (Open Question A3)"
  - phase: "05-admin-catalog"
    items:
      - "Kein 'processing'-Tab in CatalogTable — Teile im Verarbeitungszustand nur im 'Alle'-Tab sichtbar"
      - "PaginationLink-Elemente verwenden href='#' — keine URL-Deep-Links zu Seite 2+"
  - phase: "07-camera-ui"
    items:
      - "SEARCH-01 (Kamera-Capture) nur auf Desktop-Playwright getestet, nicht auf echtem Mobilgerät"
  - phase: "09-part-detail"
    items:
      - "filename aus GET /api/parts/[id]/download-Response wird in PartDetail.tsx ignoriert (harmlos: Content-Disposition in presigned URL funktioniert)"
  - phase: "06-search-pipeline"
    items:
      - "Asymmetrie WORKER_URL: Upload/Retry überspringen Worker bei fehlendem WORKER_URL; Search gibt 503 zurück"
nyquist:
  compliant_phases: [1, 2]
  partial_phases: [3, 4, 5, 6, 7, 8, 9]
  missing_phases: [10]
  overall: "PARTIAL — 2/10 compliant, 8/10 VALIDATION.md nicht abgeschlossen"
---

# Milestone v1 — Audit-Bericht

**Milestone:** v1 — Core Search Experience
**Geprüft:** 2026-05-09
**Status:** gaps_found — 2 Blocker, 3 Partial-Requirements
**Score:** 10/15 Requirements vollständig satisfied; 5 partial

---

## Zusammenfassung

Alle 10 Phasen (43 Pläne) sind abgeschlossen. Die Kern-User-Journey — Foto aufnehmen → Bauteil suchen → Ergebnisse mit Match-% sehen → Bauteil-Detail aufrufen → STEP-Datei herunterladen — funktioniert. Zwei konkrete Code-Bugs blockieren zwei Teilbereiche:

1. **BLOCKER-01**: `thumbnail_count` wird vom Worker nie in die DB geschrieben → Bauteil-Galerie in Part Detail zeigt nur Skeletons
2. **BLOCKER-02**: `isSafeImageUrl()` erlaubt nur Supabase-URLs, Projekt nutzt AWS S3 → Thumbnails in Upload-Bestätigung und Admin-Katalog sind kaputt

Beide Fixes sind minimal (je 3–10 Zeilen).

---

## Requirements-Abdeckung (3-Quellen-Vergleich)

| Anforderung | Phase | VERIFICATION | SUMMARY | REQUIREMENTS.md | Finale Bewertung |
|-------------|-------|-------------|---------|-----------------|-----------------|
| INGEST-01 | 4 | SATISFIED | ✓ Listed | [ ] Pending | **SATISFIED** |
| INGEST-02 | 4 | PARTIAL | ✓ Listed | [ ] Pending | **PARTIAL** (BLOCKER-02) |
| INGEST-03 | 2 | UNCONFIRMED | ✓ Listed | [ ] Pending | **PARTIAL** (nie E2E-getestet + BLOCKER-01) |
| INGEST-04 | 3 | SATISFIED | ✓ Listed | [x] Complete | **SATISFIED** |
| ADMIN-01 | 5 | SATISFIED | ✓ Listed | [ ] Pending | **PARTIAL** (BLOCKER-02) |
| ADMIN-02 | 5 | SATISFIED | ✓ Listed | [ ] Pending | **SATISFIED** |
| ADMIN-03 | 5 | SATISFIED | ✓ Listed | [ ] Pending | **SATISFIED** |
| ADMIN-04 | 5 | SATISFIED | ✓ Listed | [ ] Pending | **SATISFIED** |
| SEARCH-01 | 7 | HUMAN NEEDED | ✓ Listed | [ ] Pending | **PARTIAL** (Gerät-Test ausst.) |
| SEARCH-02 | 7 | SATISFIED | ✓ Listed | [ ] Pending | **SATISFIED** |
| SEARCH-03 | 8 | PARTIAL→FIXED | ✓ Listed | [ ] Pending | **SATISFIED** (gap post-verification behoben) |
| SEARCH-04 | 8 | SATISFIED | ✓ Listed | [ ] Pending | **SATISFIED** |
| SEARCH-05 | 8 | SATISFIED | ✓ Listed | [ ] Pending | **SATISFIED** |
| DETAIL-01 | 9 | SATISFIED | ✓ Listed | [x] Validated | **PARTIAL** (BLOCKER-01) |
| DETAIL-02 | 9 | SATISFIED | ✓ Listed | [x] Validated | **SATISFIED** |

**Hinweis zu REQUIREMENTS.md:** Die Traceability-Tabelle wurde seit Phase 4 nicht mehr aktualisiert. Der tatsächliche Status der Requirements ergibt sich aus VERIFICATION.md-Dateien und SUMMARY-Frontmatter — nicht aus den Checkboxen in REQUIREMENTS.md.

**Hinweis zu SEARCH-03:** Phase-8-VERIFICATION.md zeigt `gaps_found` wegen fehlendem `part_number`. Das Feld wurde inzwischen behoben (grep bestätigt: `SearchResultCard.tsx` rendert `part_number`, `SearchResults.tsx` übergibt es). Gap ist geschlossen.

---

## Blocker-Details

### BLOCKER-01 — Worker schreibt thumbnail_count nie in DB

**Betrifft:** DETAIL-01, INGEST-03

**Bruchstelle:** `worker/process_step.py` DB-UPDATE enthält kein `thumbnail_count`-Feld.
`supabase/migrations/002_add_thumbnail_count.sql` hat `DEFAULT 0`. Bleibt nach Ingest bei 0.

**Downstream:**
```typescript
// src/app/api/parts/[id]/thumbnails/route.ts
if (rows[0].status !== 'ready' || rows[0].thumbnail_count === 0) {
  return NextResponse.json({ urls: [] })  // immer ausgeführt
}
```
`usePartDetail` → `PartDetail.tsx` → Galerie zeigt permanent Skeleton statt Views.

**Fix (3 Zeilen in process_step.py):**
```python
# Im DB-UPDATE den thumbnail_count hinzufügen:
db.execute(
    "UPDATE parts SET embedding=..., thumbnail_count=%s, ... WHERE id=%s",
    (..., len(png_paths), part_id)
)
```

**Nicht betroffen:** `/api/parts/[id]/thumbnail` (Singular) in CatalogTable und SearchResultCard — nutzt direkt S3-HeadObject auf `view_0.png`, ignoriert thumbnail_count. Funktioniert korrekt.

---

### BLOCKER-02 — isSafeImageUrl erlaubt nur Supabase-URLs

**Betrifft:** INGEST-02, ADMIN-01

**Bruchstelle:** `isSafeImageUrl()` in `UploadForm.tsx` (Z. 44–63) und `CatalogTable.tsx` (Z. 110–131) prüft gegen `*.supabase.co` / `*.supabase.in`. Projekt nutzt seit Phase 1 Plan 02 AWS S3 — URLs haben Form `{bucket}.s3.{region}.amazonaws.com`.

**Downstream:**
- `UploadForm.tsx` Z. 479: `thumbnailUrl && isSafeImageUrl(thumbnailUrl) ? <img> : <Skeleton>` → immer Skeleton
- `CatalogTable.tsx` Z. 457: gleiche Guard → alle ready-Teile zeigen Skeleton in Thumbnail-Spalte

**Fix:**
```typescript
function isSafeImageUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!['https:', 'http:'].includes(parsed.protocol)) return false;
    const host = parsed.hostname;
    return (
      host.endsWith('.supabase.co') ||
      host.endsWith('.supabase.in') ||
      host.endsWith('.amazonaws.com') ||   // AWS S3 (prod)
      host === 'localhost'                  // MinIO (dev)
    );
  } catch {
    return false;
  }
}
```

---

## Integration-Status

| Connection | Status |
|-----------|--------|
| Phase 1 DB schema → alle API-Routes | ✓ WIRED |
| Phase 1 S3-Client → alle S3-nutzenden Routes | ✓ WIRED |
| Phase 2 Worker pipeline → Phase 3 Queue-Dispatch | ✓ WIRED |
| Phase 3 POST /api/upload/init + /confirm → Phase 4 UploadForm | ✓ WIRED |
| Phase 4 GET /api/parts/[id]/status → usePartStatus → UploadForm | ✓ WIRED |
| Phase 4 GET /api/parts/[id]/thumbnail → UploadForm | ✗ BROKEN (BLOCKER-02) |
| Phase 5 GET/PATCH/DELETE/archive/retry /api/parts/[id] → CatalogTable | ✓ WIRED |
| Phase 5 GET /api/parts/[id]/thumbnail → CatalogTable | ✗ BROKEN (BLOCKER-02) |
| Phase 6 Worker /embed → POST /api/search | ✓ WIRED |
| Phase 6 POST /api/search → Phase 7 CameraCapture | ✓ WIRED |
| Phase 8 SearchResults + SearchResultCard → CameraCapture | ✓ WIRED |
| Phase 8 SearchResultCard → /parts/[id] page | ✓ WIRED |
| Phase 9 GET /api/parts/[id] → usePartDetail → PartDetail | ✓ WIRED |
| Phase 9 GET /api/parts/[id]/thumbnails → usePartDetail | ✗ BROKEN (BLOCKER-01) |
| Phase 9 GET /api/parts/[id]/download → PartDetail | ✓ WIRED |
| Phase 10 Error-Hardening → UploadForm | ✓ WIRED |
| Phase 10 Pagination → GET /api/parts + CatalogTable | ✓ WIRED |

**21/23 Verbindungen korrekt verdrahtet. 2 durch BLOCKER-01 und BLOCKER-02 kaputt.**

---

## E2E-Flows

| Flow | Status | Bruch |
|------|--------|-------|
| Upload-Flow: Datei auswählen → Upload → Status-Polling → ready | ✓ COMPLETE | Thumbnail nach Abschluss kaputt (BLOCKER-02) |
| Admin-Flow: /admin → Katalog → Edit/Archive/Delete/Retry | ✓ COMPLETE | Thumbnails in Katalog kaputt (BLOCKER-02) |
| Such-Flow: Kamera/Datei → POST /api/search → Ergebnisse mit % → Part Detail | ✓ COMPLETE | — |
| Detail-Flow: Part Detail → Metadaten → Thumbnail-Galerie → STEP Download | ✗ BROKEN | Galerie permanent leer (BLOCKER-01) |

---

## Nyquist-Compliance

| Phase | VALIDATION.md | Compliant | Aktion |
|-------|---------------|-----------|--------|
| 1. Database Foundation | Vorhanden | ✓ true | — |
| 2. Python Worker Spike | Vorhanden | ✓ true | — |
| 3. Ingestion API + Queue | Vorhanden (draft) | ✗ false | `/gsd-validate-phase 3` |
| 4. Ingestion UI | Vorhanden (draft) | ✗ false | `/gsd-validate-phase 4` |
| 5. Admin Catalog | Vorhanden (draft) | ✗ false | `/gsd-validate-phase 5` |
| 6. Search Pipeline | Vorhanden (draft) | ✗ false | `/gsd-validate-phase 6` |
| 7. Camera UI | Vorhanden (draft) | ✗ false | `/gsd-validate-phase 7` |
| 8. Results UI | Vorhanden (draft) | ✗ false | `/gsd-validate-phase 8` |
| 9. Part Detail | Vorhanden (draft) | ✗ false | `/gsd-validate-phase 9` |
| 10. Hardening | **FEHLEND** | ✗ | `/gsd-validate-phase 10` |

**2/10 compliant. 8 Phasen haben VALIDATION.md als Draft — nicht abgeschlossen.**

---

## Tech Debt (kein Blocker)

| Phase | Item |
|-------|------|
| 2 | Docker-Container nie gegen echte STEP-Datei ausgeführt (E2E-Beweis fehlt) |
| 2 | V3d_XnegYposZneg für iso_rear — empirisch noch zu bestätigen (Open Question A3) |
| 5 | Kein 'processing'-Tab in Admin-Katalog |
| 5 | PaginationLink verwendet `href="#"` — kein URL-Deep-Link zu Seite N |
| 6 | Asymmetrie WORKER_URL: Upload/Retry überspringen Worker; Search gibt 503 |
| 7 | SEARCH-01 nur mit Playwright-Desktop getestet, nicht auf echtem Mobilgerät |
| 9 | filename aus Download-API-Response wird ignoriert (harmlos) |

---

*Audit erstellt: 2026-05-09*
*Auditor: Claude (gsd-audit-milestone)*
