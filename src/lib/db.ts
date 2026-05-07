// src/lib/db.ts
// Neon PostgreSQL-Client — server-only.
// Darf NIEMALS in Client-Komponenten importiert werden.
// Erlaubte Verwendungsorte: src/app/api/** (API Routes), Server Components, Server Actions.
import { neon } from '@neondatabase/serverless'

const databaseUrl = process.env.DATABASE_URL!

// Tagged-template-literal SQL-Client — typsicher, edge-kompatibel
export const db = neon(databaseUrl)
