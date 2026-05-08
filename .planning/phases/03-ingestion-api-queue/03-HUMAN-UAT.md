---
status: partial
phase: 03-ingestion-api-queue
source: [03-VERIFICATION.md]
started: 2026-05-08
updated: 2026-05-08
---

## Current Test

[SC#4 ausstehend — erfordert Docker + Credentials]

## Tests

### 1. SC#4 — Worker-Statuszyklus (pending → processing → ready/failed)
expected: Worker konsumiert Job aus Redis-Queue und setzt parts.status von pending → processing → ready (oder failed bei Fehler)
result: [pending]

## Summary

total: 1
passed: 0
issues: 0
pending: 1
skipped: 0
blocked: 0

## Gaps

### SC#4 Voraussetzungen
Um SC#4 zu testen, müssen folgende Voraussetzungen erfüllt sein:
1. `worker/.env` mit echten Credentials befüllen (DATABASE_URL, AWS_*, CELERY_BROKER_URL)
2. `docker compose up -d` starten (Redis + Worker)
3. Next.js Dev-Server: `npm run dev`

### Testablauf
```bash
# 1. Init-Request
SHA=$(shasum -a 256 testdatei.step | cut -d' ' -f1)
RESPONSE=$(curl -s -X POST http://localhost:3000/api/upload/init \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Testbauteil\",\"sha256\":\"$SHA\",\"file_size_bytes\":1024}")
PART_ID=$(echo $RESPONSE | jq -r '.part_id')
PRESIGNED=$(echo $RESPONSE | jq -r '.presigned_url')

# 2. S3-Upload
curl -X PUT "$PRESIGNED" -T testdatei.step

# 3. Confirm
curl -X POST http://localhost:3000/api/upload/confirm \
  -H "Content-Type: application/json" \
  -d "{\"part_id\":\"$PART_ID\"}"

# 4. Status prüfen (mehrfach bis ready/failed)
psql $DATABASE_URL -c "SELECT status FROM parts WHERE id='$PART_ID'"
```

### Erwartetes Ergebnis
- Nach confirm: status = 'processing'
- Nach Worker-Verarbeitung: status = 'ready' (oder 'failed' bei ungültiger STEP-Datei)
