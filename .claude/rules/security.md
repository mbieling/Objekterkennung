---
paths:
  - "src/app/api/**"
  - ".env*"
  - "next.config.*"
---

# Security Rules

## Secrets Management
- NEVER commit secrets, API keys, or credentials to git
- Use `.env.local` for local development (already in .gitignore)
- Use `NEXT_PUBLIC_` prefix ONLY for values safe to expose in browser
- Document all required env vars in `.env.local.example` with dummy values

## Input Validation
- Validate ALL user input on the server side with Zod
- Never trust client-side validation alone
- Sanitize data before database insertion

## API Security
- Kein direkter Client-Zugriff auf DB — alle DB-Operationen nur über Next.js API-Routen (server-only)
- Worker-Endpunkte (Port 8000) sind intern — nicht öffentlich exponieren
- Rate Limiting auf Upload- und Search-Endpunkten beachten

## Security Headers
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: origin-when-cross-origin
- Strict-Transport-Security with includeSubDomains

## Code Review Triggers
- Any new environment variables must be documented in .env.local.example
