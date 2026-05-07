# Codebase Structure

**Analysis Date:** 2026-05-07

## Directory Layout

```
Objekterkennung/              # Project root
├── src/                      # All application source code
│   ├── app/                  # Next.js App Router pages & layouts
│   │   ├── globals.css       # Global Tailwind base styles
│   │   ├── layout.tsx        # Root HTML layout (wraps all routes)
│   │   └── page.tsx          # Home route (/)
│   ├── components/
│   │   └── ui/               # shadcn/ui primitives (39 components, never recreate)
│   ├── hooks/                # Custom React hooks
│   │   ├── use-mobile.tsx    # Responsive breakpoint detection
│   │   └── use-toast.ts      # Toast notification state
│   ├── lib/                  # Utilities and external clients
│   │   ├── supabase.ts       # Supabase client (inactive; null export)
│   │   └── utils.ts          # cn() Tailwind class-merge helper
│   └── test/
│       └── setup.ts          # Vitest global test setup
├── features/                 # Feature specification markdown files
│   ├── INDEX.md              # Feature status tracker (PROJ-N → status)
│   └── README.md             # Features directory guide
├── docs/                     # Project documentation
│   ├── PRD.md                # Product Requirements Document
│   └── production/           # Production operations guides
├── public/                   # Static assets served at root
├── .claude/                  # AI agent skill definitions
│   ├── skills/               # Skill subdirectories (architecture, backend, frontend, qa, ...)
│   │   └── */SKILL.md        # Skill entry point (~130 lines each)
│   └── rules/                # Cross-cutting rule files (frontend.md, backend.md, security.md)
├── .planning/
│   └── codebase/             # Codebase analysis documents (this directory)
├── CLAUDE.md                 # Project conventions and workflow reference
├── next.config.ts            # Next.js configuration
├── tailwind.config.ts        # Tailwind theme and plugin config
├── tsconfig.json             # TypeScript config; defines `@/*` → `./src/*` alias
├── vitest.config.ts          # Vitest unit test config
├── playwright.config.ts      # Playwright E2E test config
├── components.json           # shadcn/ui CLI configuration
├── package.json              # Dependencies and npm scripts
└── .env.local.example        # Required env var documentation (safe to commit)
```

## Directory Purposes

**`src/app/`:**
- Purpose: Next.js App Router file-system routing
- Contains: `layout.tsx` (root shell), `page.tsx` (route components), `globals.css`
- Key files: `src/app/layout.tsx` (always rendered), `src/app/page.tsx` (home route)
- Adding new routes: create `src/app/<route-name>/page.tsx`

**`src/components/ui/`:**
- Purpose: shadcn/ui copy-paste primitives — fully owned in the repo
- Contains: 39 pre-installed components (button, card, dialog, sidebar, toast, etc.)
- Key files: `src/components/ui/button.tsx`, `src/components/ui/sidebar.tsx`
- Do NOT edit these unless fixing bugs; install missing ones with `npx shadcn@latest add <name> --yes`

**`src/hooks/`:**
- Purpose: Reusable React logic with no UI rendering
- Contains: `use-mobile.tsx` (viewport detection), `use-toast.ts` (notification state)
- Key files: `src/hooks/use-toast.ts` (module-singleton pattern)

**`src/lib/`:**
- Purpose: Leaf-layer utilities and external service clients
- Contains: `utils.ts` (cn helper), `supabase.ts` (DB client stub)
- Key files: `src/lib/utils.ts` (imported by virtually every UI component)

**`src/test/`:**
- Purpose: Global test infrastructure
- Contains: `setup.ts` (jest-dom matchers for Vitest)
- Generated: No — manually maintained

**`features/`:**
- Purpose: AI agent workflow — feature specifications and status tracking
- Contains: `INDEX.md` (status table), per-feature `PROJ-N-name.md` files
- Key files: `features/INDEX.md` (must be updated when features progress)

**`docs/`:**
- Purpose: Product and operational documentation
- Contains: `PRD.md`, production guides
- Generated: No — manually maintained

**`.claude/skills/`:**
- Purpose: AI agent skill definitions for the development workflow
- Contains: Subdirectories for `architecture`, `backend`, `deploy`, `frontend`, `help`, `qa`, `requirements`
- Each skill: `SKILL.md` (entry point) + `rules/*.md` (detailed rules)
- Generated: No — project-specific agent configuration

**`public/`:**
- Purpose: Static assets served from the web root (`/filename`)
- Contains: SVG icons (next.svg, vercel.svg, file.svg, window.svg, globe.svg)
- Generated: No

## Key File Locations

**Entry Points:**
- `src/app/layout.tsx`: Root HTML layout — wraps all routes
- `src/app/page.tsx`: Home route `/` — replace placeholder content here

**Configuration:**
- `tsconfig.json`: TypeScript settings; defines `@/*` path alias
- `tailwind.config.ts`: Tailwind theme tokens and plugins
- `next.config.ts`: Next.js build and runtime configuration
- `components.json`: shadcn/ui CLI config (style, aliases, icon library)
- `vitest.config.ts`: Unit test runner configuration
- `playwright.config.ts`: E2E test runner configuration
- `.env.local.example`: Template for required environment variables

**Core Logic:**
- `src/lib/utils.ts`: `cn()` — used by all UI components for class merging
- `src/lib/supabase.ts`: Supabase client — activate by uncommenting and providing env vars
- `src/hooks/use-toast.ts`: Toast system — call `toast()` anywhere for notifications

**Testing:**
- `src/test/setup.ts`: Global Vitest setup (jest-dom matchers)
- Unit tests: Co-located next to source files (e.g., `useHook.test.ts` beside `useHook.ts`)
- E2E tests: Place in `tests/` directory at project root

## Naming Conventions

**Files:**
- Pages and layouts: `page.tsx`, `layout.tsx` (Next.js convention, lowercase)
- Components: `kebab-case.tsx` (e.g., `alert-dialog.tsx`, `navigation-menu.tsx`)
- Hooks: `use-kebab-case.tsx` or `use-kebab-case.ts` (e.g., `use-mobile.tsx`, `use-toast.ts`)
- Utilities: `kebab-case.ts` (e.g., `utils.ts`, `supabase.ts`)
- Tests: `<source-file-name>.test.ts` co-located with source

**Directories:**
- Source code: `kebab-case/` (e.g., `components/ui/`)
- Features: No subdirectory — flat `features/PROJ-N-name.md` files
- Skills: Single-word lowercase (e.g., `architecture`, `frontend`, `backend`)

## Where to Add New Code

**New Page/Route:**
- Create: `src/app/<route-name>/page.tsx`
- Layout override: `src/app/<route-name>/layout.tsx`

**New Feature Component:**
- Composed from shadcn/ui: Create `src/components/<feature-name>.tsx`
- Must use shadcn/ui primitives from `src/components/ui/` — no custom reimplementations
- Business logic: Extract into a hook in `src/hooks/use-<feature-name>.ts`

**New API Route:**
- Create: `src/app/api/<resource>/route.ts`
- Validate inputs with Zod, verify Supabase session, return typed JSON responses

**New Custom Hook:**
- Place: `src/hooks/use-<name>.ts` (or `.tsx` if JSX returned)
- Must not import from `src/app/` — hooks are consumed by pages, not the reverse

**New Utility:**
- Shared helpers: `src/lib/<name>.ts`
- Must not import from `src/components/`, `src/hooks/`, or `src/app/`

**Missing shadcn/ui Component:**
- Run: `npx shadcn@latest add <component-name> --yes`
- Result lands in `src/components/ui/` automatically

**New Feature Spec:**
- Create: `features/PROJ-N-<name>.md`
- Register: Add row to `features/INDEX.md` with status "Planned"

## Special Directories

**`.planning/codebase/`:**
- Purpose: GSD codebase analysis documents (ARCHITECTURE.md, STRUCTURE.md, etc.)
- Generated: Yes — by `/gsd-map-codebase` agent command
- Committed: Yes — serves as reference for other GSD planning commands

**`.claude/`:**
- Purpose: AI agent skill and rule definitions
- Generated: No — hand-authored project configuration
- Committed: Yes — defines the development workflow for all contributors using Claude

**`.next/`:**
- Purpose: Next.js build output and cache
- Generated: Yes — by `npm run build` and `npm run dev`
- Committed: No — in `.gitignore`

**`node_modules/`:**
- Purpose: Installed npm packages
- Generated: Yes — by `npm install`
- Committed: No — in `.gitignore`

---

*Structure analysis: 2026-05-07*
