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

## Django admin customisation

### Static files

App-level admin static files (CSS, JS) live in `<app>/static/admin/` and are served automatically in development when `django.contrib.staticfiles` is in `INSTALLED_APPS` and `DEBUG=True` — no `collectstatic` needed. Reference them in an inline or `ModelAdmin` `Media` class using the path relative to the `static/` root:

```python
class Media:
    css = {'all': ('admin/css/my_widget.css',)}
    js = ('admin/js/my_script.js',)
```

### Inline group IDs

Django derives an inline's form prefix from the **`related_name`** of the FK that points to the parent model, not from the child model's class name. A `GlazeCombinationLayer` with `combination = ForeignKey(..., related_name='layers')` produces the prefix `layers`, so the inline group element in the DOM is `id="layers-group"` and new rows have class `dynamic-layers`. Keep this in mind when writing JavaScript that targets inline elements by id or class.

### FK widget customisation (`RelatedFieldWidgetWrapper`)

When customising a FK field on an inline, be aware of the two-stage wrapping pipeline:

1. `formfield_for_foreignkey` — called first; the right place to restrict the queryset or swap the widget entirely. At this point the widget is a plain `Select`.
2. `formfield_for_dbfield` — called after; wraps the widget in `RelatedFieldWidgetWrapper`, which adds the add/change/delete/view icon links and sets `can_add_related`, `can_change_related`, `can_delete_related`, and `can_view_related` from the related model's admin permissions.

Because the wrapper is applied **after** `formfield_for_foreignkey` returns, any `can_*_related` flags set inside `formfield_for_foreignkey` are silently overwritten. Override `formfield_for_dbfield` to set them post-wrap:

```python
def formfield_for_foreignkey(self, db_field, request, **kwargs):
    if db_field.name == 'my_fk':
        kwargs['queryset'] = MyModel.objects.filter(...)  # queryset goes here
    return super().formfield_for_foreignkey(db_field, request, **kwargs)

def formfield_for_dbfield(self, db_field, request, **kwargs):
    field = super().formfield_for_dbfield(db_field, request, **kwargs)
    if db_field.name == 'my_fk' and hasattr(field, 'widget'):
        field.widget.can_delete_related = False  # widget flags go here
    return field
```

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
