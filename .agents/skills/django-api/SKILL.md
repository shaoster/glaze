---
model: opus
created: 2026-05-08
modified: 2026-05-08
reviewed: 2026-05-08
name: django-api
description: |
  Generic Django + DRF conventions: serializer rules, CORS, session auth,
  user-isolation patterns, production settings rules, and API testing approach.
  Invoke for any backend work touching serializers, views, auth, or request/response
  contracts — whether Glaze-specific or generic Django patterns.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, TodoWrite
---

# Django + DRF Conventions

## Stack

Django, Django REST Framework, SQLite (dev), django-cors-headers, drf-spectacular

## Conventions

- All API endpoints are registered in the root URL config
- Use DRF serializers for all request/response shaping — no raw `JsonResponse` with hand-built dicts
- Serializer output field names and nesting must match the frontend TypeScript types exactly
- Validate business logic server-side before persisting — including constraints that cannot be expressed at DB level. Load and cache static config files at startup; do not re-read per request
- DRF's OpenAPI schema generation is the source of truth for frontend type generation. Keep serializer field names, types, and nesting accurate
- CORS is installed (`corsheaders`); ensure it is in `MIDDLEWARE` and configured before shipping any cross-origin endpoint
- API auth is session-based (`SessionAuthentication`) with CSRF protection
- **User data isolation is mandatory:** list endpoints must scope to `request.user`; object lookups must use user-filtered querysets
- When a user requests another user's object ID, return `404` (not `403`) so object existence is not leaked
- **Generic code must not reference concrete subclasses by name.** A generic view handling all `GlobalModel` subclasses should depend only on the `GlobalModel` interface. Use explicit registries (dicts mapping model class → collaborator) or protocol attributes (`filterable_fields`, `get_favorite_ids_for`) to keep generic code decoupled

## Production Settings Rules

Gate dev/prod behavior on a single flag:
```python
IS_PRODUCTION = bool(os.environ.get('PRODUCTION', ''))
```

- `DEBUG` must be `False` in production (`DEBUG = not IS_PRODUCTION`)
- `SECRET_KEY` must be **required** in production — use `os.environ['SECRET_KEY']` (no `.get()` fallback) so the server fails loudly rather than running with an insecure default
- Never widen `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, or `CSRF_TRUSTED_ORIGINS` unconditionally — scope to known origins, add production hostnames via env vars gated on `IS_PRODUCTION`
- Database config should switch on `IS_PRODUCTION`: SQLite for dev, Postgres for prod
- Never add a setting required in production without either gating on `IS_PRODUCTION` or providing a safe non-functional dev default (empty string that disables the feature)
- Optional integrations (OAuth, third-party APIs): read from `os.environ.get('VAR', '')` and degrade gracefully when absent

## Testing

- Every new API endpoint or serializer change → add or update tests
- Pure helper functions → unit test with `monkeypatch` to decouple from real data files or configuration
- Prefer the API client (`client.post(...)`) for request/response tests over direct ORM
- Add new tests to the existing file covering the same module — do not create new cross-cutting test files

Run tests:
```bash
rtk bazel test //api:api_test
```
