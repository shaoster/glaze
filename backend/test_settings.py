from .settings import *  # noqa: F401,F403

# Speed up tests that create/authenticate users by using a lightweight hasher.
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

# Tests opt into dev bootstrap behavior explicitly when needed.
DEV_BOOTSTRAP_ENABLED = False
