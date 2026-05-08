// src/lib/db.ts
// Neon PostgreSQL-Client — server-only.
// Darf NIEMALS in Client-Komponenten importiert werden.
// Erlaubte Verwendungsorte: src/app/api/** (API Routes), Server Components, Server Actions.
import { neon, neonConfig } from '@neondatabase/serverless'

// Suppress browser-environment warning when running tests in jsdom
neonConfig.disableWarningInBrowsers = true

const databaseUrl = process.env.DATABASE_URL!

// Tagged-template-literal SQL-Client — typsicher, edge-kompatibel
export const db = neon(databaseUrl)
