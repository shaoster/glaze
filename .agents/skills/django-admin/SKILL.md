---
model: opus
created: 2026-05-08
modified: 2026-05-08
reviewed: 2026-05-08
name: django-admin
description: |
  Django admin customization patterns: static files, inline group IDs, FK widget
  wrapping (RelatedFieldWidgetWrapper), debugging admin issues via test client,
  and tracing formfield_for_* methods. Invoke when working on admin views,
  inline formsets, custom widgets, or admin JS/CSS.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob, TodoWrite
---

# Django Admin Customization

## Static Files

App-level admin static files (CSS, JS) live in `<app>/static/admin/` and are served
automatically in development when `django.contrib.staticfiles` is in `INSTALLED_APPS`
and `DEBUG=True`. Reference them in an inline or `ModelAdmin` `Media` class:

```python
class Media:
    css = {'all': ('admin/css/my_widget.css',)}
    js = ('admin/js/my_script.js',)
```

## Inline Group IDs

Django derives an inline's form prefix from the **`related_name`** of the FK pointing
to the parent model, not from the child model's class name. A `GlazeCombinationLayer`
with `combination = ForeignKey(..., related_name='layers')` produces prefix `layers`,
so the inline group element is `id="layers-group"` and new rows have class
`dynamic-layers`. Keep this in mind when writing JavaScript targeting inline elements.

## FK Widget Customization (`RelatedFieldWidgetWrapper`)

Two-stage wrapping pipeline for FK fields on inlines:

1. `formfield_for_foreignkey` — called first; right place to restrict queryset or swap widget entirely. Widget is a plain `Select` at this point.
2. `formfield_for_dbfield` — called after; wraps widget in `RelatedFieldWidgetWrapper`, which sets `can_add_related`, `can_change_related`, `can_delete_related`, `can_view_related` from related model's admin permissions.

Any `can_*_related` flags set inside `formfield_for_foreignkey` are silently overwritten.
Override `formfield_for_dbfield` to set them post-wrap:

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

## Debugging Admin Issues

**Check the extension's documentation first** before scanning source code or guessing.
Many non-obvious constraints are documented explicitly (e.g. adminsortable2 documents
that unique constraints on ordering fields cause swap failures on SQLite and MySQL).

Render the actual change page through the test client and inspect the HTML:

```python
from django.test import Client
from django.contrib.auth import get_user_model

client = Client()
client.force_login(get_user_model().objects.get(is_superuser=True))
response = client.get('/admin/api/mymodel/1/change/')
html = response.content.decode()

print('JS loaded:', 'my_script.js' in html)
print('Delete button present:', 'delete-related' in html)

import re
print(re.findall(r'id="[^"]*-group"', html))
```

**Tracing a `formfield_for_*` method:**

```python
import api.admin as api_admin

orig = api_admin.MyInline.formfield_for_foreignkey
def traced(self, db_field, request, **kwargs):
    field = orig(self, db_field, request, **kwargs)
    print(db_field.name, type(field.widget).__name__,
          getattr(field.widget, 'can_delete_related', '—'))
    return field
api_admin.MyInline.formfield_for_foreignkey = traced

client.get('/admin/api/mymodel/1/change/')
```

Note: outside a real request context, `request.resolver_match` is `None`, which crashes
admin code reading URL kwargs. Use the test client to get a fully wired request.

**Checking static file discoverability:**

```python
from django.contrib.staticfiles import finders
print(finders.find('admin/js/my_script.js'))  # None → file not on the path
```
