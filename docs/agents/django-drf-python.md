# Django + DRF + Python Guide

## Scaffolding a new project

```bash
# Create project and app
pip install django djangorestframework django-cors-headers drf-spectacular dj-database-url whitenoise
django-admin startproject backend .
python manage.py startapp api

# Add to INSTALLED_APPS in settings.py:
#   'rest_framework', 'corsheaders', 'drf_spectacular', 'api'
# Add CorsMiddleware to MIDDLEWARE (before CommonMiddleware)
# Add REST_FRAMEWORK default auth/permission classes
# Add SPECTACULAR_SETTINGS dict

python manage.py migrate
python manage.py createsuperuser
python manage.py runserver 8080
```

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

## Production environment variables and settings

Gate dev/prod behaviour on a single `IS_PRODUCTION` flag derived from one env var, rather than scattering `os.environ` checks throughout `settings.py`:

```python
IS_PRODUCTION = bool(os.environ.get('PRODUCTION', ''))
```

**Rules when modifying settings:**

- `DEBUG` must be `False` in production (`DEBUG = not IS_PRODUCTION`). `DEBUG = True` exposes full stack traces to the browser and disables several security checks.
- `SECRET_KEY` must be **required** in production — use `os.environ['SECRET_KEY']` (no `.get()` fallback) so the server fails loudly at startup rather than running with an insecure default.
- Never widen `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`, or `CSRF_TRUSTED_ORIGINS` unconditionally — all three must remain scoped to known origins. Add production hostnames via env vars gated on `IS_PRODUCTION`.
- Database config should switch on `IS_PRODUCTION`: SQLite for dev, a production database (e.g. Postgres via `dj_database_url`) for prod.
- Never add a new setting that requires a value in production without either gating it on `IS_PRODUCTION` or providing a safe, non-functional dev default (e.g. an empty string that disables the feature).
- Optional integrations (OAuth, third-party APIs) should read from `os.environ.get('VAR', '')` and degrade gracefully when absent, so the dev environment works without credentials.

See the project domain guide for the specific env vars and their per-environment behaviours in this codebase.

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
