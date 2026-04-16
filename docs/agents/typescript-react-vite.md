# TypeScript + React + Vite Guide

## Stack

React, TypeScript (strict), Vite, Material UI (MUI), Axios

## Architecture

This is a Single Page Application (SPA). Routing is handled client-side via React Router (`RouterProvider` with a data router) mounted in the top-level `App` component. There is no server-side rendering.

## Conventions

- Use MUI components for all UI elements — avoid custom CSS except for layout adjustments MUI can't handle.
- TypeScript strict mode is on; avoid `any`.
- New component files should be `.tsx`, not `.js`.
- Use `slotProps={{ htmlInput: { ... } }}` on MUI `TextField` — the `inputProps` prop is deprecated in MUI v7.
- Module-level constants should be named in `ALL_CAPS_SNAKE_CASE`. This applies to both exported constants and internal ones.
- All HTTP calls should go through a shared API module. This is the single place where wire types (ISO date strings, etc.) are mapped to domain types. Components must never perform their own serialization or deserialization — they receive fully-typed domain objects and call API functions to write data.
- Use Axios for all HTTP requests to the backend.

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
