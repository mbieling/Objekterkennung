# Testing Patterns

**Analysis Date:** 2026-05-07

## Test Framework

**Unit/Integration Runner:**
- Vitest 4.x
- Config: `vitest.config.ts`

**E2E Runner:**
- Playwright 1.x
- Config: `playwright.config.ts`

**Assertion Library:**
- Vitest built-in `expect`
- `@testing-library/jest-dom` matchers (imported via `src/test/setup.ts`)
- `@testing-library/react` for React component rendering

**Run Commands:**
```bash
npm test                  # Run all Vitest unit tests (once)
npm run test:watch        # Vitest in watch mode
npm run test:e2e          # Run all Playwright E2E tests
npm run test:e2e:ui       # Playwright with interactive UI
npm run test:all          # Both Vitest + Playwright
```

## Test File Organization

**Unit/Integration Tests — Co-located:**
- Location: Next to the source file being tested
- Naming: `<source-file>.test.ts` or `<source-file>.test.tsx`
- Examples:
  - `src/hooks/useFeature.ts` → `src/hooks/useFeature.test.ts`
  - `src/lib/utils.ts` → `src/lib/utils.test.ts`

**E2E Tests — Separate directory:**
- Location: `tests/` at project root (configured via `playwright.config.ts`: `testDir: './tests'`)
- Naming: `PROJ-X-feature-name.spec.ts`
- Example: `tests/PROJ-1-authentication.spec.ts`

**Test Setup:**
- `src/test/setup.ts` — runs before all Vitest tests, imports `@testing-library/jest-dom`

```
project-root/
├── src/
│   ├── hooks/
│   │   ├── use-toast.ts
│   │   └── use-toast.test.ts    ← co-located unit test
│   ├── lib/
│   │   ├── utils.ts
│   │   └── utils.test.ts        ← co-located unit test
│   └── test/
│       └── setup.ts             ← global Vitest setup
└── tests/
    └── PROJ-X-feature-name.spec.ts  ← Playwright E2E tests
```

## Test Structure

**Vitest Suite Organization:**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'

describe('ComponentName or hookName', () => {
  beforeEach(() => {
    // reset mocks, clear state
  })

  it('should handle the happy path', () => {
    // arrange
    // act
    // assert
  })

  it('should handle error paths and edge cases', () => {
    // test error/empty/corrupt input states
  })
})
```

**What to unit test (from `qa/SKILL.md`):**
- Custom hooks with non-trivial logic (e.g., localStorage read/write, error fallback)
- Pure utility/transformation functions (e.g., reorder logic, data transformation)
- Form validation logic (if extracted from components)
- Reducer functions (e.g., `reducer` in `src/hooks/use-toast.ts`)

**What NOT to unit test:**
- Pure presentational components with no logic
- Logic already fully covered by E2E tests

**Patterns:**
- Test happy path + error paths + edge cases (corrupt input, empty state)
- One `test()` / `it()` per discrete behavior
- Prefer descriptive test names: `"should dismiss toast when toastId is provided"`

## Vitest Configuration

**Environment:** `jsdom` (browser-like DOM for React component testing)

**Globals:** `true` — `describe`, `it`, `expect`, `vi` available without import in test files

**Path alias:** `@/` → `src/` (matches `tsconfig.json`)

**Setup file:** `src/test/setup.ts` runs before each test file

```ts
// vitest.config.ts
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: { '@': resolve(__dirname, './src') },
  },
})
```

## Playwright Configuration

**Base URL:** `http://localhost:3000`

**Parallelism:** `fullyParallel: true`

**CI behavior:**
- `forbidOnly: true` in CI (prevents `.only` from blocking CI)
- `retries: 2` in CI, `0` locally

**Browsers tested:**
- Chromium (Desktop Chrome)
- Mobile Safari (iPhone 13)

**Traces:** `on-first-retry` (saves trace on flaky tests for debugging)

**Web server:** Auto-starts `npm run dev` if not already running (skipped in CI via `reuseExistingServer`)

## Mocking

**Framework:** Vitest built-in `vi`

**Mock only external dependencies:**
- `localStorage` (for hooks that persist state)
- `fetch` / API calls
- Browser globals (`window.matchMedia`, `window.innerWidth`)

Do NOT mock internal application logic — test actual behavior.

**Patterns:**
```typescript
// Mock browser API
vi.stubGlobal('localStorage', {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
})

// Mock a module
vi.mock('@/lib/supabase', () => ({
  supabase: { from: vi.fn() }
}))

// Spy on a function
const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
```

## Fixtures and Test Data

**Test Data:**
- No shared fixture files detected — construct inline in each test
- For hooks that use localStorage, mock the storage in `beforeEach`

**Location:**
- No dedicated `fixtures/` or `factories/` directory exists yet

## Coverage

**Requirements:** None enforced (no coverage thresholds configured in `vitest.config.ts`)

**View Coverage:**
```bash
npx vitest run --coverage
```

## Test Types

**Unit Tests (Vitest):**
- Scope: Individual hooks, utility functions, reducers
- Approach: Co-located files, jsdom environment, `@testing-library/react` for hooks
- Run: `npm test`

**Integration Tests (Vitest):**
- Scope: API route handlers, Supabase query logic
- Approach: Mock Supabase client; test request → response chain
- Run: `npm test`

**E2E Tests (Playwright):**
- Scope: Full user acceptance criteria flows in real browser
- Location: `tests/PROJ-X-feature-name.spec.ts`
- Each test covers exactly one acceptance criterion
- Tests are written after manual QA confirmation (passing AC only)
- Run: `npm run test:e2e`

**No visual regression testing** — not configured.

## E2E Test Structure

```typescript
// tests/PROJ-1-feature-name.spec.ts
import { test, expect } from '@playwright/test'

test('AC-1: User can [acceptance criterion description]', async ({ page }) => {
  await page.goto('/')
  // user journey steps
  await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible()
})

test('AC-2: [Next criterion]', async ({ page }) => {
  // ...
})
```

## Common Patterns

**Async Testing (Vitest):**
```typescript
it('should fetch data', async () => {
  const result = await someAsyncFunction()
  expect(result).toEqual(expected)
})
```

**Error Testing:**
```typescript
it('should throw when used outside provider', () => {
  expect(() => useFormField()).toThrow('useFormField should be used within <FormField>')
})
```

**Hook Testing:**
```typescript
import { renderHook, act } from '@testing-library/react'

it('should update state', () => {
  const { result } = renderHook(() => useIsMobile())
  expect(result.current).toBe(false)
})
```

**Reducer Testing (pure function — no mocking needed):**
```typescript
import { reducer } from '@/hooks/use-toast'

it('should add a toast', () => {
  const initial = { toasts: [] }
  const next = reducer(initial, { type: 'ADD_TOAST', toast: mockToast })
  expect(next.toasts).toHaveLength(1)
})
```

## QA Workflow Integration

The QA skill (`/.claude/skills/qa/SKILL.md`) defines the full testing workflow:
1. Run existing automated tests first (`npm test`, `npm run test:e2e`)
2. Manual browser testing of all acceptance criteria
3. Security audit (auth bypass, XSS, authorization)
4. Write Vitest unit tests for non-trivial hooks and utilities
5. Write Playwright E2E tests for each passing acceptance criterion
6. Document results in the feature spec file using the template at `/.claude/skills/qa/test-template.md`

Test results are documented in the feature spec (`features/PROJ-X-name.md`) — never in a separate file.

---

*Testing analysis: 2026-05-07*
