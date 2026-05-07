# Coding Conventions

**Analysis Date:** 2026-05-07

## Naming Patterns

**Files:**
- React components: PascalCase filename matching exported component name (`button.tsx` → `Button`, `card.tsx` → `Card`, `use-mobile.tsx` → `useIsMobile`)
- shadcn/ui components: kebab-case filenames in `src/components/ui/` (e.g., `alert-dialog.tsx`, `dropdown-menu.tsx`)
- Hooks: `use-` prefix with kebab-case filename (`use-mobile.tsx`, `use-toast.ts`)
- Utilities: lowercase descriptive names (`utils.ts`, `supabase.ts`)
- Pages: Next.js App Router convention (`page.tsx`, `layout.tsx`)
- E2E tests: `PROJ-X-feature-name.spec.ts` in `tests/` directory

**Functions/Components:**
- React components: PascalCase (`Button`, `Card`, `CardHeader`, `RootLayout`)
- Hooks: camelCase with `use` prefix (`useIsMobile`, `useToast`, `useFormField`)
- Utility functions: camelCase (`cn`, `genId`, `addToRemoveQueue`)
- Event handlers: camelCase (`onChange`, `onOpenChange`)

**Variables/Constants:**
- Regular variables: camelCase (`memoryState`, `toastTimeouts`, `buttonVariants`)
- Module-level constants: UPPER_SNAKE_CASE (`MOBILE_BREAKPOINT`, `TOAST_LIMIT`, `TOAST_REMOVE_DELAY`)
- Action type objects: UPPER_SNAKE_CASE values (`ADD_TOAST`, `UPDATE_TOAST`)

**Types/Interfaces:**
- Interfaces: PascalCase with `Props` suffix for component props (`ButtonProps`, `State`)
- Type aliases: PascalCase (`Action`, `Toast`, `ActionType`, `ToasterToast`)
- Generic constraints: short descriptive names (`TFieldValues`, `TName`)

**Feature IDs:**
- Sequential `PROJ-X` format (e.g., `PROJ-1`, `PROJ-2`) used in commit messages and spec filenames

## Code Style

**Formatting:**
- No Prettier config detected — formatting is informal/not enforced by tooling
- Indentation: 2 spaces (observed throughout)
- Quotes: double quotes for JSX attributes and TypeScript strings
- Trailing commas: present in multi-line objects and arrays
- Semicolons: omitted in most files (shadcn/ui pattern)

**Linting:**
- ESLint via `next/core-web-vitals` preset (`/.eslintrc.json`)
- Run: `npm run lint`
- Rules: Next.js best practices (no custom rule overrides)

**TypeScript:**
- `strict: true` enforced in `tsconfig.json`
- `noEmit: true` (type-checking only, no output files)
- `isolatedModules: true`

## Import Organization

**Order:**
1. React and framework imports (`import * as React from "react"`, `import type { Metadata } from "next"`)
2. Third-party library imports (`import { Slot } from "@radix-ui/react-slot"`, `import { cva } from "class-variance-authority"`)
3. Internal path-aliased imports (`import { cn } from "@/lib/utils"`, `import { Label } from "@/components/ui/label"`)

**Path Aliases:**
- `@/` maps to `src/` (configured in `tsconfig.json` and `vitest.config.ts`)
- Use `@/components/ui/button` not `../../components/ui/button`

**Import patterns for shadcn/ui:**
```tsx
import { Button } from "@/components/ui/button"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
```

**Type-only imports:**
```tsx
import type { Metadata } from "next"
import type { ClassValue } from "clsx"
```

## Component Design

**shadcn/ui First (mandatory):**
- Before creating any UI component, check `src/components/ui/` for an existing shadcn component
- Never recreate: Button, Input, Select, Checkbox, Switch, Dialog, Alert, Toast, Table, Tabs, Card, Badge, Dropdown, Popover, Tooltip, Navigation, Sidebar, Breadcrumb
- Install missing shadcn components: `npx shadcn@latest add <name> --yes`
- Custom components are compositions of shadcn primitives only

**Component structure pattern (shadcn/ui style):**
```tsx
import * as React from "react"
import { cn } from "@/lib/utils"

const ComponentName = React.forwardRef<HTMLElement, ComponentProps>(
  ({ className, ...props }, ref) => (
    <element
      ref={ref}
      className={cn("base-classes", className)}
      {...props}
    />
  )
)
ComponentName.displayName = "ComponentName"

export { ComponentName }
```

**Props:**
- Use TypeScript interfaces for all component props
- Extend HTML element attributes where appropriate (`React.ButtonHTMLAttributes<HTMLButtonElement>`)
- Use `VariantProps` from `class-variance-authority` for variant-based props
- `asChild` pattern via Radix `Slot` for polymorphic components

**Styling:**
- Tailwind CSS exclusively — no inline styles, no CSS modules
- Use `cn()` utility from `src/lib/utils.ts` to merge Tailwind classes
- CSS custom properties for theming (e.g., `hsl(var(--primary))`)
- `class-variance-authority` (cva) for variant-based styling (see `src/components/ui/button.tsx`)
- Responsive: mobile (375px), tablet (768px), desktop (1440px)
- Dark mode: `darkMode: ["class"]` via Tailwind config

**Client components:**
- Add `"use client"` directive at top of file when using React hooks or browser APIs
- Hooks-based files like `src/hooks/use-toast.ts` use `"use client"`

## State Management

**Approach:** React `useState` / Context API — no external state library
- Local component state: `useState`
- Shared state: custom hooks that expose state + dispatch (see `src/hooks/use-toast.ts` reducer pattern)
- No Redux, Zustand, or Jotai

**Reducer pattern (for complex state):**
```ts
export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST": return { ...state, toasts: [...] }
    // ...
  }
}
```

## Error Handling

**Frontend rules (from `.claude/rules/backend.md` and skill docs):**
- Validate all inputs using Zod schemas before processing
- Always check authentication: verify user session exists before using session data
- Use `window.location.href` for post-login redirects (not `router.push`)
- Always verify `data.session` exists before redirecting
- Always reset loading state in ALL code paths (success, error, finally blocks)
- Return meaningful HTTP status codes from API routes

**Supabase errors:**
- Always handle errors from Supabase responses explicitly (check `.error` property)

**Component-level errors:**
- Form validation errors surfaced via `react-hook-form` + Zod resolver
- Toast notifications for user-facing errors via `src/hooks/use-toast.ts`

## Logging

**Framework:** No dedicated logging library — browser `console` only
**Patterns:** No enforced logging conventions observed; rely on error boundaries and toast notifications for user-facing feedback

## Comments

**Usage observed:**
- Inline comments explain non-obvious intent: `// ! Side effects ! - This could be extracted...`
- File-level comments for placeholder code: `// Supabase Client Setup` with commented-out block
- JSDoc/TSDoc not observed in codebase

## Module Design

**Exports:**
- Named exports preferred for utilities and component sub-parts: `export { Button, buttonVariants }`
- Default exports for Next.js pages and layouts: `export default function Home()`
- Named function exports for hooks: `export { useToast, toast }`

**Barrel Files:**
- Not used — import directly from component files

## Commit Message Format

```
feat(PROJ-X): Implement frontend for [feature name]
fix(PROJ-X): description
test(PROJ-X): Add QA test results for [feature name]
```

---

*Convention analysis: 2026-05-07*
