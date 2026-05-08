---
model: opus
created: 2026-05-08
modified: 2026-05-08
reviewed: 2026-05-08
name: react-conventions
description: |
  Generic React + TypeScript + Vite conventions: component patterns, local state
  shape, reducer migration checklist, custom hooks, MUI usage, theming tokens,
  and Axios/API module conventions. Invoke for any frontend work beyond Glaze-specific
  components — architecture decisions, state management, hook design, MUI patterns.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, TodoWrite
---

# React + TypeScript + Vite Conventions

## Stack

React, TypeScript (strict), Vite, Material UI (MUI), Axios

## Architecture

Single Page Application. Routing is client-side via React Router (`RouterProvider`
with a data router) mounted in `App`. No server-side rendering.

## TypeScript

- Strict mode on. Also enforce `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch` — remove unused vars/params rather than suppressing
- Avoid `any`. Use `unknown` when genuinely unknown and narrow before use
- Run `npx tsc --noEmit` as a standalone type-check step
- Use `import.meta.env.VITE_*` for env vars — `process.env` does not work in Vite

## Component Patterns

- Small components focused on a single responsibility; extract sub-concerns into child components or custom hooks
- "Data down, actions up": parents pass data + narrow action interface (`onSave`, `onDelete`, `onSelect`); children call those actions
- Push data ownership and business logic as low in the tree as practical. Let parents orchestrate; let the lowest reasonable component own the stateful workflow it directly implements
- Always define a typed props interface:
  ```tsx
  interface ButtonProps {
    children: ReactNode
    disabled?: boolean
    onClick?: () => void
  }
  export const Button: FC<ButtonProps> = ({ children, disabled = false, onClick }) => { ... }
  ```
- Use generic components when logic is type-independent
- Use `memo` for pure components receiving stable props; pair with `useMemo` for expensive derived values and `useCallback` for stable callbacks — but profile first
- **Maximum JSX nesting depth of 4.** Exceed this → extract a named child component with typed props
- When a page grows multiple page-specific child components, prefer a page subfolder `web/src/pages/<PageName>/`. Keep broadly reusable UI in `web/src/components/`
- When the same UI concept or JSX pattern appears in more than one place, extract a shared component

## Local State Shape

- Prefer `useState` for one or two independent fields with obvious update rules
- Migrate to `useReducer` when state behaves like a small state machine: several fields must change together, updates depend on the previous draft and server snapshot, or multiple event sources advance the same state

**`useReducer` is usually justified when you see:**
- More than two sibling `useState` values that conceptually form one draft
- Repeated "if X changed, also patch Y and maybe reset Z" logic
- Async server responses racing with local user edits
- Effects that observe one piece of React state to synchronously push updates into another

## Reducer Migration Checklist

- Define the reducer around domain events, not UI implementation details (`hydrate`, `edit_notes`, `select_tag`, `save_succeeded`, `save_failed`)
- Keep one authoritative draft object when fields conceptually travel together
- Audit old observer-style `useEffect` code — these are often the reason to adopt a reducer
- Preserve the source-of-truth boundary: derived values should stay derived; reducer owns the editable draft, not every computed value
- Be explicit about hydration semantics: replace everything / merge only untouched fields / ignore stale responses entirely
- Cover async races in tests: at least one test where a local edit exists and a stale upstream update arrives afterward
- Re-check dirty-state logic after migration (object identity changes can make dirty checks always true/false)
- Re-check autosave/manual-save triggers — reducers can introduce effect loops or duplicate saves

## Custom Hooks

Extract reusable logic into custom hooks. The `useAsync` hook is the idiomatic pattern:

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

- Use MUI components for all UI elements — avoid custom CSS except for layout adjustments MUI can't handle
- New component files: `.tsx`, not `.js`
- Use `slotProps={{ htmlInput: { ... } }}` on MUI `TextField` — `inputProps` is deprecated in MUI v7
- Module-level constants: `ALL_CAPS_SNAKE_CASE`
- All HTTP calls through a shared API module (the only place with deserialization logic)
- MUI `Dialog`: fixed size derived from viewport (e.g. `PaperProps={{ sx: { height: '80vh' } }}`); let scrollable `DialogContent` adapt. Exception: lightbox-style dialogs sized to static content
- Configure Axios with `axios.create({ baseURL: import.meta.env.VITE_API_URL })`; use interceptors for auth headers and error normalization
- Use `lazy` + `Suspense` for route-level code splitting
- Implement React error boundaries around major subtrees
- Use semantic HTML elements and ARIA attributes where MUI doesn't supply them

## Theming

- MUI dark theme via `ThemeProvider` + `createTheme({ palette: { mode: 'dark' } })` with `CssBaseline`
- Always use MUI theme tokens for color — never hardcode hex/rgb values
- Text: `text.primary` (main content), `text.secondary` (labels, metadata)

## Debugging

When something in a third-party library or framework behaves differently from expectations,
look up the documentation before scanning code. Many non-obvious behaviors are documented explicitly.
