---
name: stories
description: Auto-generate and update Storybook stories for web/* components using repository history (gh/git). Use when Storybook coverage is missing or needs enrichment with historical edge cases, rationale, and API mocking.
---

# Storybook Population

Use this skill to systematically increase and update Storybook coverage for frontend components by extracting context from the repository's history.

## Workflow

### 1. Component Audit

List all files in `web/src/components/` and check for matching stories in `web/src/stories/`. Prioritize components that:

1. Have no story file yet.
2. Are core domain entities (e.g., `PieceDetail`, `WorkflowState`, `GlobalEntryDialog`).
3. Have significant history in GitHub/Git that isn't captured in existing stories.

### 2. Trawl History

For each target component:

- **GitHub**: Use `gh pr list --search "Component" --state merged` and `gh issue list --search "Component" --state closed` to find the design rationale and reported bugs.
- **Git**: Use `git log -p <file>` to see how props and internal state have evolved.
- **Extraction**: Extract meaningful prop values, loading/error states, and specific workflow configurations (e.g., "how it looks when a Cloudinary upload fails").

### 3. Implementation

- **File Location**: `web/src/stories/[ComponentName].stories.tsx`.
- **Imports**:
  - `import type { Meta, StoryObj } from "@storybook/react";`
  - `import { fn } from "@storybook/test";` for callbacks.
  - `import { http, HttpResponse } from "msw";` for API mocking.
- **Meta Configuration**:
  - Set `tags: ["autodocs"]`.
  - Add a comprehensive JSDoc block to the `meta` object with **Rationale** and **Edge cases** sections.
- **Mocking (MSW)**:
  - All API calls (via `axios`, `useAsync`, etc.) **must** be mocked in `parameters.msw.handlers`.
  - Use `http.get("/api/...", () => HttpResponse.json(...))` to provide deterministic data.
- **Modal/Portal Handling**:
  - For components using MUI `Dialog` or `Modal`, set `docs: { inlineStories: false, iframeHeight: 600 }` in `parameters`.
  - Use a `render` function to wrap the modal in a "Toggle Button" so the Docs page remains interactive and readable.
  - **Show Source**: For stories using a "Toggle Button" wrapper, manually provide the real component usage in `parameters.docs.source.code` and omit the button code so the "Show Code" block remains relevant to the component being documented.
- **Data Variety**:
  - For components that take a list as their primary input (e.g., `ImageLightbox`, `PieceList`, `TagChipList`), ensure the story variants use **meaningfully distinct items**.
  - Avoid repeating the same image URL, name, or metadata across list items so navigation and visual variety can be properly verified.
  - **Unique IDs**: For objects in a list that have an `id` field, ensure they have **actually different IDs** (e.g., `id: "1"`, `id: "2"`) to ensure stable React keys and logical distinction between items.
- **useBlocker handling**:
  - For components that use `useBlocker` (e.g., `PieceDetail`), ensure the component is wrapped in a data router context (using `createMemoryRouter` + `RouterProvider` in decorators) to prevent Storybook from crashing.
- **Theming**:
  - Use `@storybook/theming` to set `docs: { theme: themes.dark }` in `preview.tsx` to match the app's dark mode and ensure contrast for all components.

### 4. Verification

- Run `rtk bazel run //web:storybook_dev` (via `gz_story`) and check the browser.
- Ensure the **Docs** tab renders the JSDoc rationale and all story variants correctly.
- Verify that MSW successfully intercepts backend requests (check the network tab).
- Run `rtk bazel build //web:storybook_build` to ensure the new stories don't break the static build.
- Launch the server `gz_story` on a custom port and verify the new stories are accessible and functional in the browser and don't error out.

## Quality Bar

- **Coverage**: Every non-internal component in `web/src/components/` should have a story.
- **Variants**: Include at least 3 variants (e.g., Default, Empty/Loading, Error).
- **Documentation**: JSDoc must cite the Issue/PR/Commit where the rationale was derived.
- **Stability**: Stories must never cause page-wide crashes or dimming of the Docs UI.
