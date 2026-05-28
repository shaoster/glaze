# ruff: noqa: F401
from .auth import views as _impl
from .auth.views import (
    AuthUserSerializer,
    GoogleAuthSerializer,
    Image,
    InviteCode,
    Piece,
    PieceDetailSerializer,
    PieceState,
    UserPreferencesSerializer,
    UserProfile,
    _exchange_google_auth_code,
    _verify_google_id_token,
    bootstrap_dev_user,
    get_preferences_config,
    httpx,
    login,
    logout,
)


def _sync_impl() -> None:
    for name in [
        "AuthUserSerializer",
        "GoogleAuthSerializer",
        "Image",
        "InviteCode",
        "Piece",
        "PieceDetailSerializer",
        "PieceState",
        "UserPreferencesSerializer",
        "UserProfile",
        "bootstrap_dev_user",
        "get_preferences_config",
        "httpx",
        "login",
        "logout",
        "_exchange_google_auth_code",
        "_verify_google_id_token",
    ]:
        setattr(_impl, name, globals()[name])


def csrf(request):
    _sync_impl()
    return _impl.csrf(request)


def auth_logout(request):
    _sync_impl()
    return _impl.auth_logout(request)


def auth_me(request):
    _sync_impl()
    return _impl.auth_me(request)


def auth_preferences(request):
    _sync_impl()
    return _impl.auth_preferences(request)


def auth_google(request):
    _sync_impl()
    return _impl.auth_google(request)


def validate_invite(request):
    _sync_impl()
    return _impl.validate_invite(request)


def staff_invite_code(request):
    _sync_impl()
    return _impl.staff_invite_code(request)


def auth_export(request):
    _sync_impl()
    return _impl.auth_export(request)


def auth_delete_account(request):
    _sync_impl()
    return _impl.auth_delete_account(request)


def _copy_view_metadata(name: str) -> None:
    proxy = globals()[name]
    target = getattr(_impl, name)
    proxy.__dict__.update(target.__dict__)
    proxy.__doc__ = target.__doc__


for _name in [
    "csrf",
    "auth_logout",
    "auth_me",
    "auth_preferences",
    "auth_google",
    "validate_invite",
    "staff_invite_code",
    "auth_export",
    "auth_delete_account",
]:
    _copy_view_metadata(_name)
