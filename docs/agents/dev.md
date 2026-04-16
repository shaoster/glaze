# Glaze — Development Setup & Testing

## Development Setup

```bash
# Backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python manage.py migrate
python manage.py runserver 8080

# Web (separate terminal)
cd web
npm install
npm run dev
```

See [`env.sh`](../../env.sh) for shell helpers (`gz_setup`, `gz_start`, etc.) that wrap these commands.

---

## Environment variables

All vars are optional. The app runs without any of them; each missing group degrades gracefully.

**`.env.local`** (loaded by `source env.sh`, read by Django):

| Variable | Absent behaviour |
|---|---|
| `CLOUDINARY_CLOUD_NAME` | `/api/uploads/cloudinary/widget-config/` returns 503; UI falls back to URL-paste mode |
| `CLOUDINARY_API_KEY` | same as above |
| `CLOUDINARY_API_SECRET` | same as above |
| `CLOUDINARY_UPLOAD_FOLDER` | uploads go to the root of the Cloudinary account (optional) |
| `GOOGLE_OAUTH_CLIENT_ID` | `POST /api/auth/google/` is non-functional; email/password login still works |

**`web/.env.local`** (read by Vite, injected into the frontend bundle):

| Variable | Absent behaviour |
|---|---|
| `VITE_GOOGLE_CLIENT_ID` | Google Sign-In button is not rendered; must match `GOOGLE_OAUTH_CLIENT_ID` |

---

## Testing

**All proposed changes must pass the full test suite before being submitted.**

### Common (workflow validation)

```bash
pip install -r requirements-dev.txt
pytest tests/                          # run from the repo root
```

Tests live in [`tests/test_workflow.py`](../../tests/test_workflow.py). This suite validates `workflow.yml` both structurally (via `jsonschema` against `workflow.schema.yml`) and semantically (referential integrity checks that JSON Schema cannot express). Run this suite whenever `workflow.yml` or `workflow.schema.yml` is modified.

### Backend

```bash
pip install -r requirements-dev.txt   # includes pytest and pytest-django
pytest api/                            # run from the repo root
```

Tests live in [`api/tests/`](../../api/tests/). `pytest.ini` points pytest at `backend.settings` automatically — no extra configuration needed.

### Web

```bash
cd web
npm install
npm test          # single run (used in CI)
npm run test:watch  # watch mode for development
```

Tests live in two places:
- [`web/src/components/__tests__/`](../../web/src/components/__tests__/) — component tests (jsdom + Testing Library)
- [`frontend_common/src/workflow.test.ts`](../../frontend_common/src/workflow.test.ts) — unit tests for `workflow.ts` helpers (picked up by the web vitest config via an explicit `include` glob)

The test environment is jsdom; setup file is [`web/src/test-setup.ts`](../../web/src/test-setup.ts).

### Production build

```bash
./build.sh
```

`build.sh` runs the full production pipeline: installs Python deps, starts Django temporarily to generate TypeScript types from the live OpenAPI schema, builds the React frontend (`npm run build`), runs `collectstatic`, and applies migrations. It must pass before a PR is merged.

### CI

GitHub Actions runs all three test suites (`common`, `backend`, `web`) plus a `web-build` job (type generation + `npm run build`) in parallel on every push and pull request — see [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml). A PR should not be merged if any job is red.

### What to test

- Any change to `workflow.yml` or `workflow.schema.yml` → verify `pytest tests/` passes.
- Every new API endpoint or serializer change → add or update a test under `api/tests/`.
- Every new or modified React component → add or update a test in `web/src/components/__tests__/`.
- Every new or modified `workflow.ts` helper → add or update a test in `frontend_common/src/workflow.test.ts`, mocking `workflow.yml` with a minimal fixture.
- Every new or modified `api/workflow.py` helper → add or update a test in `api/tests/test_workflow_helpers.py`, patching `_STATE_MAP` / `_GLOBALS_MAP` via `monkeypatch`.
