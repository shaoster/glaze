---
model: opus
created: 2026-05-08
modified: 2026-05-18
reviewed: 2026-05-08
name: glaze-frontend
description: |
  Glaze-specific frontend conventions: TypeScript data model, component inventory,
  module paths, state chip design system, type generation pipeline, R2 upload
  flow, auth UI, and piece detail routing. Includes test file location reminders
  (which files to add/update) but not testing patterns — load react-testing for
  async assertions, mock boundaries, and debugging prod-only visual bugs.
  Invoke for any frontend work touching Glaze domain components, UI patterns, or the
  API/type pipeline.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, TodoWrite
---

# Glaze Frontend Conventions

## Data Model

Defined in `web/src/util/types.ts`, mirroring backend API output.

**`PieceSummary`** — list views
```ts
{
  id: string;
  name: string;
  created: Date;
  last_modified: Date;
  thumbnail: string;
  current_state: State;
  current_location?: Location;
}
```

**`PieceState`** — a single recorded workflow step
```ts
{
  state: State;
  notes: string;
  created: Date;
  last_modified: Date;
  images: [CaptionedImage];
  previous_state?: State;
  next_state?: State;
}
```

**`PieceDetail`** — detail views; extends `PieceSummary`
```ts
PieceSummary & {
  current_state: PieceState;
  history: [PieceState];
}
```

**`CaptionedImage`**
```ts
{
  url: string;                  // public CDN URL of the original
  caption: string;
  created: Date;
  crop?: ImageCrop | null;      // relative {x, y, width, height}
  cropped_url?: string | null;  // CDN URL of the eager crop; null until materialized
  image_id?: string | null;
  width?: number | null;
  height?: number | null;
}
```

**Image metadata contract:** `url` is always the delivery URL; `cropped_url` is written
only by the backend `generate_cropped_image` task (never client-supplied). Renderers
display `cropped_url ?? url`. Curated local SVG thumbnails in `web/public/thumbnails/`
are plain URLs with no R2 identity.

## Module Paths

Import from the `./util` directory (`./util/types`, `./util/api`, `./util/workflow`).
These live in `web/src/util/` and must not take direct dependencies on React.

## State Names and Transitions

Come from `workflow.yml` via constants in `./util/types` (`STATES`, `SUCCESSORS`).
Never hardcode them in components.

## HTTP Calls

All go through `web/src/util/api.ts` (imported as `./util/api`). This is the single
place where wire types (ISO date strings) are mapped to domain types. Components must
never perform their own serialization or deserialization.

When passing references to backend API calls, always use `id`/`pk` — never human-readable
name fields (names are not stable identifiers).

## Data-Fetching Pattern (`@tanstack/react-query`)

All data fetching uses TanStack Query v5. Do not use the legacy `useAsync` hook or
inline `useState` + `useEffect` + `.catch` + `.finally`.

| Scenario | Hook | Notes |
|---|---|---|
| Always fetch on mount | `useSuspenseQuery` | Component suspends; parent needs `<Suspense>` + `<ErrorBoundary>` |
| Fetch only when condition is true | `useQuery` with `enabled` | Handle `isLoading`/`error` inline |
| Create / update / delete | `useMutation` | Use `onSuccess` for side effects |
| Optimistic local update | `queryClient.setQueryData(key, updater)` | Replaces old `setData` from `useAsync` |

```tsx
// ✅ unconditional read
const { data: pieces } = useSuspenseQuery<PieceSummary[]>({
  queryKey: ["pieces"],
  queryFn: fetchPieces,
});

// ✅ conditional read
const { data, isLoading, error } = useQuery({
  queryKey: ["tags"],
  queryFn: fetchTags,
  enabled: dialogOpen,
});

// ✅ mutation + optimistic update
const queryClient = useQueryClient();
const { mutate: save } = useMutation({
  mutationFn: (payload) => updatePiece(id, payload),
  onSuccess: (updated) => queryClient.setQueryData(["piece", id], updated),
});
```

`QueryClientProvider` is already at the `App` root. Tests rendering a component in
isolation must wrap it: `<QueryClientProvider client={new QueryClient({ defaultOptions:
{ queries: { retry: false }, mutations: { retry: false } } })}>`.

Components using `useSuspenseQuery` need a `<Suspense>` + `<ErrorBoundary>` parent.
Components using `useQuery` own their loading/error rendering inline.

## Shared UI Extraction

Route-level containers (`PieceDetail.tsx`, `PieceList.tsx`) are orchestration layers —
not homes for duplicated presentational subtrees. When a feature introduces the same UI
concept in multiple places, extract a reusable component in `web/src/components/`.

## Workflow Config Interface (`workflow.ts`)

