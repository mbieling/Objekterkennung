# Codebase Concerns

**Analysis Date:** 2026-05-07

## Tech Debt

**Supabase Client is a Null Placeholder:**
- Issue: The Supabase client in `src/lib/supabase.ts` is entirely commented out and exports `null` as a placeholder. Any code that imports `supabase` and calls methods on it will throw a runtime TypeError.
- Files: `src/lib/supabase.ts`
- Impact: No database, authentication, or storage functionality works. Any future feature that imports `supabase` and calls `.from()`, `.auth`, or similar will crash at runtime without a clear error message.
- Fix approach: Uncomment the `createClient` block, ensure `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are present in `.env.local`, and remove the `export const supabase = null` line. Then wire up a proper type-safe client as described in `docs/production/`.

**Homepage is Unmodified Next.js Scaffold:**
- Issue: `src/app/page.tsx` is the boilerplate `create-next-app` default page with Vercel/Next.js branding, UTM-tracked external links, and instructions to "get started by editing this file." No application-specific UI or logic exists.
- Files: `src/app/page.tsx`
- Impact: The deployed app shows the Next.js starter template, not the actual product described in `docs/PRD.md`. PRD itself contains only placeholder text with no vision, features, or metrics filled in.
- Fix approach: Replace the scaffold content with actual application UI. Fill in `docs/PRD.md` with real product requirements before building features.

**PRD Contains No Real Content:**
- Issue: `docs/PRD.md` has template placeholders (_"Describe what you are building"_, _"Feature 1"_, _"Feature 2"_) and no actual product definition.
- Files: `docs/PRD.md`
- Impact: Feature planning (`features/INDEX.md` shows zero features) and architecture decisions cannot be made. All downstream planning tools that reference `docs/PRD.md` via `@docs/PRD.md` in `CLAUDE.md` receive empty context.
- Fix approach: Complete the PRD sections (Vision, Target Users, Core Features, Success Metrics, Constraints) before running any `/requirements` or `/architecture` skill workflows.

**Non-functional Fonts in Layout:**
- Issue: `src/app/layout.tsx` references `var(--font-geist-sans)` and `var(--font-geist-mono)` CSS custom properties that are never defined. The `next/font` setup for Geist fonts (present in the default scaffold) has been removed, so these variables resolve to nothing.
- Files: `src/app/layout.tsx`, `src/app/globals.css`
- Impact: Typography fallbacks to browser defaults silently; no visual error. When the real application UI is built, all text using these font variables will render in the wrong typeface.
- Fix approach: Either add `import { Geist, Geist_Mono } from "next/font/google"` with the CSS variable configuration back into `layout.tsx`, or remove the `font-[family-name:var(--font-geist-sans)]` class from `page.tsx` and define a different font strategy.

## Security Considerations

**Security Headers Not Implemented:**
- Risk: The app ships with no HTTP security headers. It is vulnerable to clickjacking, MIME sniffing, and mixed-content attacks.
- Files: `next.config.ts` (currently empty config object)
- Current mitigation: None. Documentation exists in `docs/production/security-headers.md` describing the exact headers needed, but they are not applied.
- Recommendations: Add the `async headers()` block documented in `docs/production/security-headers.md` to `next.config.ts` before any deployment. Required headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: origin-when-cross-origin`, `Strict-Transport-Security`.

**Non-null Assertion on Env Vars (Latent Risk):**
- Risk: The commented-out Supabase setup uses `process.env.NEXT_PUBLIC_SUPABASE_URL!` and `process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!` with non-null assertions. If the env vars are missing at runtime, the client is created with `undefined` URLs and will silently fail or send requests to malformed endpoints rather than throwing a clear error.
- Files: `src/lib/supabase.ts` (lines 7-8, currently commented)
- Current mitigation: Code is commented out so not active.
- Recommendations: When uncommenting, replace `!` assertions with explicit runtime checks and throw a descriptive startup error if env vars are absent. Example: `if (!process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')`.

**No Rate Limiting:**
- Risk: No rate limiting exists on any route. Authentication endpoints (once built) will be open to brute-force attacks. Public API routes will have no abuse protection.
- Files: No `middleware.ts` exists; no `src/lib/rate-limit.ts` exists.
- Current mitigation: None. Guidance is documented in `docs/production/rate-limiting.md` but not implemented.
- Recommendations: Implement Upstash Redis rate limiting as documented in `docs/production/rate-limiting.md` before launching authentication or any public-facing API endpoints.

