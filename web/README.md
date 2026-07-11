# React + TypeScript + Vite Web Client

## Storybook

Interactive component stories are published at:

**[https://shaoster.github.io/glaze/storybook/](https://shaoster.github.io/glaze/storybook/)**

Run locally:

```bash
gz_story                # start Storybook dev server via Bazel (port 6006)
gz_story 7007           # alternate port

# Manual Bazel commands:
bazel run //web:storybook_dev       # dev server
bazel build //web:storybook_build   # static build → bazel-bin/web/storybook-static/
```

Stories live in `src/stories/`. The preview wraps every story with the app's MUI dark theme so components render in their production context.

## Local env config (git-safe)

Use `.env.local` for local-only values. It is gitignored, but there is no
checked-in `web/.env.example` template anymore. Create the file manually if you
want web-only overrides for local development.

To enable Google Sign-In locally, add `GOOGLE_OAUTH_CLIENT_ID=<your-client-id>` to your root `.env.local` — it is loaded by `source env.sh` and will be in the shell environment when `gz_start` launches the Vite dev server.

R2 uploads use presigned URLs issued by Django; set the `R2_*` vars in root `.env.local` so the access keys never appear in browser code.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## Declarative UI

Glaze uses a "data-driven" approach where structural YAML files drive UI generation.

### User Preferences

The `UserPreferencesDialog.tsx` is driven by `user_preferences.yml`.

- It dynamically renders form fields based on the sections and field definitions in the YAML.
- Uses `util/preferences.ts` as the bridge to the YAML configuration.

### Tutorials

Tutorial tips are managed by `TutorialManager.tsx` and driven by `tutorials.yml`.

- **Zero-JSX Attachment**: Instead of placing `<SmallTutorialInlay />` manually in components, define an `attachment.selector` (CSS selector) in `tutorials.yml`.
- The `TutorialManager` scans the DOM for these selectors and portals the inlays to the detected elements.
- Dismissal state is automatically synced with the backend user preferences.

## React Compiler

The React Compiler is enabled on this template. See [this documentation](https://react.dev/learn/react-compiler) for more information.

Note: This will impact Vite dev & build performances.

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from "eslint-plugin-react-x";
import reactDom from "eslint-plugin-react-dom";

export default defineConfig([
  globalIgnores(["dist"]),
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs["recommended-typescript"],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ["./tsconfig.node.json", "./tsconfig.app.json"],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
]);
```

## React components

The web UI is organized around a small set of React components in `src/components/`. Each component owns a distinct slice of product behavior:

- `NewPieceDialog.tsx`: Creates a new piece from the list page, including name entry, optional notes, location selection/creation, curated thumbnail picking, save validation, and discard-confirmation when the form is dirty.
- `PieceList.tsx`: Renders the main piece masonry on the list page. It filters and sorts `PieceSummary` rows, measures the container width, and seeds a Masonic positioner before the first paint so cropped cards do not flash an incorrect first layout or overlap while the grid settles. Masonic gives us a positioner/cache API, but not a way for `PieceCard` to report its final height before layout, so `PieceList` keeps the card-layout math in one shared helper and uses it for the grid seed, thumbnail shell, and image sizing.
- `PieceDetail.tsx`: Displays a single piece header, renders the current editable workflow state, exposes valid next-state transitions from `workflow.yml`, blocks navigation when edits are unsaved, and lets the user expand past state history with image previews. When **edit piece history** mode is active (`is_editable=true`), clicking any past state in `StateCarousel` **rewinds** the view to that state — the top editing panel switches to show that historical state (using `updatePastState` to save changes), and all later states in the carousel are greyed out. Clicking the rewound state again (or the ✕ dismiss button on the banner) clears the rewind. Sealing the piece automatically resets the view to the topologically latest state.
- `StateCarousel.tsx`: Renders the piece's state history as a horizontal strip of `StateChip`s (replaces the old `Timeline`/`StateTransition` components), with Bezier branch connectors fanning out to the valid next states from `workflow.yml`. Owns click-to-rewind and click-to-transition affordances; delegates the actual state list rendering to `PieceHistory.tsx`.
- `WorkflowState.tsx`: Handles editing the current state itself, including notes, current location, workflow-driven additional fields, save/error states, direct-to-R2 image uploads, caption editing, image removal, and lightbox launch for current-state images.
- `GlobalEntryField.tsx` + `GlobalEntryDialog.tsx`: Together provide the reusable UI for workflow globals — `GlobalEntryField` renders the autocomplete chip input and select affordance, while `GlobalEntryDialog` hosts the searchable list, inline creation form, and R2 image upload for the selected global type.
- `RoutedGlobalEntryField.tsx`: Wraps `GlobalEntryField` with URL-driven routing state (`useGlobalFieldRouting`) so a field's open/selected state survives navigation; falls back to a plain `GlobalEntryField` when rendered outside a Router context (e.g. Django admin embeds). `fieldName` must be set explicitly when multiple fields on the same state share a `globalName` (e.g. two separate `location` fields).
- `AppImage.tsx`: Image renderer for R2/CDN-hosted assets across five named contexts (`thumbnail`, `gallery`, `lightbox`, `detail`, `preview`). Renders a plain `<img>` at the stored CDN URL, preferring the eagerly generated crop (`cropped_url`) when it exists — there are no request-time transforms. Backed by TanStack Query (`useSuspenseQuery`) so image loads are cached and shared across components. Exports `SuspenseAppImage` — a Suspense-wrapped variant for use inside lightboxes and galleries where the surrounding layout can show a skeleton while the image loads.
- `ImageLightbox.tsx`: Shows piece images in a full-screen modal with captions plus desktop button navigation and touch swipe navigation for browsing multiple images. Uses TanStack Query and `React.Suspense` so the lightbox skeleton is shown while the full-resolution URL is being prefetched.
- `SelectablePhotoMasonry.tsx`: Checkbox-selectable masonry grid of `AppImage` thumbnails, used where a user picks a subset of a piece's photos (e.g. showcase video input selection); supports a `locked` per-item state for already-committed selections.
- `WorkflowSummary.tsx`: Renders the read-only summary section declared on terminal states in `workflow.yml` — displays promoted field values, computed numeric results, and static text with optional `when` conditions.
- `PieceShareControls.tsx`: Owner-only sharing controls shown on terminal pieces — toggles the public sharing flag and provides a copyable share link.
- `PublicPieceShell.tsx`: Thin unauthenticated route wrapper that renders `PieceDetailPage` for publicly shared terminal pieces, without the main app shell.
- `DeveloperTokensDialog.tsx`: Settings dialog for managing `AgentToken`s used by external MCP/LLM clients (see [`api/README.md`](../api/README.md)) — lists existing tokens with last-used timestamps, creates new tokens (plaintext shown once, copy-to-clipboard), and revokes tokens.
- `LargeTutorialInlay.tsx`: Multi-page modal tutorial (title/body/bullets per page) driven by `tutorials.yml`, with a "don't show again" opt-out passed through `onComplete`/`onClose`.
- `AppFooterLinks.tsx`: Shared footer link row (e.g. terms/privacy/support), optionally rendered as a sticky bottom bar via the `sticky` prop.

## Piece list masonry data flow

`PieceList.tsx` is the unusual list container that must solve both product filtering and layout correctness at the same time. The reason it feels more complicated than a normal table is that the list used to flash an incorrect first frame whenever the grid mounted before width or height data was trustworthy.

The current design prevents that bad first frame:

- `useContainerPosition()` waits for a real container width before `MasonryScroller` mounts, because a width-0 first commit would poison the cache with chrome-only measurements.
- `PieceList` seeds Masonic's positioner before paint with crop-backed heights, because a post-mount correction pass is what caused the overlap/flicker race.
- Cards without crops intentionally stay on the default `itemHeightEstimate`, because their true height is not known until Masonic measures them.
- Each thumbnail shell reserves its crop aspect ratio up front, and `AppImage` receives matching dimensions so the image load does not force a second layout correction.

If this ever changes, the first question to ask is "will the first paint still be correct without relying on a later scroll or resize?" If the answer is no, the old bug is back.

## R2 image uploads (web)

Images attached to piece states are uploaded directly from the browser to Cloudflare R2 using short-lived presigned PUT URLs issued by Django — the R2 access keys never reach the browser.

Set these in `.env.local` before starting Django (all five required together):

```bash
export R2_ACCOUNT_ID=<cloudflare-account-id>
export R2_ACCESS_KEY_ID=<r2-token-key-id>
export R2_SECRET_ACCESS_KEY=<r2-token-secret>
export R2_BUCKET_NAME=<bucket-name>
export R2_PUBLIC_URL=<public-cdn-base-url>   # e.g. https://media.potterdoc.com
```

**How it works:**

1. `uploadImageToR2` (`src/util/r2Upload.ts`) downscales the image client-side (long edge capped at 2560px) so phone photos do not ship at full sensor resolution.
2. It calls `POST /api/uploads/r2/presigned-url/`, which validates the content type and returns `{upload_url, key, public_url, expires_in}` with a fully server-generated object key.
3. The bytes are PUT directly to R2; the signature in the URL is the credential. The resulting `{url, width, height}` is persisted through the normal `PATCH` state flow into the `CaptionedImage` record.
4. Images are rendered via `AppImage`, which displays `cropped_url ?? url`. Crops are materialized eagerly by the backend `generate_cropped_image` task — no request-time transforms.

R2 is optional in dev — if the env vars are not set, the presigned-url endpoint returns 503 and the upload button surfaces an error; already-stored URLs still render.

## Google OAuth (web)

PotterDoc supports Google Sign-In using OAuth 2.0 with OpenID Connect. To enable the Google sign-in button in the web UI:

1. **Create Google OAuth credentials:**
   - Go to [Google Cloud Console](https://console.cloud.google.com/)
   - Create/select a project
   - Enable the Google+ API
   - Create OAuth 2.0 credentials
   - Add authorized origins: `http://localhost:5173` (dev), your production domain
   - Add authorized redirect URIs: `http://localhost:5173` (dev), your production domain

2. **Configure environment variables:**
   Set these in `.env.local` before starting the development server:

   ```bash
   export GOOGLE_OAUTH_CLIENT_ID=<your-google-client-id>
   ```

   **Note on Build-time Variables:** The `GOOGLE_OAUTH_CLIENT_ID` is used by the Django backend to verify Google JWT tokens at runtime. However, because the frontend is a static bundle running in the browser, it must have this value "baked in" during the build step. In production, this is handled by the `ci.yml` workflow during the OCI image build. Local development reads the value directly from the shell environment during the Vite build, so set it before running Bazel instead of putting it in a `web/.env*` file.

3. **User flow:**
   - Existing email/password users can sign in with Google (account linking)
   - New Google users get accounts created automatically
   - Profile information (name, picture) syncs from Google on each login

## Authoring `custom_fields`

When you add an `custom_fields` entry to a state in `workflow.yml`, the web automatically renders the inputs for you inside the `WorkflowState` component. Inline JSON primitives, state references, and global references are all interpreted through the helper utilities in `src/util/workflow.ts` so the DSL does not need to be mentioned elsewhere in the code.

1. **Inline fields** (give the field a `type`, optional `description`, `required`, `enum`, and/or `format`). They render as `TextField`s—numbers as numeric inputs, booleans as selects with `True`/`False`, enums as dropdowns—directly below Notes and above the image list. The `format: hex_color` annotation (valid on `type: string` only) adds a backend pattern constraint that rejects values which are not valid CSS hex color codes (`#RGB`, `#RRGGBB`, `#RGBA`, or `#RRGGBBAA`).
2. **State refs** (`$ref: "ancestor_state.field_name"`) carry a value forward from a reachable ancestor state; they render the referenced value while still allowing edits and backend validation just like inline fields.
3. **Global refs** (`$ref: "@global_name.field_name"`) render as `Autocomplete` pickers populated from `/api/globals/<name>/`. When a `global` entry sets `can_create: true`, the Autocomplete offers a "Create …" option and posts to `/api/globals/<name>/` to create the referenced object before the main Save action persists the new value.

## Process Summary

States may declare a read-only `process_summary` section in `workflow.yml` that promotes values from earlier states for display. These summaries are display metadata only — they do not create new persisted fields.

Each summary item uses exactly one of `value` (display a field from a prior state), `compute` (display a numeric result), or `text` (static string). An optional `when` clause (`state_exists` or `state_missing`) hides the item when the condition is not met. `ProcessSummary.tsx` renders these sections in the piece detail and showcase views.

## Showcase View

The Showcase View is a high-fidelity, public-facing view of a piece, designed for sharing finished work. It separates the "Showcase" (result) from the "Process Summary" (how it was made).

- **Showcase Story**: A long-form narrative about the piece, edited by the owner in the Piece Detail page.
- **Showcase Fields**: A curated selection of fields from the piece's history to highlight in the showcase.
- **Process Summary**: The full technical process summary is also included at the bottom of the Showcase View.

Publicly shared pieces (available at `/pieces/:id`) default to the Showcase View for unauthenticated users. Owners can preview and edit the showcase elements directly from the Piece Detail page.

## Public sharing for terminal pieces

When a piece reaches a terminal state (`completed` or `recycled`), the owner can make it publicly viewable via `PieceShareControls`. A shared piece is readable at its canonical URL (`/pieces/:id`) by anyone — authenticated or not — without exposing the owner's private notes. The backend controls access via the `shared` field on `Piece`; the `can_edit: bool` flag in the API response tells the frontend whether to show owner controls.

## JavaScript dev tools

Prefer Python for standalone dev tooling when the dependency graph allows it. Use the JS tool path under [`scripts/`](scripts/) when the tool is naturally coupled to the web dependency graph or when the needed package exists in npm but not pip. Wire those scripts through [`BUILD.bazel`](BUILD.bazel) with `js_binary` and add a `vitest_test` when you want the tool itself covered by tests. [`scripts/generate-types.mjs`](scripts/generate-types.mjs) and [`scripts/coverage-audit.mjs`](scripts/coverage-audit.mjs) are the current examples.

## Swagger UI and API exploration

The interactive API docs are served by the running backend at:

```
http://localhost:8080/api/schema/swagger/
```

The API uses session/cookie authentication, so Swagger's "Authorize" button does nothing useful. To make authenticated requests from the Swagger UI:

1. Start the backend (`gz_start`).
2. Log in through the normal web UI at `http://localhost:5173` — this sets the session cookie in your browser.
3. Open `http://localhost:8080/api/schema/swagger/` **in the same browser**. The session cookie is sent automatically with every "Try it out" request.

If you see `403 Forbidden` responses, the session has expired or was never set — log in again via the web UI and reload the Swagger page.

## Using the App

Current web auth flow:

1. On app load, the client calls `/api/auth/me/`.
2. If authenticated, the user is routed into the main app shell.
3. If not authenticated, the login screen is shown.
4. After successful login, the app shell appears with a "Current user" chip and Log out button.

Frontend tracing is initialized from the same app bootstrap path and sends OTLP/HTTP
spans to `/api/telemetry/traces/`. The backend proxies those trace batches to the
collector, so the browser does not need any direct Grafana credentials.

Sign-up behavior (temporary):

- The backend registration endpoint (`POST /api/auth/register/`) remains available.
- The web Sign Up action is intentionally disabled (`SIGN_UP_ENABLED = false` in `src/App.tsx`).
- For now, create users manually in Django admin.
