---
model: opus
created: 2026-06-13
modified: 2026-06-13
reviewed: 2026-06-13
name: tutorial-wizard
description: |
  Interactive wizard for authoring a new tutorials.yml entry. Guides a developer
  through an anchored (coachmark) or modal (full-screen walkthrough) tutorial via
  conversation. Phase 1: elicits requirements, proposes a YAML entry, and files a
  GitHub issue. Phase 2: when invoked via /do on the filed issue, creates a
  worktree, appends tutorials.yml, validates with gz_test, offers a dev preview,
  and opens a PR.
allowed-tools: Bash, Read, Edit, Write, Grep, Glob, AskUserQuestion
frontmatter-refs:
  - tutorials.schema.yml
  - tutorials.yml
---

# Tutorial Wizard

This skill has **two phases**:

- **Phase 1** — invoked directly via `/tutorial-wizard`: conversational elicitation → GitHub issue filed. No code changes.
- **Phase 2** — invoked via `/do #<issue>` on a tutorial-wizard spec issue (recognizable by the "## Tutorial Spec" section): create worktree → append entry → validate → optional dev preview → open PR.

Detect which phase you are in from context. If no issue number is in scope and no "Tutorial Spec" issue body is referenced, you are in Phase 1.

---

## Phase 1 — Spec Flow

### Step 0 — Bootstrap (silent, no user-facing output)

Before asking any question, read both:

1. `tutorials.schema.yml` — full schema: `oneOf` discriminant, anchored vs modal branches, `placement` enum, `action.type` enum, `selector` description and conditional selector patterns, `pages` constraints
2. `tutorials.yml` — existing entries for context (avoid duplicate IDs, understand naming conventions)

Do not summarize or describe what you read. Proceed to Step 1.

### Step 1 — Orient

Ask the user **one open-ended question** with no type menu or options list:

> "What moment in the product do you want to guide the user through? Describe the UI situation, the action you want them to take, and roughly how often this guidance should appear."

### Step 2 — Infer the tutorial type (do not ask directly)

Analyze the description. Apply these heuristics:

**Anchored** when:
- There is a specific UI element (button, chip, icon, input) the guidance attaches to
- One sentence of guidance is sufficient
- The guidance should appear contextually whenever the element is visible

**Modal** when:
- The moment is a first-launch or major feature introduction
- Multiple pages of explanation are warranted
- There is no single focal element — the guidance is about a whole page or flow
- A route context (e.g. `/pieces`) makes more sense than an element selector

Present the recommendation as a natural consequence of what they described — not a binary choice. Example:

> "Based on what you described, this sounds like an **anchored** tutorial — a tooltip that appears next to the [element name] whenever a user first encounters it. Does that fit, or were you thinking of something more prominent like a full-screen walkthrough?"

If the user's description is genuinely ambiguous, briefly explain the trade-off and ask which direction they prefer.

### Step 3 — Mode-specific elicitation

#### Anchored path

**Selector**

If the user provides a CSS selector, use it. Otherwise, ask them to describe the target element by name or purpose, then search the codebase:

```bash
grep -rn 'data-testid=\|id="\| id=\|aria-label=' web/src/ | grep -i "<name>"
```

Present up to 5 matches with `file:line: <attribute value>` context. Let the user choose. From the chosen match, suggest the minimal valid selector (e.g. `#user-chip`, `[data-testid="new-piece-button"]`).

**Conditionality**

If the user describes the tutorial appearing only under certain conditions ("only when the button is enabled", "only when the modal is open", "only for new users"), proactively suggest a conditional CSS selector using patterns documented in `tutorials.schema.yml`. Do not wait for the user to ask — offer it based on what they described. Examples:

| Condition | Selector pattern |
|---|---|
| Only when enabled | `#btn:not([disabled])` |
| Only when disabled | `#btn[disabled]` |
| Only when ancestor is expanded | `[aria-expanded="true"] #child` |
| Scoped to a container | `#parent #child` |

Explain that `TutorialManager` uses a `MutationObserver` with `attributes: true`, so the inlay appears and disappears reactively as the DOM attribute changes — no page reload needed.

**Placement**

Based on the element's likely screen position (inferred from its name, the file it appears in, and any surrounding layout code visible in the grep results), suggest a placement from: `top` / `bottom` / `left` / `right`.

- `top` — good for inline elements or rows with space above
- `bottom` — good for elements near the top of the viewport
- `left` — good for elements anchored to the right side (e.g. user chip in a toolbar)
- `right` — good for elements anchored to the left side (e.g. sidebar items)

Note: `bottom` is in the schema; if it is not yet implemented in `SmallTutorialInlay`, flag this in the issue so it can be added in the same PR.

Ask the user to confirm the suggested placement.

**Action**

Explain the two action types:

- `dismiss-only` — clicking the tutorial bubble simply dismisses it. Use when the tutorial is purely informational.
- `open-preferences` — clicking opens the user preferences dialog to a specific section. Use when you want the user to immediately adjust a setting they may not know about.

Ask which fits. If `open-preferences`, search for valid section IDs:

```bash
grep -rn 'PreferencesSectionId\|"section"' web/src/ | grep -v test | head -20
```

