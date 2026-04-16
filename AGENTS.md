# Glaze — Agent Guide

@docs/agents/glaze-domain.md
@docs/agents/django-drf-python.md
@docs/agents/typescript-react-vite.md
@docs/agents/github-interactions.md
@docs/agents/dev.md

---

## What goes where

Agent documentation is split across five files so that the generic stack guides can be reused in other projects without modification. When editing or adding documentation, put content in the right file:

| File | Contents |
|---|---|
| [`docs/agents/glaze-domain.md`](docs/agents/glaze-domain.md) | Everything specific to this project: the workflow state machine, `additional_fields` DSL, data model, key constraints, and Glaze-specific conventions layered on top of each stack (Django model patterns, frontend module aliases, component inventory, Cloudinary/OAuth flows, protected files, project-specific DoD checks). |
| [`docs/agents/django-drf-python.md`](docs/agents/django-drf-python.md) | Generic Django + DRF conventions reusable in any project: serializer rules, CORS setup, session auth, user-isolation patterns, test approach. No Glaze-specific models, endpoints, or admin customization. |
| [`docs/agents/typescript-react-vite.md`](docs/agents/typescript-react-vite.md) | Generic React + TypeScript + Vite conventions reusable in any project: MUI usage, strict TS rules, theming tokens, Axios usage, async test patterns. No Glaze-specific components, aliases, or data pipelines. |
| [`docs/agents/github-interactions.md`](docs/agents/github-interactions.md) | Generic GitHub agent conventions reusable in any project: `--body-file` pattern, branch naming, scope-limit categories, PR ownership labels, definition-of-done checklist. No Glaze-specific file paths. |
| [`docs/agents/dev.md`](docs/agents/dev.md) | Glaze-specific development setup and test commands: how to start the backend and web, all three test suites, CI configuration, and the per-layer "what to test" checklist. |
