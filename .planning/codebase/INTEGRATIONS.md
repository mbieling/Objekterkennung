# External Integrations

**Analysis Date:** 2026-05-07

## APIs & External Services

**Backend-as-a-Service:**
- Supabase - Database, authentication, row-level security, and storage
  - SDK/Client: `@supabase/supabase-js` ^2.39.3
  - Client setup: `src/lib/supabase.ts` (currently commented out; exports `null` placeholder)
  - Auth: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - Status: Installed, configured in env template, but not yet activated in application code

**Commented-out / Planned Integrations (from `.env.local.example`):**
- Stripe - Payment processing (env var `STRIPE_SECRET_KEY` documented but not wired)
- SMTP/SendGrid - Transactional email (`SMTP_HOST`, `SMTP_USER`, `SMTP_PASS` documented but not wired)

## Data Storage

**Databases:**
- Supabase (PostgreSQL)
  - Connection: `NEXT_PUBLIC_SUPABASE_URL`
  - Client: `@supabase/supabase-js` via `src/lib/supabase.ts`
  - RLS: Row Level Security required on every table per project rules (`.claude/rules/backend.md`)
  - Status: Not yet connected (client exports `null`)

**File Storage:**
- Supabase Storage (implied by Supabase integration; no dedicated storage code found yet)
- Local filesystem only at present

**Caching:**
- `unstable_cache` from Next.js recommended for rarely-changing data (per `.claude/rules/backend.md`)
- No external cache layer (Redis, Memcached) detected

## Authentication & Identity

**Auth Provider:**
- Supabase Auth
  - Implementation: Session-based via Supabase client
  - Post-login redirect: `window.location.href` (not `router.push`) per frontend rules
  - Session verification: `data.session` check before redirect
  - Status: Not yet implemented (Supabase client is a `null` placeholder)

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, Datadog, or similar package)

**Logs:**
- Console logging only; no structured logging framework detected

## CI/CD & Deployment

**Hosting:**
- Vercel (target platform per skill docs and `public/vercel.svg` asset)
- Deploy skill (`/deploy`) checks: build, lint, QA approval, env vars, no committed secrets, migrations applied

**CI Pipeline:**
- None detected (no GitHub Actions, CircleCI, or similar config files found)

## Environment Configuration

**Required env vars:**
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL (public, browser-safe)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase anonymous key (public, browser-safe)

**Planned env vars (in example file, not yet wired):**
- `STRIPE_SECRET_KEY` - Stripe payments (server-only; must NOT use `NEXT_PUBLIC_` prefix)
- `SMTP_HOST` - Email SMTP host
- `SMTP_USER` - Email SMTP user
- `SMTP_PASS` - Email SMTP password

**Secrets location:**
- `.env.local` (gitignored) for local development
- Vercel environment variables dashboard for production
- Template documented in `.env.local.example`
- Rule: Never use `NEXT_PUBLIC_` prefix for server-only secrets

## Webhooks & Callbacks

**Incoming:**
- None detected

**Outgoing:**
- None detected

## Security Constraints (project rules)

Per `.claude/rules/security.md` and `.claude/rules/backend.md`:
- All new API routes must verify authentication before processing
- Supabase RLS acts as a second line of defense (not sole protection)
- Required security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: origin-when-cross-origin`, `Strict-Transport-Security`
- All user input validated server-side with Zod before database insertion
- Any RLS policy changes or auth flow changes require explicit user approval before implementation

---

*Integration audit: 2026-05-07*
