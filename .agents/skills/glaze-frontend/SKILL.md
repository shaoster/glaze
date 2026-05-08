---
model: opus
created: 2026-05-08
modified: 2026-05-08
reviewed: 2026-05-08
name: glaze-frontend
description: |
  Glaze-specific frontend conventions: TypeScript data model, component inventory,
  module paths, state chip design system, type generation pipeline, Cloudinary upload
  flow, auth UI, piece detail routing, and frontend testing guidance.
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
  url: string;
  caption: string;
  created: Date;
  cloudinary_public_id: string;
  cloud_name: string;
}
```

**Image metadata contract:** Every Cloudinary-backed image record has both
`cloudinary_public_id` and `cloud_name` populated. Always assume the Cloudinary SDK
path is available. Only exceptions: curated local SVG thumbnails in `web/public/thumbnails/`.

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

## Data-Fetching Pattern (`useAsync`)

Any component loading data from the API must use the `useAsync` hook from
`web/src/util/useAsync`. Do not inline `useState` + `useEffect` + `.catch` + `.finally`.

```tsx
// ✅ correct
const { data: pieces, loading, error, setData: setPieces } =
  useAsync<PieceSummary[]>(fetchPieces);
setPieces((prev) => [newPiece, ...(prev ?? [])]);  // optimistic mutation

// ❌ incorrect — do not inline this pattern
const [data, setData] = useState(null);
useEffect(() => { fetchSomething().then(setData).catch(...).finally(...) }, []);
```

Render `<CircularProgress />` while `loading` is true; render an error message when
`error` is non-null. Silent `.catch(() => {})` only for genuinely invisible background ops.

## Shared UI Extraction

Route-level containers (`PieceDetail.tsx`, `PieceList.tsx`) are orchestration layers —
not homes for duplicated presentational subtrees. When a feature introduces the same UI
concept in multiple places, extract a reusable component in `web/src/components/`.

## Workflow Config Interface (`workflow.ts`)

`web/src/util/workflow.ts` loads `workflow.yml` at build time and exposes typed helpers:
- `getAdditionalFieldDefinitions(stateId)` — resolves per-state additional field definitions into form-ready structure
- `getGlobalDisplayField(globalName)` — returns display field name for a globals entry
- `formatWorkflowFieldLabel(fieldName)` — converts snake_case DSL names to Title Case

## Type Generation Pipeline

- `web/src/util/generated-types.ts` is auto-generated — **do not edit by hand**; gitignored
- Generation: `web/scripts/generate-types.mjs` calls `openapi-typescript` with a `transform` for `format: date-time` → `Date`; run `npm run generate-types` with Django on port 8080
- `web/src/util/types.ts` derives domain types from `generated-types.ts` via intersection (no `Omit<>`)
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
- `GlobalEntryDialog.tsx` — full-screen dialog for browsing, searching, selecting a global entry; supports inline creation when `can_create` is set; renders Cloudinary image uploads for `type: image` fields on create
- `CloudinaryImage.tsx` — renders `CaptionedImage` via `@cloudinary/url-gen` + `@cloudinary/react`; falls back to plain `<img>`. Sizing: `thumbnail`/`preview` (64×64 fill), `lightbox` (90vw×80vh fit)
- `ImageLightbox.tsx` — full-screen modal image viewer with caption and keyboard/touch navigation
- `StateChip.tsx` — shared workflow-state token. `variant: 'current' | 'past' | 'future'` plus `isTerminal` and optional interaction hooks
- `WorkflowSummary.tsx` — renders read-only `summary` section for terminal states; displays promoted fields, computed numeric results, static text with optional `when` visibility
- `PieceShareControls.tsx` — owner-only sharing controls on terminal pieces; toggle for public access + copyable share link
- `PublicPieceShell.tsx` — thin unauthenticated route wrapper rendering `PieceDetailPage` for publicly shared pieces

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

- On load: calls `fetchCurrentUser()` (`GET /api/auth/me/`)
- Authenticated → routed app shell with current-user chip and logout
- Unauthenticated → login form with email/password + optional Google Sign-In button (`VITE_GOOGLE_CLIENT_ID`)
- `SIGN_UP_ENABLED = false` — create accounts via Django admin

## Frontend Routing for Piece Detail

- Unauthenticated users: `/pieces/:id` registered in the unauthenticated router inside `PublicPieceShell`; backend decides readability
- Authenticated owners: reach `/pieces/:id` through app shell; API returns `can_edit: true`
- Authenticated non-owners: can open shared pieces read-only; API returns `can_edit: false`
- Do not introduce a separate public piece detail page — canonical URL is `/pieces/:id`

## Cloudinary Image Upload Flow

- `WorkflowState` calls `GET /api/uploads/cloudinary/widget-config/` → opens Cloudinary Upload Widget → widget calls `POST /api/uploads/cloudinary/widget-signature/` for signing → on success stores `secure_url` + `public_id` → `PATCH /api/pieces/<id>/state/` persists the array
- `CloudinaryImage` uses `cloudinary_public_id` and `cloud_name` for optimized delivery — both always present
- Cloudinary is optional: if env vars absent, config endpoint returns 503 and UI falls back to URL-paste mode

## Frontend Testing Guidance

- Every new or modified React component → add/update test in `web/src/components/__tests__/`
- Every new or modified `workflow.ts` helper → add/update test in `web/src/util/workflow.test.ts`, mocking `workflow.yml` with a minimal fixture — never import `workflow.yml` directly
- Every new or modified `api.ts` function → add/update test in `web/src/util/__tests__/api.test.ts`, mocking axios via `vi.mock`
- Component tests involving typing into a controlled MUI Autocomplete must use a stateful wrapper (see `Controlled` in `GlobalEntryDialog.test.tsx`)
