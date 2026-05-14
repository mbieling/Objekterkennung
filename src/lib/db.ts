// src/lib/db.ts
// PostgreSQL-Client — server-only.
// Darf NIEMALS in Client-Komponenten importiert werden.
// Erlaubte Verwendungsorte: src/app/api/** (API Routes), Server Components, Server Actions.
import postgres from 'postgres'

export const db = postgres(process.env.DATABASE_URL!)
