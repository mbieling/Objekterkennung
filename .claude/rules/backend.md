---
paths:
  - "src/app/api/**"
  - "src/lib/**"
  - "worker/**"
---

# Backend Development Rules

## Datenbank (Neon PostgreSQL)
- DB-Client ausschließlich `db` aus `src/lib/db.ts` verwenden — tagged-template-literal-Client (`@neondatabase/serverless`)
- **NIEMALS** Supabase-Client oder andere Datenbank-Libraries einbinden
- RLS ist **bewusst deaktiviert** — kein direkter Browser-Zugriff auf DB
- Migrationen in `supabase/migrations/` — manuell im Neon Dashboard oder via `supabase db push` einspielen

## API-Routen
- Alle Inputs mit Zod-Schemas validieren
- Sinnvolle HTTP-Status-Codes zurückgeben
- `.limit()` auf alle Listen-Queries

## Query-Patterns
- pgvector-Embeddings immer als String übergeben: `` `[${embedding.join(',')}]` `` — kein Array (Neon serialisiert anders)
- Cosine-Similarity-Ausdruck im WHERE vollständig wiederholen — kein Alias

## S3
- `s3` und Bucket-Konstanten aus `src/lib/s3.ts` — server-only, nie in Client-Komponenten
- `ContentType` **nicht** in `signableHeaders` bei Presigned URLs
- `DECOMPOSEDS3_ENDPOINT` → `forcePathStyle: true` ist bereits in `s3.ts` gehandhabt
