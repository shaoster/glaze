"""Self-contained Django settings for the default test suite.

The default test configuration intentionally avoids importing backend.settings so
tests do not inherit production-only branches by accident.
"""

import os
from pathlib import Path

import dj_database_url

BASE_DIR = Path(__file__).resolve().parent.parent

# Default test runs should be deterministic and not depend on production env vars.
IS_PRODUCTION = False
SECRET_KEY = os.environ.get(
    "SECRET_KEY",
    "django-insecure-$jk-$#)vf5(ui&x2=atf+lj(zy6pxcu*ia7%z$kersf*7yrx%",
)
DEBUG = True

ADMIN_URL = os.environ.get("ADMIN_URL", "admin")
ADMIN_INGRESS_HOST = os.environ.get("ADMIN_INGRESS_HOST", "")

ALLOWED_HOSTS = ["localhost", "127.0.0.1"]
_ALLOWED_HOSTS_ENV = os.environ.get("ALLOWED_HOSTS", os.environ.get("ALLOWED_HOST", ""))


def _shared_cookie_domain(host: str) -> str | None:
    host = host.strip()
    if not host:
        return None
    if host.startswith("www."):
        host = host.removeprefix("www.")
    if "." not in host or host == "localhost":
        return None
    return f".{host}"


def _add_allowed_host(host: str, *, allow_www: bool) -> None:
    host = host.strip()
    if not host:
        return
    ALLOWED_HOSTS.append(host)
    if allow_www and "." in host and not host.startswith("www."):
        ALLOWED_HOSTS.append(f"www.{host}")


if _ALLOWED_HOSTS_ENV:
    for host in _ALLOWED_HOSTS_ENV.split(","):
        _add_allowed_host(host, allow_www=True)

if ADMIN_INGRESS_HOST:
    _add_allowed_host(ADMIN_INGRESS_HOST, allow_www=False)

CORS_ALLOW_CREDENTIALS = True
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^http:\/\/localhost:*([0-9]+)?$",
    r"^https:\/\/localhost:*([0-9]+)?$",
]
CSRF_TRUSTED_ORIGINS = []
CORS_ALLOWED_ORIGINS = []
_APP_ORIGIN = os.environ.get("APP_ORIGIN", "")
if _APP_ORIGIN:
    CORS_ALLOWED_ORIGINS.append(_APP_ORIGIN)
    CSRF_TRUSTED_ORIGINS.append(_APP_ORIGIN)

_COOKIE_DOMAIN = _shared_cookie_domain(
    _ALLOWED_HOSTS_ENV.split(",")[0]
    if _ALLOWED_HOSTS_ENV
    else os.environ.get("ALLOWED_HOST", "")
)
if _COOKIE_DOMAIN:
    SESSION_COOKIE_DOMAIN = _COOKIE_DOMAIN


INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sites",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "adminsortable2",
    "import_export",
    "meta",
    "rest_framework",
    "corsheaders",
    "drf_spectacular",
    "helpdesk.apps.HelpdeskConfig",
    "api",
]

HELPDESK_TEAMS_MODE_ENABLED = False

PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework.authentication.SessionAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.IsAuthenticated",
    ],
    "DEFAULT_THROTTLE_RATES": {
        "invite_send": "60/hour",
    },
}

SPECTACULAR_SETTINGS = {
    "TITLE": "PotterDoc API",
    "DESCRIPTION": (
        "Pottery workflow tracking API.\n\n"
        "**Authentication:** All endpoints (except auth and public piece reads) "
        "require a session cookie. To authenticate in this UI, click **Authorize** "
        "and paste the value of your `sessionid` cookie. You can obtain it by "
        "logging in through the web app and copying the cookie from your browser's "
        "DevTools (Application → Cookies → `sessionid`)."
    ),
    "VERSION": "0.0.1",
    "SECURITY": [{"cookieAuth": []}],
    "COMPONENTS": {
        "securitySchemes": {
            "cookieAuth": {
                "type": "apiKey",
                "in": "cookie",
                "name": "sessionid",
                "description": (
                    "Django session cookie. Log in via the web UI, then copy the "
                    "`sessionid` value from DevTools → Application → Cookies."
                ),
            }
        }
    },
}

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "backend.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

