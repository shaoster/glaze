# Multi-Version Workflow System

## Layout

```
workflow/
  <name>/
    v1.yml    ← one file per major version, edited in place for minor/patch
    v2.yml    ← created only when a breaking change is needed
  VERSIONING.md  ← this file
```

Rules:
- `<name>` is a lowercase identifier matching `^[a-z][a-z0-9_]*$`.
- `vN.yml` filename's `N` must equal the major component of its `version` field.
- Minor/patch bumps edit the existing file. Major bumps create a new file.
- `workflow.yml` at the repo root is a symlink to the primary workflow's highest-numbered `vN.yml`.

---

## Major vs. Minor/Patch

| Change | Where | DB migration? |
|---|---|---|
| Typo fix, description update | Edit `<name>/vN.yml` (minor bump) | No |
| New field on existing state | Edit `<name>/vN.yml` (minor bump) | Nullable column added |
| New state | Edit `<name>/vN.yml` (minor bump) | No |
| New global | Edit `<name>/vN.yml` (minor bump) | New table |
| Field removed or renamed | New `<name>/v(N+1).yml` (major bump) | Handled at v(N) sunset |
| Global removed | New `<name>/v(N+1).yml` (major bump) | Old table stays until v(N) retired |
| Field type changed | New `<name>/v(N+1).yml` (major bump) | Versioned column or migration |
| Entirely new workflow track | New `<new_name>/v1.yml` | New tables for any new globals |

Minor/patch changes must be **additive only** — no field removals, no type changes.
CI (`scripts/check_workflow_versions.py`) enforces this automatically.

---

## Piece Routing

Each `Piece` row stores two fields:

```python
workflow_name    = "standard"   # which workflow track
workflow_version = "1.2.3"      # full semver; only major component used for routing
```

Routing key: `(workflow_name, major_from_version(workflow_version))` → which `vN.yml` to load.

Auto-update: a piece created at `v1.0.0` automatically uses the latest `v1.y.z` rules because `v1.yml` is edited in place. No data migration is needed for minor/patch bumps.

---

## Backend Registry (`api/workflow.py`)

```python
_WORKFLOW_REGISTRY: dict[tuple[str, int], dict] = {}
# key = (workflow_name, major_version_int)
# value = parsed YAML dict

# Loaded at import time from all workflow/<name>/v*.yml files
```

All helpers accept optional `name` and `major` parameters, defaulting to the primary workflow's latest major.

---

## Globals: **Open Decision — Shared vs. Isolated**

When multiple named workflows exist, there are two options for how global types (ClayBody, Location, etc.) are scoped:

### Option A: Shared globals (recommended starting point)

All workflow tracks draw from the same pool of global types. `ClayBody` is `ClayBody` everywhere.

- One DB table per global — simple, no object duplication.
- Pieces from different workflow tracks can reference the same global objects.
- **Constraint**: two workflow tracks cannot define the same global name with incompatible field shapes. CI rejects this.

### Option B: Per-workflow-namespaced globals

Each track gets its own model namespace: `standard_ClayBody`, `educational_ClayBody`.

- Full isolation; tracks can evolve global schemas independently.
- Doubles (or triples) the table count.
- Objects cannot be shared across tracks.

**Decide before adding a second workflow track.** The choice is hard to reverse without a data migration. Option A is the right default unless the second workflow represents a truly independent domain with incompatible data.

---

## Database Strategy

`_register_globals()` in `api/models.py` builds a **merged globals map** across all loaded workflow files before generating Django model classes. `makemigrations` then picks up any new tables or nullable columns automatically.

For shared globals (Option A), the merged map is the union of all globals across all tracks and all major versions. For isolated globals (Option B), each track produces its own prefixed model set.

---

## Sunset Process for a Retired Major Version

When all pieces have left `standard/v1`:

1. Assert `Piece.objects.filter(workflow_name='standard', workflow_version__startswith='1.').count() == 0`.
2. Delete `workflow/standard/v1.yml`.
3. Run `makemigrations` — Django drops models no longer referenced by any remaining version file.
4. Update the `workflow.yml` symlink.

---

## Enforcement (`scripts/check_workflow_versions.py`)

CI checks on every PR:

1. Filename `vN.yml` matches the major component of `version` field inside the file.
2. Workflow directory name matches `^[a-z][a-z0-9_]*$`.
3. `version` field is monotonically non-decreasing vs. the prior committed value in the same file.
4. Minor/patch bumps are additive-only (no removals, no type changes).
5. For shared globals: same global name across tracks must have compatible field types.
6. `workflow.yml` symlink points to the primary track's highest-numbered `vN.yml`.
