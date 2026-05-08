---
model: opus
created: 2026-05-08
modified: 2026-05-08
reviewed: 2026-05-08
name: glaze-workflow
description: |
  Glaze workflow state machine: workflow.yml schema, state/transition definitions,
  custom_fields DSL (inline fields, state refs, global refs), globals declarations,
  terminal state summaries. Invoke when an issue touches the state machine, global
  type definitions, custom_fields, or workflow.yml itself.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, TodoWrite
---

# Glaze Workflow State Machine

## Source of Truth

`workflow.yml` at the project root is the single source of truth for piece states,
transitions, globals, and per-state field definitions. Never hardcode state names or
transition rules — always derive them from this file.

**Schema validation:** `workflow.schema.yml` is a JSON Schema (Draft 2020-12) document
constraining `workflow.yml`. Required top-level fields: `version` (semver) and `states`
(array, ≥ 2 items). `globals` is optional. Per-state required: `id` (snake_case) and
`visible` (boolean). `additionalProperties: false` at both top level and per-state.

**Tests:** `tests/test_workflow.py` validates the file structurally and semantically:
- `TestSchemaValidation` — jsonschema validation + malformed-input rejection
- `TestReferentialIntegrity` — successor IDs reference real states, terminal states
  have no successors, non-terminal states have ≥ 1 successor, unique IDs, no self-refs
- `TestAdditionalFieldsDSL` — custom_fields referential integrity
- `TestGlobals` — globals entries map to real Django models; `public: true` globals
  have nullable `user` fields

## States

Each state must declare `friendly_name` and `description`. Clients use authored labels
directly — do not derive fallbacks from snake_case IDs.

| State | Friendly name | Description |
|---|---|---|
| `designed` | `Designing` | Piece conceived/designed — universal entry point |
| `wheel_thrown` | `Throwing` | Piece created on the wheel |
| `handbuilt` | `Handbuilding` | Piece hand-sculpted |
| `trimmed` | `Trimming` | Wheel-thrown piece trimmed |
| `slip_applied` | `Adding Slip` | Decorative slip added |
| `carved` | `Carving` | Surface carved or decorated |
| `submitted_to_bisque_fire` | `Queued → Bisque` | Ready for initial firing |
| `bisque_fired` | `Planning → Glaze` | Initial bisque fire complete |
| `waxed` | `Waxing` | Wax resist applied before glazing |
| `glazed` | `Glazing` | Glaze applied |
| `submitted_to_glaze_fire` | `Queued → Glaze` | Ready for glaze firing |
| `glaze_fired` | `Touching Up` | Glaze fire complete |
| `sanded` | `Sanding` | Final sanding/finishing |
| `completed` | `Completed` | Terminal — finished piece |
| `recycled` | `Recycled` | Terminal — piece discarded or clay reclaimed |

**Rules:**
- `designed` is the single entry point — `POST /api/pieces/` always creates in `designed`
- Every non-terminal state has `recycled` as a valid successor
- `completed` and `recycled` are terminal (`terminal: true`) — no transitions out
- Valid transitions are defined per-state in `workflow.yml`; validate on both backend and frontend

## `globals` Section

The optional top-level `globals` map registers named domain types backed by Django models.
Each entry declares the model class name (PascalCase) and a subset of fields exposed to
the field DSL. `api/models.py` remains authoritative — `globals` is a DSL-level view.

Three helpers in `api/workflow.py` expose globals info without leaking `_GLOBALS_MAP`:
- `is_public_global(name) -> bool`
- `get_public_global_models() -> list[type[Model]]`
- `get_image_fields_for_global_model(model_cls) -> list[str]`

**Optional flags per global entry:**
- `public` (default `false`): admin-managed shared library (user=NULL), visible to all
- `private` (default `true`): users can create their own instances
- `factory` (default `true`): set `false` for hand-written models (currently only `piece`)
- `favoritable` (default `false`): generates `FavoriteModel` subclass + favorites API
- `taggable` (default `false`): enables tag join-model support

Currently `clay_body` and `glaze_type` have `public: true`; `location` and `glaze_method`
are private-only.

**What belongs in `workflow.yml` vs. not:**
- **Belongs:** lifecycle states, successor relationships, whether a field/global exists,
  whether it is required, whether a global is public/private/favoritable/taggable, domain
  constraints that affect validation or persistence
- **Does not belong:** default colors, icon choices, display order chosen only for UX,
  component layout, presentation-layer defaults the backend doesn't need for validation

## `custom_fields` DSL

Each state may declare additional fields beyond base `PieceState` fields.

**Inline field:**
```yaml
clay_weight_grams:
  type: number          # string | number | integer | boolean | array | object | image
  description: "..."    # optional
  required: true        # optional, default false
  enum: [a, b, c]      # optional; only valid when type: string
  format: hex_color     # optional; only valid when type: string
```

The `image` type stores as `JSONField` containing `{"url": "...", "cloudinary_public_id": "..."}`.
When adding a new `type: image` field, also update the Cloudinary cleanup breakdown in
`api/cloudinary_cleanup.py`. The test
`test_reference_breakdown_covers_every_workflow_image_field` fails intentionally when
workflow image paths are missing.

**Ref field — state ref** (carries a field forward from a reachable ancestor):
```yaml
pre_trim_weight_grams:
  $ref: "wheel_thrown.clay_weight_grams"
  description: "..."    # optional override
  required: false       # optional override
```

**Ref field — global ref** (FK reference to a globals entry):
```yaml
kiln_location:
  $ref: "@location.name"
  description: "..."    # optional override
  required: true        # optional override
  can_create: true      # optional; allows inline creation of a new global instance
```

**Referential rules:**
- State refs: state must exist, field must be declared on it, state must be a reachable ancestor
- Global refs: global must be declared in `globals`, field must be declared in that global's `fields`
- `format` only on `type: string` fields
- `format: hex_color` emits a JSON Schema `pattern` constraint for CSS hex color validation

## Terminal State Summaries

Terminal states may declare a read-only `summary` section that promotes data from prior
states for display. Summary items are display metadata — they do not create new persisted fields.

```yaml
summary:
  sections:
    - title: Making
      fields:
        - label: Starting weight
          value: wheel_thrown.clay_weight_lbs
          when:
            state_exists: wheel_thrown
        - label: Trimming loss
          compute:
            op: difference   # product | difference | sum | ratio
            left: wheel_thrown.clay_weight_lbs
            right: trimmed.trimmed_weight_lbs
            unit: lb
            decimals: 2
          when:
            state_exists: trimmed
        - label: Wax resist
          text: Not recorded
          when:
            state_missing: waxed
```

Each item supports exactly one of: `value` (field from ancestor state), `compute`
(numeric result), or `text` (static string). `when` supports `state_exists` and
`state_missing`. Use separate items for path-specific display, not ternary logic.
