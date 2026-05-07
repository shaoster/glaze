from .settings import *  # noqa: F401,F403

# Speed up tests that create/authenticate users by using a lightweight hasher.
PASSWORD_HASHERS = [
    "django.contrib.auth.hashers.MD5PasswordHasher",
]

# Tests opt into dev bootstrap behavior explicitly when needed.
DEV_BOOTSTRAP_ENABLED = False

# Prevent WhiteNoise from rescanning the static file tree on every middleware
# instantiation. Each API test request triggers load_middleware, and without
# this flag WhiteNoise calls update_files_dictionary (~0.013s) every time.
WHITENOISE_AUTOREFRESH = False
