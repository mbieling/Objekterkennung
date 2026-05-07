// src/lib/supabase.ts
// SERVER-ONLY wenn supabaseAdmin verwendet wird.
// supabaseAdmin darf NIEMALS in Client-Komponenten importiert werden.
// Erlaubte Verwendungsorte: src/app/api/** (API Routes), Server Components, Server Actions.
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Anon-Client — für zukünftige öffentliche Lesezugriffe mit RLS
// Aktuell ungenutzt (Phase 1); RLS ist für Pilot deaktiviert (D-06)
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Admin-Client (service_role) — NIEMALS ins Client-Bundle
// Verwendet SUPABASE_SERVICE_ROLE_KEY (kein NEXT_PUBLIC_ Prefix — würde Key im Browser exponieren)
// Fundort des Keys: Supabase Dashboard > Project Settings > API > service_role
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})
