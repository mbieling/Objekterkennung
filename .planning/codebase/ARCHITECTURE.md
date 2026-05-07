<!-- refreshed: 2026-05-07 -->
# Architecture

**Analysis Date:** 2026-05-07

## System Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                    Next.js App Router                        │
│               `src/app/layout.tsx` + pages                  │
├──────────────────────────────────────────────────────────────┤
│                    Page Components                           │
│                   `src/app/page.tsx`                         │
└────────────────────────┬─────────────────────────────────────┘
                         │ uses
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                   UI Component Layer                         │
│              `src/components/ui/` (shadcn/ui)                │
│  Button, Card, Dialog, Input, Sidebar, Toast, ... (39 files) │
└────────────────────────┬─────────────────────────────────────┘
                         │ uses
         ┌───────────────┴───────────────┐
         ▼                               ▼
┌─────────────────┐            ┌──────────────────┐
│   Custom Hooks  │            │   Lib Utilities  │
│  `src/hooks/`   │            │   `src/lib/`     │
│  useIsMobile    │            │  utils.ts (cn)   │
│  useToast       │            │  supabase.ts     │
└─────────────────┘            └──────────────────┘
                                        │ (optional)
                                        ▼
                               ┌──────────────────┐
                               │   Supabase       │
                               │  (PostgreSQL +   │
                               │   Auth + Storage)│
                               └──────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| RootLayout | HTML shell, global CSS, metadata | `src/app/layout.tsx` |
| Home (page) | Application entry, default placeholder content | `src/app/page.tsx` |
| UI primitives | Reusable, accessible UI atoms (shadcn/ui) | `src/components/ui/*.tsx` |
| useIsMobile | Responsive breakpoint detection (768px) | `src/hooks/use-mobile.tsx` |
| useToast | Module-level toast state, dispatch, hook | `src/hooks/use-toast.ts` |
| cn utility | Tailwind class merging via clsx + tailwind-merge | `src/lib/utils.ts` |
| supabase client | Optional database/auth client (currently disabled) | `src/lib/supabase.ts` |

## Pattern Overview

**Overall:** Next.js App Router with shadcn/ui component primitives

**Key Characteristics:**
- File-system routing via `src/app/` directory (App Router convention)
- Server Components by default; client components opt-in with `"use client"` directive
- All UI built from shadcn/ui primitives — no custom recreations of existing components
- State managed locally with React `useState` / Context; no global state library
- Supabase wired in but disabled — exported as `null` placeholder until activated

## Layers

**App Layer:**
- Purpose: Pages, layouts, routing, metadata
- Location: `src/app/`
- Contains: `layout.tsx` (root layout), `page.tsx` (routes), `globals.css`
- Depends on: Components, hooks, lib
- Used by: Next.js runtime

**UI Component Layer:**
- Purpose: Accessible, styled UI primitives
- Location: `src/components/ui/`
- Contains: 39 shadcn/ui components (button, card, dialog, sidebar, toast, etc.)
- Depends on: `src/lib/utils.ts` (cn), Radix UI, class-variance-authority
- Used by: App pages, future feature components

**Hooks Layer:**
- Purpose: Reusable React logic extracted from components
- Location: `src/hooks/`
- Contains: `use-mobile.tsx` (breakpoint), `use-toast.ts` (notification state)
- Depends on: `src/components/ui/toast` (type imports only)
- Used by: UI components and pages

**Lib Layer:**
- Purpose: Shared utilities and external service clients
- Location: `src/lib/`
- Contains: `utils.ts` (cn helper), `supabase.ts` (DB client, currently null)
- Depends on: clsx, tailwind-merge, @supabase/supabase-js (inactive)
- Used by: All layers

## Data Flow

### Page Render Path

1. Next.js runtime matches route → `src/app/layout.tsx` wraps in HTML shell
2. `src/app/page.tsx` renders as Server Component (no client state)
3. shadcn/ui components in `src/components/ui/` render with Tailwind styling
4. `cn()` in `src/lib/utils.ts` merges class names at render time

### Toast Notification Flow

1. Any component calls `toast({ title, description })` from `src/hooks/use-toast.ts`
2. Module-level `dispatch()` updates `memoryState` and notifies all `listeners[]`
3. `useToast()` hook (subscribed component) re-renders with updated toast queue
4. `src/components/ui/toaster.tsx` renders visible toasts
5. Auto-dismiss scheduled via `setTimeout` in `addToRemoveQueue()`