Show the available values and ask the user to pick one.

**Copy**

Collect:
- `inlay.label` — the tooltip sentence (one line, action-oriented)
- `inlay.dismiss_label` — accessible label for the dismiss button (e.g. "Dismiss alias tip")

#### Modal path

**Route**

Ask the user which page or feature area the tutorial should appear on. Search for existing routes:

```bash
grep -rn 'path=\|<Route' web/src/ | grep -v test | head -40
```

Present candidates. Suggest the most exact match (e.g. `/pieces` rather than `/pieces/*` to avoid matching child routes that open their own modals).

If no matching route exists, say so and offer to scope route creation into the issue. Ask the user to describe the intended URL pathname and what page/component it would render.

**Copy organization**

Ask the user to describe the full flow: what does the user need to learn, and in what order? Use codebase context to inform copy suggestions — search for comments, JSDoc, or documentation near the components related to the feature:

```bash
grep -rn '//' web/src/components/<ComponentName>.tsx | head -30
```

Suggest a page breakdown (2–5 pages). Each page should answer one question the user might have. Use this structure for each page:

- `title` — short, specific (supports `<em>italic</em>` spans for emphasis)
- `body` — 1–3 sentences
- `bullets` — optional list of up to 4 concrete takeaways

Present the draft page structure and ask the user to review, edit, or approve each page in turn.

Also ask about:
- `completeLabel` — the CTA on the last page. Suggest one based on the described flow (e.g. "Start creating pieces"). Defaults to "Start using PotterDoc".
- `eyebrow` — the header label. Defaults to "Welcome to PotterDoc · Quick tour".

**Copy**

Collect:
- `inlay.label` — human-readable name for this tutorial (used in preferences UI)
- `inlay.dismiss_label` — accessibility label for the close button

### Step 4 — Preference label + key

Suggest:
- `tutorial_id` — a `snake_case` key derived from the tutorial's subject (e.g. `welcome_pieces`, `alias_tip`)
- `preference.label` — the checkbox label in user preferences (e.g. "Show the alias customization tip")
- `preference.hint` — one-line description (e.g. "Controls the alias guidance shown on the piece list.")

Ask the user to confirm or edit all three.

### Step 5 — Draft and file the issue

Compose the GitHub issue body in this format:

```markdown
## Tutorial Spec

**Type:** anchored | modal
**Summary:** <one sentence describing the tutorial's purpose>

## YAML Entry

```yaml
<proposed tutorials.yml entry with tutorial_id as key>
```

## Implementation Notes

<any conditionality notes, selector rationale, route creation needed, etc.>

## Acceptance Criteria

- [ ] `gz_test //:tutorials_schema_test` passes with the new entry
- [ ] Tutorial appears correctly in the dev environment
- [ ] Dismissed state is persisted to user preferences
- [ ] (anchored) Tutorial disappears when the anchor element is removed or its state no longer matches the selector
- [ ] (modal) Tutorial does not appear on routes other than the specified route
```

Present the draft. Ask:

> "Does this capture the intent? I'll file the issue once you confirm, and then you can run `/do #<number>` to implement it."

Incorporate any final edits, then file:

```bash
cat > /tmp/tutorial-wizard-issue.md << 'BODY'
<body>
BODY

gh issue create \
  --title "feat(tutorials): <descriptive title under 70 chars>" \
  --body-file /tmp/tutorial-wizard-issue.md
```

Report the URL and remind the user: **"Run `/do #<number>` to implement this tutorial."**

---

## Phase 2 — Execution Flow

This phase is triggered when `/do` is invoked on an issue whose body contains a "## Tutorial Spec" section. The `/do` skill's plan mode should recognize this pattern and hand off to these steps.

### Step 1 — Worktree creation

```bash
git worktree add .agent-worktrees/claude/issue-<N>-<slug> -b issue/<N>-<slug> main
```

Announce the absolute path:
```
Worktree: /home/phil/code/glaze/.agent-worktrees/claude/issue-<N>-<slug>
```

All subsequent file changes happen inside this worktree.

### Step 2 — Implement

Extract the YAML block from the issue body. Append the entry to `tutorials.yml` in the worktree.

If the issue notes that a route needs to be created, create it in the frontend router (follow `glaze-frontend/SKILL.md` for router patterns). If `bottom` placement is needed and not yet implemented in `SmallTutorialInlay`, implement it (one-line addition to the placement map).

### Step 3 — Validate

```bash
gz_test //:tutorials_schema_test
```

If the test fails, show the error and fix the entry before proceeding.

### Step 4 — Dev preview offer

Before opening the PR, ask:

> "Would you like to verify the tutorial in the dev environment before I open the PR? I can start the server with `gz_start` so you can see it live."

If yes, follow `dev-environment/SKILL.md` to start the server. Walk the user through navigating to the relevant page/element and confirming the tutorial appears and dismisses correctly. Wait for confirmation before continuing.

### Step 5 — Open PR

Follow `github-pr/SKILL.md`. The PR title should follow the pattern:
`feat(tutorials): <description>`

Include a brief description of the tutorial's purpose, the selector or route used, and a note about how to verify it in the dev environment.
