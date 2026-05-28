# Workflow

`workflow.yml` is the declarative source of truth for piece states, transitions, globals, and custom fields. Both the backend and web derive their workflow behavior from this file rather than hardcoding state names or transition rules.

## What It Contains

- **State machine**: the set of valid piece states and the allowed transitions between them.
- **`globals`**: named domain types backed by Django models. Each entry drives both the backend and frontend. `api/model_factories.py` auto-generates the Django model class at import time, so adding a new global usually only requires a `makemigrations` run.
- **`custom_fields`**: state-specific fields declared with the embedded DSL. See [`api/README.md`](../api/README.md) and [`web/README.md`](../web/README.md) for the backend and frontend details.

## Related Docs

- [`workflow.schema.yml`](../workflow.schema.yml) defines the schema and validation rules for the file.
- [`tests/README.md`](../tests/README.md) covers the structural and semantic workflow tests.