`web/src/util/workflow.ts` loads `workflow.yml` at build time and exposes typed helpers:
- `getCustomFieldDefinitions(stateId)` — resolves per-state custom field definitions into form-ready structure
- `getGlobalDisplayField(globalName)` — returns display field name for a globals entry
- `formatWorkflowFieldLabel(fieldName)` — converts snake_case DSL names to Title Case

## Type Generation Pipeline

- `web/src/util/generated-types.ts` is auto-generated — **do not edit by hand**; gitignored
- Generation: `web/scripts/generate-types.mjs` calls `openapi-typescript` with a `transform` for `format: date-time` → `Date`; run `npm run generate-types` with Django on port 8080
- `web/src/util/types.ts` derives domain types from `generated-types.ts` via a small override helper for nested normalization only
- **Important:** `types.ts` must never decide which fields are optional or present on frontend models. If a field is missing from a frontend fixture or test, the fix belongs in the backend serializer/schema, not in the domain wrapper.
- If linting surfaces a missing field on a `PieceSummary`/`PieceDetail` fixture,
  keep the generated contract authoritative: update the backend serializer so
  the schema exposes the field, then regenerate types and update the fixture.
  Do not make the domain wrapper optional just to make the checker happy.
- **When adding a new API field:** update Django serializer → run `npm run generate-types` → update `types.ts` if semantic narrowing needed → update mappers in `api.ts`
- `api.ts` uses `Wire<T>` generic to type raw Axios responses (dates as strings); mappers convert `Wire<T>` → domain `T` — the only file with deserialization logic
- OpenAPI schema at `http://localhost:8080/api/schema/`; Swagger UI at `/api/schema/swagger/`

## Thumbnails

- Curated SVG thumbnails in `web/public/thumbnails/`
- Style: fill `#c8956c`, stroke `#7a4f3a`, `viewBox="0 0 100 100"` — new thumbnails must follow this
- `DEFAULT_THUMBNAIL` (exported from `NewPieceDialog.tsx`) points to `/thumbnails/question-mark.svg`

## Existing Components

- `PieceList.tsx` — MUI table of `PieceSummary` objects
- `NewPieceDialog.tsx` — dialog for creating a new piece; name, notes, thumbnail gallery
- `WorkflowState.tsx` — edits current `PieceState`: notes, location, additional fields, images, caption editing, lightbox launch
- `GlobalEntryField.tsx` — chip + button wrapper showing selected global entry; opens `GlobalEntryDialog` on click
- `GlobalEntryDialog.tsx` — full-screen dialog for browsing, searching, selecting a global entry; supports inline creation when `can_create` is set; renders direct-to-R2 image uploads for `type: image` fields on create
- `AppImage.tsx` — renders an R2/CDN-hosted image as a plain `<img>` at `cropped_url ?? url` (no request-time transforms). Contexts: `thumbnail`/`preview` (64×64 box), `gallery`/`detail` (fill container), `lightbox` (fit-content). Exports `SuspenseAppImage` + `ImageSkeleton`
- `ImageLightbox.tsx` — full-screen modal image viewer with caption and keyboard/touch navigation
- `StateChip.tsx` — shared workflow-state token. `variant: 'current' | 'past' | 'future'` plus `isTerminal` and optional interaction hooks
- `ProcessSummary.tsx` — renders read-only `summary` section for terminal states; displays promoted fields, computed numeric results, static text with optional `when` visibility
- `PieceShareControls.tsx` — owner-only sharing controls on terminal pieces; toggle for public access + copyable share link
- `PublicPieceShell.tsx` — thin unauthenticated route wrapper rendering `PieceDetailPage` for publicly shared pieces
- `TutorialManager.tsx` — global component that renders tutorial tips based on `tutorials.yml`.

## Declarative UI

Glaze uses YAML-driven UI generation to maintain consistency with the backend.

- **`UserPreferencesDialog.tsx`**: Renders settings based on `user_preferences.yml`.
- **`TutorialManager.tsx`**: Declaratively attaches tutorials to DOM nodes using CSS selectors defined in `tutorials.yml`.
- **`util/preferences.ts`**: Provides the frontend interface to the preferences and tutorials configuration.

## Visual Design System — State Chips

- State chips are a dedicated UI language, not generic tag chips or MUI buttons
- Keep chip color rules in frontend code, not in `workflow.yml`
- **Current state:** solid outline, lightly filled background, filled status dot. May be slightly larger than successors but should feel related
- **Valid successors:** dotted/dashed outline, outlined dots; on hover: filled background, solid outline, filled dot — actionable but not CTA-style
- **Hover effect:** hovering a successor de-emphasizes the current state with muted gray
- **Semantic colors:** `completed` → green, `recycled` → red, all other active states → warm clay accent (`oklch(0.66 0.17 35)`)
- **Past states:** same visual family as state chips but muted, no hover affordance, no interactive treatment
- Do not restyle state chips to match tags, favorites, or filter pills

