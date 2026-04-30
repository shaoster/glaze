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
- Prefer "data down, actions up" boundaries. Parents should pass the data a child needs to render plus a narrow action interface for meaningful events (`onSave`, `onDelete`, `onSelect`, etc.), and children should call those actions instead of receiving large bundles of parent setters.
- If several descendants need the same narrow action interface, a focused Context can be a good fit. Keep the Context surface small, document what owns the data, and avoid using Context as a dumping ground for unrelated mutable state.
- Treat excessive parent-owned state passed into a child as a refactoring smell. If a child needs a long list of parent state values plus multiple parent setters to do its job, the boundary is likely fragile and the logic probably belongs lower in the tree or back in the parent.
- Push data ownership and business logic as low in the tree as practical. Let parents focus on orchestration, routing, and cross-cutting concerns; let the lowest reasonable component own the stateful workflow it directly implements.
- Completely stateless subtrees are excellent extraction candidates. If a subtree can be expressed as pure props-in/render-out UI, factoring it into a child component usually improves readability and testability without introducing a brittle ownership split.
- When a page grows multiple page-specific child components or helper modules, prefer a dedicated page subfolder such as `web/src/pages/<PageName>/` instead of leaving every helper adjacent to the page file. Keep broadly reusable UI in `web/src/components/`; keep page-scoped pieces near the owning page.
- When the same UI concept or JSX pattern appears in more than one place, extract a shared component instead of duplicating inline JSX. Treat repeated presentational structure as a refactoring trigger even if the first implementation started life inside a single screen component.
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
- **Maximum JSX nesting depth of 4.** If a component's JSX tree would exceed 4 levels of element nesting, extract the deeper subtree into a named child component with typed props. This also sidesteps TypeScript narrowing limitations: instead of narrowing a `string | undefined` inside a callback nested in a ternary branch, pass the already-narrowed value as a `string` prop to a child component.
- Before splitting a large component, decide what the new boundary owns. Good splits usually create either a pure presentational subtree or a child that owns a coherent slice of state and business logic. Bad splits mostly move JSX into another file while still threading parent-owned state and setters through every layer.

## Local state shape

- Prefer plain `useState` when the component has one or two independent fields and the update rules are obvious from the setter call site.
- Migrate to `useReducer` when the local state behaves like a small state machine: several fields must change together, updates depend on the previous draft and the previous server snapshot, or multiple event sources can advance the same state differently.
- A reducer is usually justified when you see any of these:
  - More than two sibling `useState` values that conceptually form one draft or workflow.
  - Repeated "if X changed, also patch Y and maybe reset Z" logic spread across handlers and effects.
  - Async server responses racing with local user edits, especially when "hydrate from server unless the user already changed this field" rules appear.
  - Effects that exist mostly to observe one piece of React state and synchronously push updates into another piece of React state.
- Do not migrate to a reducer just because a component is long. If the state is simple and the complexity is mostly rendering, extract child components first.

## Reducer migration checklist

When migrating a drafty or workflow-heavy component from multiple setters to a reducer, check these explicitly:

- Define the reducer around domain events, not UI implementation details. Good action names look like `hydrate`, `edit_notes`, `select_tag`, `save_succeeded`, `save_failed`.
- Keep one authoritative draft object when the fields conceptually travel together. Avoid parallel `useState` values plus a reducer unless there is a clear ownership boundary.
- Audit old observer-style `useEffect` code carefully. Effects that used to watch state and call sibling setters are often the reason to adopt a reducer in the first place.
- Preserve the source-of-truth boundary. Derived values from props or server data should usually stay derived; the reducer should own the editable draft, not duplicate every computed value.
- Be explicit about hydration semantics. Decide what happens when new server data arrives while the user has unsaved edits:
  - replace everything
  - merge only untouched fields
  - ignore stale responses entirely
- Cover async races in tests. Add at least one test where a local edit exists and a stale or partial upstream update arrives afterward.
- Re-check dirty-state logic after the migration. Reducers often change object identity patterns, which can accidentally make "is dirty?" checks always true or always false.
- Re-check autosave/manual-save triggers after the migration. Make sure the reducer did not introduce effect loops or duplicate saves.
- Re-check lint pressure from `react-hooks/set-state-in-effect`. If an effect still exists after the migration, it should usually bridge React to an external system or dispatch a single domain event rather than synchronously juggling multiple local setters.
- Re-check callback ownership. If you are tempted to "just dispatch in the async callback instead of in an effect," verify that the callback is the only path that can update the upstream data. If props can also change because of parent refreshes, route changes, optimistic rollbacks, or sibling saves, keep a prop-to-reducer synchronization path.

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

When testing, code that causes React state updates should be wrapped into act(...):

act(() => {
  /* fire events that update state */
});
/* assert on the output */

This ensures that you're testing the behavior the user would see in the browser. Learn more at https://react.dev/link/wrap-tests-with-act

For tests that exercise react-router navigation, use playwright's browser tests.

### What to test

- Every new or modified React component → add or update a test.
- Mock at the boundary, not in the middle of the implementation. Prefer mocking network/API modules, browser-only APIs, router hooks, and heavyweight child components while keeping the component's own state and rendering logic real.
- Keep mocks small and explicit. Return the minimum data needed for the scenario, reset mocks between tests, and prefer per-test setup over large shared mock state that can leak across cases.
- Prefer fakes that preserve behavior over deep implementation mocks. For example, pass real props through a lightweight test wrapper or use a minimal in-memory stub instead of mocking every internal function call.
- Do not write tests that primarily assert styling details such as class names, generated MUI markup, spacing, colors, or CSS implementation. Assert user-observable behavior, accessible state, and meaningful content instead; only check style when visual presentation is itself the requirement.
- For Autocomplete components with controlled `inputValue`: use a stateful wrapper in tests because `inputValue={value}` with a mock `onChange: vi.fn()` means the component never sees typed text.
- Workflow/config helpers loaded from a data file → mock the data file with a minimal fixture to decouple tests from real project data and enable edge-case coverage.

## Debugging

- When something in a third party library or framework behaves differently from what is expected based on context, prefer to look up the documentation before blindly scanning the code.
