# Technology Stack

**Analysis Date:** 2026-05-07

## Languages

**Primary:**
- TypeScript 5.x - All source files (`src/**/*.ts`, `src/**/*.tsx`)

**Secondary:**
- CSS (via Tailwind utility classes) - `src/app/globals.css`

## Runtime

**Environment:**
- Node.js 25.6.0 (current runtime; no `.nvmrc` pinning present)

**Package Manager:**
- npm (default)
- Lockfile: `package-lock.json` present

## Frameworks

**Core:**
- Next.js ^16.1.1 - Full-stack React framework; App Router with RSC enabled (`components.json`: `"rsc": true`)
- React ^19.0.0 - UI rendering
- React DOM ^19.0.0 - DOM bindings

**Styling:**
- Tailwind CSS ^3.4.1 - Utility-first CSS; configured at `tailwind.config.ts`
- PostCSS ^8 - CSS processing; configured at `postcss.config.mjs`
- `class-variance-authority` ^0.7.1 - Variant-based component styles
- `tailwind-merge` ^2.2.0 - Merge conflicting Tailwind classes
- `clsx` ^2.1.0 - Conditional class composition
- `next-themes` ^0.4.6 - Dark/light mode theming

**UI Component Library:**
- shadcn/ui (style: `default`, base color: `slate`) - Component primitives installed at `src/components/ui/`
- Radix UI primitives (multiple packages ^1.x–^2.x) - Accessible unstyled headless components underlying shadcn/ui
- `lucide-react` ^0.562.0 - Icon set
- `cmdk` ^1.1.1 - Command palette primitive
- `sonner` ^2.0.7 - Toast notifications

**Forms & Validation:**
- `react-hook-form` ^7.71.1 - Form state management
- `@hookform/resolvers` ^5.2.2 - Schema resolver bridge (Zod)
- `zod` ^4.3.5 - Runtime schema validation (server input validation mandatory per project rules)

**Testing:**
- Vitest ^4.1.2 - Unit/component test runner; configured at `vitest.config.ts`; jsdom environment
- `@testing-library/react` ^16.3.2 - Component testing utilities
- `@testing-library/jest-dom` ^6.9.1 - DOM matchers
- `jsdom` ^29.0.1 - Browser-like DOM for unit tests
- `@vitejs/plugin-react` ^6.0.1 - Vite/Vitest React plugin
- Playwright ^1.58.2 - E2E testing; configured at `playwright.config.ts`; targets Chromium + Mobile Safari

**Build/Dev:**
- Vite (via Vitest) - Test bundling
- Next.js build pipeline - Production build (`npm run build`)
- ESLint ^9 - Linting; config at `.eslintrc.json` (`extends: next/core-web-vitals`)

## Key Dependencies

**Critical:**
- `next` ^16.1.1 - Framework; all routing, SSR, RSC, API routes
- `react` ^19.0.0 - UI runtime
- `@supabase/supabase-js` ^2.39.3 - Backend-as-a-service client (currently commented out in `src/lib/supabase.ts`; placeholder exports `null`)
- `zod` ^4.3.5 - Mandatory server-side input validation per project rules

**Infrastructure:**
- `tailwindcss` ^3.4.1 - Required for all component styling; no inline styles or CSS modules used
- `typescript` ^5 - Type checking across entire codebase

## Configuration

**Environment:**
- Local dev: `.env.local` (gitignored; not read)
- Template: `.env.local.example` documents required vars:
  - `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Supabase public anon key
- Only `NEXT_PUBLIC_` prefixed vars are safe to expose in browser

**TypeScript:**
- `tsconfig.json` - strict mode on; target ES2017; module resolution: bundler; path alias `@/*` → `./src/*`

**Build:**
- `next.config.ts` - Minimal config (no custom options set)
- `tailwind.config.ts` - Custom theme tokens (colors via CSS variables, border radius, sidebar palette, accordion keyframes)
- `components.json` - shadcn/ui CLI config (style: default, base color: slate, CSS variables: true)

**Testing:**
- `vitest.config.ts` - jsdom environment, globals: true, setup file: `src/test/setup.ts`, path alias `@` → `./src`
- `playwright.config.ts` - Base URL `http://localhost:3000`; Chromium + Mobile Safari; test dir `./tests`; HTML reporter

## Platform Requirements

**Development:**
- Node.js (≥20 inferred from `@types/node ^20`)
- npm (lockfile present)
- Playwright browsers require one-time install: `npx playwright install chromium`

**Production:**
- Vercel (intended deployment target per skill docs and default `public/vercel.svg` asset)
- Supabase for backend/database (configured but not yet activated)

---

*Stack analysis: 2026-05-07*