## Auth UI Flow (`App.tsx`)

- On load: calls `fetchAppInit()` (`GET /api/auth/me/`) — returns `{ googleOauthClientId, user | null }`. 503 if OAuth is not configured on the backend.
- Loading → fullscreen spinner; 503/error → fullscreen error message
- Authenticated → routed app shell with current-user chip and logout
- Unauthenticated → `UnauthenticatedApp` with Google Sign-In button (client ID from `fetchAppInit`)
- `SIGN_UP_ENABLED = false` — create accounts via Django admin

## Frontend Routing for Piece Detail

- Unauthenticated users: `/pieces/:id` registered in the unauthenticated router inside `PublicPieceShell`; backend decides readability
- Authenticated owners: reach `/pieces/:id` through app shell; API returns `can_edit: true`
- Authenticated non-owners: can open shared pieces read-only; API returns `can_edit: false`
- Do not introduce a separate public piece detail page — canonical URL is `/pieces/:id`

## Routing Contract

Any non-transient UI state — one the user would bookmark, share, or restore on reload — must live in the URL. Prefer hierarchical routes that mirror the data model. Use query params only when the state is orthogonal to the route hierarchy (e.g. lightbox index in a flat gallery).

**Routed piece detail hierarchy:**
```
/pieces/:id                              — piece detail
/pieces/:id/history/:stateId             — historical state view
/pieces/:id/video                        — showcase video panel
/pieces/:id/photos                       — photo gallery
/pieces/:id/photos/:index                — photo lightbox (existing)
/pieces/:id/tags/new                     — tag creation dialog
/pieces/:id/state/fields/:fieldName      — global entry browse dialog
/pieces/:id/state/fields/:fieldName/new  — global entry create dialog
```
`/analyze/glaze-combinations?combo=<id>&image=<idx>` — combination gallery lightbox (query params because the gallery is a flat list).

**Routing hook pattern** — all URL parsing lives in `web/src/routing/pieceRouting.ts` and `web/src/routing/galleryRouting.ts`. Route-aware parents call the hook and inject the result as props; components themselves have no URL dependencies:

```ts
// In PieceDetailContent (the route-aware parent):
const historyRouting = usePieceHistoryRouting(piece.id);
<PieceHistory rewindedStateId={historyRouting.rewindedStateId}
              onRewind={historyRouting.onRewind} />

// In WorkflowState (uses RoutedGlobalEntryField wrapper):
<RoutedGlobalEntryField pieceId={pieceId} fieldName={field.name}
                        globalName={field.globalName} ... />
```

Components receive routing props and can be tested without any Router wrapper. `RoutedGlobalEntryField` is the HOC that injects routing into `GlobalEntryField`; use bare `GlobalEntryField` in unrouted contexts (e.g. `NewPieceDialog`).

**Acceptable transient-only state** (do not route): state transition confirmation dialogs, photo deletion confirmations, menu anchors, drag gestures, save-in-progress flags.

`GlobalEntryDialog` internal filter state is intentionally transient — it resets on close and need not survive a reload.

## R2 Image Upload Flow

- `uploadImageToR2` (`web/src/util/r2Upload.ts`) downscales client-side (long edge ≤2560px, JPEG q0.9) → `POST /api/uploads/r2/presigned-url/` returns `{upload_url, key, public_url, expires_in}` with a server-generated key → PUTs the bytes directly to R2 with bare axios (the URL signature is the credential — no app auth headers) → `PATCH /api/pieces/<id>/state/` persists `{url, width, height}` through the normal state flow
- Crops are eager: saving crop coordinates enqueues the backend `generate_cropped_image` task; `AppImage` renders `cropped_url ?? url` and `PieceDetailPage` polls while any image has a crop but no `cropped_url` yet
- R2 is optional in dev: if env vars are absent, the presigned-url endpoint returns 503 and the upload button surfaces an error; already-stored URLs still render

## Test File Locations

For testing patterns, async assertions, mock boundaries, and debugging visual bugs, load the `react-testing` skill. The reminders below are only about *where* to put tests, not *how* to write them.

- Every new or modified React component → add/update test in `web/src/components/__tests__/`
- Every new or modified `workflow.ts` helper → add/update test in `web/src/util/workflow.test.ts`, mocking `workflow.yml` with a minimal fixture — never import `workflow.yml` directly
- Every new or modified `api.ts` function → add/update test in `web/src/util/__tests__/api.test.ts`, mocking axios via `vi.mock`
- Component tests involving typing into a controlled MUI Autocomplete must use a stateful wrapper (see `Controlled` in `GlobalEntryDialog.test.tsx`)
