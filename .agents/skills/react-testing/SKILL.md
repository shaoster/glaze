---
model: opus
created: 2026-05-08
modified: 2026-05-18
reviewed: 2026-05-08
name: react-testing
description: |
  React/frontend-specific testing patterns and browser-based debugging: async
  assertion hygiene, mock boundaries, Autocomplete wrapper pattern, workflow
  fixture mocking. Also covers debugging prod-only visual bugs — when to ask
  for a screenshot, how to extend dev seeding to reproduce a rendering condition,
  and why jsdom misses layout/async-load failures. Invoke when writing or fixing
  frontend tests, when a visual bug doesn't reproduce locally, or when
  investigating why a layout behaves differently in prod vs. dev.
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

## Debugging Prod-Only Visual Bugs

jsdom has no layout engine and no image loading. A test suite that passes against a
prod-only layout bug usually means the tests don't exercise the rendering condition
that causes the failure. Before writing speculative fixes:

**1. Ask for a screenshot or screen recording before analyzing any code.**

For visual bugs, a screenshot immediately rules out entire categories of root cause.
Ask for it before reading the component tree or proposing hypotheses — the diff
between "all cards are at top:0" and "cards overlap mid-column" points to completely
different bugs. Do not proceed to static analysis until you have visual evidence.

**2. Ask the developer to localize the failure in the browser.**

The developer can use DevTools to measure DOM state that's invisible to tests:
```js
// Measure actual rendered dimensions on first load
document.getElementById('my-container').getBoundingClientRect()
// Check computed style driving the layout
getComputedStyle(document.querySelector('[data-testid="piece-thumbnail-shell"]')).aspectRatio
```
Ask specifically: does the bug appear on first paint, or only after a scroll/resize?
Does it affect all items or only a specific data shape (e.g. items without a crop field)?

**3. Extend dev seeding to exercise the specific code path.**

If prod has data the dev database doesn't, manufacture it — don't try to infer the
bug from prod screenshots alone. Target the exact field that differs:

```python
# Clear a field on the first page of results to match prod's missing-data condition
pieces = Piece.objects.order_by('-fields_last_modified')[:24]
for i, p in enumerate(pieces):
    p.thumbnail_crop = some_crop if i % 2 == 0 else None
    p.save(update_fields=['thumbnail_crop'])
```

A dev repro is worth more than any amount of static analysis. Do not write the fix
until the bug is visible in the dev browser.

**4. Identify why jsdom missed it.**

Common gaps between jsdom and the browser for layout bugs:
- **Async asset loading**: jsdom doesn't load images, so components that render at
  `opacity:0` (loading state) with no intrinsic size never trigger the zero-height
  collapse that causes masonry overlap in the real browser.
- **No ResizeObserver firing**: jsdom's ResizeObserver is a no-op stub; layout
  corrections that depend on it never fire.
- **Static mocks returning fixed dimensions**: mocks that return a fixed
  `{ width: 440 }` from `useContainerPosition` hide the real width=0 first-render
  case.

Once the repro is in hand, write a test that captures the specific invariant the
bug violated (e.g. "thumbnail shell always has a non-undefined aspect-ratio") rather
than trying to simulate the visual overlap itself.

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