**No Error Tracking:**
- Risk: Production errors are invisible. There is no Sentry or equivalent integration.
- Files: No `sentry.client.config.ts` or `sentry.server.config.ts` exist.
- Current mitigation: None. Documentation exists in `docs/production/error-tracking.md`.
- Recommendations: Run `npx @sentry/wizard@latest -i nextjs` and configure DSN before first production deployment.

## Test Coverage Gaps

**Zero Test Files Exist:**
- What's not tested: Everything. No unit tests, no integration tests, no E2E tests.
- Files: The `src/test/setup.ts` exists (only imports `@testing-library/jest-dom`) but no actual test files (`*.test.ts`, `*.spec.ts`) exist anywhere in `src/`. The `tests/` directory for Playwright E2E tests does not exist.
- Risk: Any implementation can be broken silently. The configured test infrastructure (Vitest + Playwright) is ready but unused.
- Priority: High — tests must be written alongside features per `CLAUDE.md` convention: "Unit tests co-located next to source files".

**Test Infrastructure Partially Configured:**
- What's not tested: Playwright E2E tests reference `./tests` directory in `playwright.config.ts` but that directory does not exist. Running `npm run test:e2e` will error immediately.
- Files: `playwright.config.ts`, missing `tests/` directory
- Risk: CI pipelines running `npm run test:all` will fail on the E2E step.
- Priority: Medium — create `tests/` directory with at minimum a smoke test before CI is enabled.

## Missing Critical Features

**No Application Code Exists:**
- Problem: The entire `src/app/` directory contains only the boilerplate scaffold. No feature implementation, API routes, custom components, hooks (beyond the template `use-mobile.tsx` and `use-toast.ts`), or business logic exists.
- Blocks: Nothing production-relevant can be shipped. The features index (`features/INDEX.md`) shows zero features tracked.

**No API Routes:**
- Problem: No `src/app/api/` directory or any server-side route handlers exist.
- Blocks: Backend functionality, data mutations, and any server-side integration (Supabase operations that require server-side auth, webhooks, etc.) cannot be built without this layer.

**No Authentication Flow:**
- Problem: Despite `@supabase/supabase-js` being installed as a dependency and auth patterns being documented in `.claude/rules/frontend.md`, no auth pages, middleware, or session management exist.
- Blocks: Any user-specific features, protected routes, or RLS-backed database access.

## Fragile Areas

**`src/lib/supabase.ts` Exports `null`:**
- Files: `src/lib/supabase.ts`
- Why fragile: Any module that imports `supabase` and calls a method on it will throw `TypeError: Cannot read properties of null` at the call site. This is a runtime error with no TypeScript warning because the export type is `null`.
- Safe modification: Do not import `supabase` from this file in any feature code until the client is properly initialized. When uncommenting, add env var validation before `createClient()` is called.
- Test coverage: None.

**Unresolved CSS Font Variables:**
- Files: `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`
- Why fragile: CSS variable `--font-geist-sans` is referenced in `page.tsx` class `font-[family-name:var(--font-geist-sans)]` but never defined. The Tailwind class will emit a CSS value that resolves to nothing, causing silent font fallback.
- Safe modification: Either define the CSS variable in `globals.css` or remove the Tailwind class reference entirely.

## Dependencies at Risk

**`next` Version Pinned to `^16.1.1`:**
- Risk: `package.json` specifies `"next": "^16.1.1"` but the `devDependencies` for `eslint-config-next` pins `"16.1.1"` exactly. As Next.js releases patch versions, a mismatch between the runtime and ESLint config version may cause lint failures or config warnings.
- Impact: Potential lint CI failures after `npm install` pulls a newer minor of Next.js while `eslint-config-next` stays at `16.1.1`.
- Migration plan: Keep both `next` and `eslint-config-next` versions in sync. Use `npm run lint` after any dependency update to catch mismatches early.

**`@hookform/resolvers` at `^5.2.2` with `react-hook-form` at `^7.x`:**
- Risk: `@hookform/resolvers` v5 is a major version that may have breaking API changes relative to the `react-hook-form` v7 resolver integration. If the resolver API surface changed, any form that uses Zod schemas via `zodResolver` will silently fail validation or throw at runtime.
- Impact: All future form implementations using `react-hook-form` + `zodResolver`.
- Migration plan: Verify resolver compatibility in a test form before building production forms.

---

*Concerns audit: 2026-05-07*