WSGI_APPLICATION = "backend.wsgi.application"
ASGI_APPLICATION = "backend.asgi.application"

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = False
SESSION_COOKIE_SECURE = False
CSRF_COOKIE_SECURE = False
SECURE_HSTS_SECONDS = 0
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
SECURE_SSL_REDIRECT = False
SECURE_REDIRECT_EXEMPT = []

if os.environ.get("DATABASE_URL"):
    DATABASES = {"default": dj_database_url.config(conn_max_age=0)}
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": str(BASE_DIR / "db.sqlite3"),
        }
    }

AUTH_PASSWORD_VALIDATORS = []

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
_WEB_DIST = BASE_DIR / "web" / "dist"
if _WEB_DIST.is_dir():
    WHITENOISE_ROOT = _WEB_DIST
    STATICFILES_DIRS = [_WEB_DIST]

STORAGES = {
    "default": {
        "BACKEND": "django.core.files.storage.FileSystemStorage",
    },
    "staticfiles": {
        "BACKEND": "whitenoise.storage.CompressedStaticFilesStorage",
    },
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

GOOGLE_OAUTH_CLIENT_ID = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "")
GOOGLE_OAUTH_CLIENT_SECRET = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", "")

# Tests should opt into development bootstrap behavior explicitly when needed.
DEV_BOOTSTRAP_ENABLED = False

REMOTE_REMBG_URL = os.environ.get("REMOTE_REMBG_URL", "")
MODAL_AUTH_TOKEN = os.environ.get("MODAL_AUTH_TOKEN", "")

DEFAULT_FROM_EMAIL = os.environ.get("DEFAULT_FROM_EMAIL", "noreply@potterdoc.com")
INVITE_LINK_BASE_URL = os.environ.get("INVITE_LINK_BASE_URL", "http://localhost:5173")
EMAIL_BACKEND = os.environ.get(
    "EMAIL_BACKEND", "django.core.mail.backends.console.EmailBackend"
)
EMAIL_HOST = os.environ.get("EMAIL_HOST", "localhost")
EMAIL_PORT = int(os.environ.get("EMAIL_PORT", "1025"))
EMAIL_HOST_USER = os.environ.get("EMAIL_HOST_USER", "")
EMAIL_HOST_PASSWORD = os.environ.get("EMAIL_HOST_PASSWORD", "")
EMAIL_USE_SSL = False

REDIS_CACHE_URL = os.environ.get("REDIS_CACHE_URL", "")
if REDIS_CACHE_URL:
    CACHES = {
        "default": {
            "BACKEND": "django_redis.cache.RedisCache",
            "LOCATION": REDIS_CACHE_URL,
            "OPTIONS": {
                "CLIENT_CLASS": "django_redis.client.DefaultClient",
            },
        }
    }
else:
    CACHES = {
        "default": {
            "BACKEND": "django.core.cache.backends.dummy.DummyCache",
        }
    }

CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "")
ASYNC_TASK_BACKEND = os.environ.get(
    "ASYNC_TASK_BACKEND", "celery" if CELERY_BROKER_URL else "inmemory"
)

CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_BACKEND = None
CELERY_TASK_TRACK_STARTED = True
CELERY_TASK_TIME_LIMIT = 30 * 60

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "console": {
            "format": "%(levelname)s %(asctime)s %(name)s [trace=%(trace_id)s] %(message)s",
        },
    },
    "filters": {
        "otel_trace": {
            "()": "api.logging.OtelTraceFilter",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "console",
            "filters": ["otel_trace"],
        },
    },
    "root": {
        "handlers": ["console"],
        "level": "INFO",
    },
    "loggers": {
        "django": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": True,
        },
        "django.request": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "api": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}

SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
SECURE_CROSS_ORIGIN_OPENER_POLICY = "same-origin-allow-popups"
CSRF_COOKIE_NAME = "potterdoc_csrftoken"
