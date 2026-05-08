---
model: opus
created: 2026-05-08
modified: 2026-05-08
reviewed: 2026-05-08
name: react-testing
description: |
  React/frontend testing patterns: async assertion hygiene, mock boundaries,
  what to test vs. what to skip, Autocomplete wrapper pattern, workflow fixture
  mocking, and the Bazel web test command. Invoke when writing or fixing
  frontend tests, or when a test is flaky or unclear.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, TodoWrite
---

# React Testing Conventions

## Test Environment

jsdom with React Testing Library. Run via:

```bash
rtk bazel test //web:web_test
cd web && npm run test:watch   # watch mode (no Bazel equivalent)
```

## Async Assertion Hygiene

Never make a bare assertion immediately after a `waitFor` block — state updates
triggered by async events may not have propagated yet. Wrap follow-on assertions
in their own `waitFor`. Prefer `await userEvent.click(...)` over `fireEvent.click(...)`
when the click handler triggers state updates.

```ts
// ✅ correct
await waitFor(() => expect(api.someCall).toHaveBeenCalled())
await waitFor(() => expect(element).toHaveValue('expected'))
await userEvent.click(screen.getByTestId('save-button'))

// ❌ flaky
await waitFor(() => expect(api.someCall).toHaveBeenCalled())
expect(element).toHaveValue('expected')             // may run before state update
fireEvent.click(screen.getByTestId('save-button'))  // may miss queued microtasks
```

Code that causes React state updates should be wrapped in `act(...)`:
```ts
act(() => { /* fire events that update state */ });
/* assert on the output */
```

## Mock Boundaries

- Mock at the boundary, not in the middle of the implementation
- Prefer mocking: network/API modules, browser-only APIs, router hooks, heavyweight child components
- Keep the component's own state and rendering logic real
- Keep mocks small and explicit — return minimum data needed for the scenario; reset between tests; prefer per-test setup over large shared mock state
- Prefer fakes that preserve behavior over deep implementation mocks (e.g. minimal in-memory stub over mocking every internal call)

## What to Test

- Every new or modified React component → add/update test in `web/src/components/__tests__/`
- Every new or modified `workflow.ts` helper → add/update test in `web/src/util/workflow.test.ts`, mocking `workflow.yml` with a minimal fixture — **never import `workflow.yml` directly**
- Every new or modified `api.ts` function → add/update test in `web/src/util/__tests__/api.test.ts`, mocking axios via `vi.mock`

## What Not to Test

Do not write tests that primarily assert styling details such as class names, generated
MUI markup, spacing, colors, or CSS. Assert user-observable behavior, accessible state,
and meaningful content instead; only check style when visual presentation is itself the requirement.

## Autocomplete with Controlled `inputValue`

For MUI Autocomplete components with controlled `inputValue`: use a stateful wrapper in
tests because `inputValue={value}` with a mock `onChange: vi.fn()` means the component
never sees typed text.

```tsx
// Wrap in a stateful controller to make Autocomplete usable in tests
function Controlled() {
  const [value, setValue] = useState('');
  return <MyAutocomplete inputValue={value} onInputChange={(_, v) => setValue(v)} />;
}
render(<Controlled />);
```

See `GlobalEntryDialog.test.tsx` for a concrete example.

## Workflow/Config Fixture Mocking

Workflow/config helpers loaded from a data file → mock the data file with a minimal
fixture to decouple tests from real project data and enable edge-case coverage:

```ts
vi.mock('../../../workflow.yml', () => ({
  default: {
    version: '1.0.0',
    states: [
      { id: 'designed', visible: true, successors: ['completed'], friendly_name: 'Designing', description: '...' },
      { id: 'completed', visible: true, terminal: true, friendly_name: 'Completed', description: '...' },
    ],
  },
}));
```
