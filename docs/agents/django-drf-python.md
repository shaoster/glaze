# Django + DRF + Python Guide

## Stack

Django, Django REST Framework, SQLite (dev), django-cors-headers

## Conventions

- All API endpoints are registered in the root URL config.
- Use DRF serializers for all request/response shaping — no raw `JsonResponse` with hand-built dicts.
- Serializer output field names and nesting must match the frontend TypeScript types exactly.
- Validate business logic server-side before persisting — including constraints that cannot be expressed at the DB level (e.g. rules derived from static reference data loaded from a config file). Load and cache such config files at startup; do not re-read them per request.
- DRF's OpenAPI schema generation (`drf-spectacular` or similar) is the source of truth for the frontend type generation pipeline. Keep serializer field names, types, and nesting accurate — the frontend generates its TypeScript types directly from the live schema endpoint.
- CORS is installed (`corsheaders`); ensure it is in `MIDDLEWARE` and configured before shipping any cross-origin endpoint.
- The database is SQLite during development; avoid raw SQL.
- API auth is session-based (`SessionAuthentication`) with CSRF protection.
- User data isolation is mandatory: list endpoints must scope to `request.user`, and object lookups must use user-filtered querysets.
- When a user requests another user's object ID, return `404` (not `403`) so object existence is not leaked.

## Testing

```bash
pip install -r requirements-dev.txt
pytest api/
```

`pytest.ini` should point pytest at the correct Django settings automatically — no extra configuration needed.

### What to test

- Every new API endpoint or serializer change → add or update tests.
- Pure helper functions → unit test with `monkeypatch` to decouple from real data files or configuration.
- Prefer the API client (`client.post(...)`) for tests that exercise request/response behaviour over creating objects directly via the ORM.