### Responsive Layout Flow

1. Component imports `useIsMobile` from `src/hooks/use-mobile.tsx`
2. Hook uses `window.matchMedia` to detect viewport < 768px
3. Returns boolean; component conditionally renders mobile or desktop variant

**State Management:**
- No global state library; React `useState` and module-level variables used
- `use-toast.ts` uses a module-singleton pattern: `memoryState` + `listeners[]` array at module scope
- This means toast state persists across component mounts but resets on full page reload

## Key Abstractions

**shadcn/ui Components:**
- Purpose: Copy-paste UI primitives — owned in the repo, not a runtime dependency
- Examples: `src/components/ui/button.tsx`, `src/components/ui/dialog.tsx`, `src/components/ui/sidebar.tsx`
- Pattern: Built with Radix UI primitives + `cva` variants + `cn()` for class composition

**`cn()` Helper:**
- Purpose: Merge Tailwind classes safely, resolving conflicts
- Examples: Used throughout all `src/components/ui/*.tsx` files
- Pattern: `cn(...inputs: ClassValue[])` → `twMerge(clsx(inputs))`

**Feature Specs:**
- Purpose: Human-readable feature definitions driving the AI agent workflow
- Examples: `features/INDEX.md` tracks status for all features (PROJ-N)
- Pattern: Markdown files in `features/`, status updated by skills automatically

## Entry Points

**Application Root:**
- Location: `src/app/layout.tsx`
- Triggers: All page navigations; wraps every route
- Responsibilities: HTML document shell, `<body>`, global CSS, metadata export

**Home Page:**
- Location: `src/app/page.tsx`
- Triggers: HTTP GET `/`
- Responsibilities: Default placeholder; replace with actual feature UI

**Test Setup:**
- Location: `src/test/setup.ts`
- Triggers: Vitest before test files run
- Responsibilities: Imports `@testing-library/jest-dom` matchers globally

## Architectural Constraints

- **Rendering model:** Server Components by default; components using browser APIs (`window`, `document`, React hooks) must declare `"use client"` at the top
- **Global state:** `use-toast.ts` maintains module-level `memoryState` and `listeners[]` — these are singletons for the module lifetime; avoid importing toast logic in Server Components
- **Circular imports:** None detected; `lib/` is a leaf layer with no imports back to `components/` or `hooks/`
- **shadcn/ui rule:** Never recreate components that exist in `src/components/ui/`; install missing ones via `npx shadcn@latest add <name> --yes`
- **Supabase:** Client exported as `null` from `src/lib/supabase.ts` until env vars are provided; all consumers must guard against null before use
- **Path alias:** `@/*` resolves to `./src/*` (defined in `tsconfig.json`); always use this alias, never relative `../../` imports across layer boundaries

## Anti-Patterns

### Recreating installed shadcn/ui components

**What happens:** A developer writes a custom `<Button>` or `<Modal>` component from scratch
**Why it's wrong:** shadcn/ui versions already exist in `src/components/ui/` with full accessibility and variant support; duplicates cause style drift and maintenance burden
**Do this instead:** Import from `src/components/ui/button` — `import { Button } from "@/components/ui/button"`

### Using the Supabase client without null-guarding

**What happens:** Code calls `supabase.from(...)` directly
**Why it's wrong:** `supabase` is currently exported as `null` from `src/lib/supabase.ts`; this will throw at runtime
**Do this instead:** Check `if (supabase)` or activate the client by uncommenting `src/lib/supabase.ts` and providing env vars

### Skipping `"use client"` on hook-using components

**What happens:** A component uses `useState`, `useEffect`, or custom hooks without the directive
**Why it's wrong:** Next.js App Router treats components as Server Components by default; React hooks are not available there
**Do this instead:** Add `"use client"` as the first line of any file that uses React hooks or browser APIs

## Error Handling

**Strategy:** No centralized error boundary in place (starter template state)

**Patterns:**
- Toast notifications via `useToast` / `toast()` for user-facing feedback
- No try/catch wrapper at the page level
- Supabase responses should be checked with `.error` property per backend rules

## Cross-Cutting Concerns

**Logging:** No logging framework; browser console only
**Validation:** Zod planned (listed in stack); not yet applied in any source file
**Authentication:** Supabase Auth available but inactive; env vars required to enable
**Styling:** Tailwind CSS exclusively — no inline styles, no CSS modules (enforced by frontend rules)

---

*Architecture analysis: 2026-05-07*
