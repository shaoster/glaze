# Django + DRF + Python Guide

## Stack

Django, Django REST Framework, SQLite (dev), django-cors-headers

## Conventions

- All API endpoints are registered in the root URL config.
- Use DRF serializers for all request/response shaping — no raw `JsonResponse` with hand-built dicts.
- Serializer output field names and nesting must match the frontend TypeScript types exactly.
- Validate business logic (e.g. state machine transitions) server-side before persisting. Load and cache configuration files (e.g. a workflow definition) at startup — do not re-read them per request.
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
