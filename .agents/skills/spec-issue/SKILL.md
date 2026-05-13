---
model: opus
created: 2026-05-08
modified: 2026-05-08
reviewed: 2026-05-08
name: spec-issue
description: |
  Interactively draft and file a new GitHub issue. Use when the developer wants
  to define, scope, or report something rather than implement it. Produces a
  GitHub issue — no code changes, no file edits.
allowed-tools: Bash, Read, WebFetch
---

# Spec Issue

**Mode: issue authoring. This session produces a GitHub issue body. No code changes,
no file edits, no commits.**

## Flow

### 1. Orient

Ask the user one question before loading any context:

> What layer or feature does this touch, and is this a bug report, a feature
> request, or a task/chore?

Use the answer to determine which 1–2 resources to read. Do not load everything.

| Touches | Read |
|---|---|
| Workflow state machine, globals DSL, `workflow.yml` | `.agents/skills/glaze-workflow/SKILL.md` |
| Backend models, API, serializers, admin | `.agents/skills/glaze-backend/SKILL.md` |
| Frontend components, UI, type pipeline | `.agents/skills/glaze-frontend/SKILL.md` |
| Django/DRF conventions | `.agents/skills/django-api/SKILL.md` |
| Testing infrastructure | `.agents/skills/dev-testing/SKILL.md` |
| CI / GitHub Actions | `.agents/skills/github-actions/SKILL.md` |

Also read `.agents/skills/github-pr/SKILL.md` for issue-writing conventions and
scope limits — always, regardless of layer.

### 2. Elicit

Ask focused follow-up questions to gather what the issue needs. Stop when you have:

- **What** — the specific behavior, missing feature, or broken thing
- **Why** — the impact or motivation
- **Scope** — what is and isn't included (check against scope limits in `github-pr/SKILL.md`)
- **Acceptance criteria** — how will we know it's done

Do not ask more than three follow-up questions. If something is unclear, make a
reasonable assumption and state it in the issue body for the user to correct.

### 3. Draft

Write the issue using correct Glaze terminology from the loaded resources.
Structure:

```markdown
## Problem / Motivation
<what is wrong or missing, and why it matters>

## Proposed Solution
<what should happen instead, or what should be added>

## Acceptance Criteria
- [ ] ...
- [ ] ...

## Out of Scope
<explicit exclusions if useful>
```

For bug reports, replace "Proposed Solution" with "Expected Behavior" and add a
"Steps to Reproduce" section.

Keep the title under 70 characters and action-oriented:
- Bug: `fix: <what is broken>`
- Feature: `feat: <what it enables>`
- Chore: `chore: <what changes>`

### 4. Discuss & Refine

After presenting the draft, do not immediately ask to file. Instead, ask:
> Does this spec capture your intent, or are there parts we should discuss and
> refine?

Enter a conversational phase. Answer questions, clarify technical trade-offs,
and gather feedback **without re-drafting the entire body** until the user is
satisfied. This keeps the UI focused and saves tokens.

Once the user approves the refined direction, present the **Final Draft**.

### 5. Confirm and file

Show the final proposed title and body. Incorporate any last-second tweaks, then
file:

```bash
cat > /tmp/issue-body.md << 'EOF'
<body>
EOF

gh issue create \
  --title "<title>" \
  --body-file /tmp/issue-body.md
```

Report the created issue URL.
