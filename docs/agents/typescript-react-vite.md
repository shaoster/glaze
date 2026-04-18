# TypeScript + React + Vite Guide

## Scaffolding a new project

```bash
# Create Vite + React + TypeScript project
npm create vite@latest web -- --template react-ts
cd web
npm install

# Add MUI (with Emotion peer deps)
npm install @mui/material @emotion/react @emotion/styled

# Add Axios and React Router
npm install axios react-router-dom

# Start dev server
npm run dev
```

Enable stricter TypeScript flags in `tsconfig.json` (`compilerOptions`):
```json
"noUnusedLocals": true,
"noUnusedParameters": true,
"noFallthroughCasesInSwitch": true
```

## Stack

React, TypeScript (strict), Vite, Material UI (MUI), Axios

## Architecture

This is a Single Page Application (SPA). Routing is handled client-side via React Router (`RouterProvider` with a data router) mounted in the top-level `App` component. There is no server-side rendering.

## TypeScript

- Strict mode is on. Beyond `strict: true`, also enforce `noUnusedLocals`, `noUnusedParameters`, and `noFallthroughCasesInSwitch` — remove unused variables and parameters rather than suppressing errors.
- Avoid `any`. Use `unknown` when a type is genuinely unknown and narrow it before use.
- Run `npx tsc --noEmit` as a standalone type-check step separate from the test suite.
- Use `import.meta.env.VITE_*` to access environment variables in frontend code; plain `process.env` does not work in Vite.

## Component patterns

- Keep components small and focused on a single responsibility. Extract sub-concerns into child components or custom hooks.
- Always define a typed props interface; prefer explicit interfaces over inline object types for reusability and readability:
  ```tsx
  interface ButtonProps {
    children: ReactNode
    disabled?: boolean
    onClick?: () => void
  }
  export const Button: FC<ButtonProps> = ({ children, disabled = false, onClick }) => { ... }
  ```
- Use generic components when a component's logic is type-independent:
  ```tsx
  function List<T>({ items, renderItem, keyExtractor }: {
    items: T[]
    renderItem: (item: T) => ReactNode
    keyExtractor: (item: T) => string | number
  }) { ... }
  ```
- Use `memo` to prevent unnecessary re-renders of pure components that receive stable props. Pair with `useMemo` for expensive derived values and `useCallback` for stable callback references — but don't memoize indiscriminately; profile first.

## Custom hooks

Extract reusable logic into custom hooks rather than duplicating it across components. A `useAsync` hook is the idiomatic Axios-native pattern for managing loading/error/data state without a server-state library:

```ts
function useAsync<T>(asyncFunction: () => Promise<T>, immediate = true) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: Error | null }>({
    data: null, loading: immediate, error: null,
  })

  const execute = useCallback(async () => {
    setState({ data: null, loading: true, error: null })
    try {
      const data = await asyncFunction()
      setState({ data, loading: false, error: null })
    } catch (error) {
      setState({ data: null, loading: false, error: error as Error })
    }
  }, [asyncFunction])

  useEffect(() => { if (immediate) execute() }, [execute, immediate])

  return { ...state, execute }
}
```

## Conventions

- Use MUI components for all UI elements — avoid custom CSS except for layout adjustments MUI can't handle.
- New component files should be `.tsx`, not `.js`.
- Use `slotProps={{ htmlInput: { ... } }}` on MUI `TextField` — the `inputProps` prop is deprecated in MUI v7.
- Module-level constants should be named in `ALL_CAPS_SNAKE_CASE`. This applies to both exported constants and internal ones.
- All HTTP calls should go through a shared API module. This is the single place where wire types (ISO date strings, etc.) are mapped to domain types. Components must never perform their own serialization or deserialization — they receive fully-typed domain objects and call API functions to write data.
- When passing references to backend API calls, always use the object's `id`/`pk` rather than a human-readable name field. Names are not stable identifiers and can collide across scopes (e.g. public vs. private objects). Reserve names only for display.
- MUI `Dialog` components should have a fixed size derived from the viewport (e.g. `PaperProps={{ sx: { height: '80vh' } }}`), not a size that expands and contracts with dynamic content. Fix the height and let the scrollable content region (`DialogContent` with `overflowY: 'auto'`) adapt. Exception: lightbox-style dialogs where the container is inherently sized to a static image or caption.
- Configure Axios with `axios.create({ baseURL: import.meta.env.VITE_API_URL })` rather than constructing URLs ad hoc. Use interceptors for cross-cutting concerns (auth headers, error normalisation) rather than repeating that logic at each call site.
- Use `lazy` + `Suspense` for route-level code splitting to keep the initial bundle small:
  ```tsx
  const Dashboard = lazy(() => import('./pages/Dashboard'))
  // wrap routes in <Suspense fallback={<Loading />}>
  ```
- Implement React error boundaries around major subtrees so an uncaught render error shows a recoverable UI rather than a blank screen.
- Use semantic HTML elements (`<button>`, `<nav>`, `<main>`, `<section>`, etc.) and ARIA attributes where MUI components do not already supply them.

## Theming

- Use a MUI dark theme configured via `ThemeProvider` + `createTheme({ palette: { mode: 'dark' } })` with `CssBaseline`.
- Always use MUI theme tokens for color — never hardcode hex/rgb values. For text use `text.primary` (main content) and `text.secondary` (labels, metadata).

## Testing

```bash
cd web
npm test          # single run (used in CI)
npm run test:watch  # watch mode for development
```

The test environment is jsdom with React Testing Library.

**Avoiding flaky async assertions:** Never make a bare assertion immediately after a `waitFor` block — state updates triggered by async events may not have propagated yet. Wrap the follow-on assertion in its own `waitFor` call. Similarly, prefer `await userEvent.click(...)` over `fireEvent.click(...)` when the click handler triggers state updates, because `userEvent` dispatches the full browser event sequence and awaits its completion.

```ts
// ✅ correct
await waitFor(() => expect(api.someCall).toHaveBeenCalled())
await waitFor(() => expect(element).toHaveValue('expected'))
await userEvent.click(screen.getByTestId('save-button'))

// ❌ flaky — bare assertion after async work
await waitFor(() => expect(api.someCall).toHaveBeenCalled())
expect(element).toHaveValue('expected')             // may run before state update
fireEvent.click(screen.getByTestId('save-button'))  // may miss queued microtasks
```

### What to test

- Every new or modified React component → add or update a test.
- For Autocomplete components with controlled `inputValue`: use a stateful wrapper in tests because `inputValue={value}` with a mock `onChange: vi.fn()` means the component never sees typed text.
- Workflow/config helpers loaded from a data file → mock the data file with a minimal fixture to decouple tests from real project data and enable edge-case coverage.
