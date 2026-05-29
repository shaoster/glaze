"""Minimal mock OAuth2/OIDC identity provider for local development and agent repro.

Only active when DEV_BOOTSTRAP_ENABLED is True (DEBUG mode, never in production).
Provides a no-credential login path: browser users see an Accept button; agents
POST directly to the authorize endpoint and follow the two-step redirect chain.

Flow:
  GET  /api/auth/mock-idp/authorize/  →  HTML accept page
  POST /api/auth/mock-idp/authorize/  →  302 → /api/auth/mock-idp/complete/?code=<signed>
  GET  /api/auth/mock-idp/complete/   →  creates Django session → 302 → /

Agent headless two-step curl flow (single -L is unreliable — see the
dev-environment skill for the canonical version). redirect_uri must be the
RELATIVE path /api/auth/mock-idp/complete/ — an absolute http://… URL is
rejected with 400. The returned Location is also relative, so prefix BASE on
the complete/ GET:
  BASE=http://localhost:$(cat .dev-pids/backend.port)
  LOCATION=$(curl -s -c cookies.txt -b cookies.txt -D - -X POST \\
    --data "redirect_uri=/api/auth/mock-idp/complete/&state=x" \\
    "${BASE}/api/auth/mock-idp/authorize/" \\
    | grep -i "^location:" | sed 's/[Ll]ocation: //' | tr -d '\\r\\n')
  curl -s -c cookies.txt -b cookies.txt "${BASE}${LOCATION}" -o /dev/null
  # Session cookie is now in cookies.txt
"""

import hashlib

from django.conf import settings
from django.contrib.auth import get_user_model, login
from django.core import signing
from django.http import HttpRequest, HttpResponse, HttpResponseRedirect
from django.utils.html import escape
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from ..dev.bootstrap import seed_dev_pieces
from ..models import UserProfile

_SIGNING_SALT = "glaze-mock-idp"
_CODE_MAX_AGE = 300  # seconds


def _mock_subject(email: str) -> str:
    return hashlib.sha256(f"mock-idp:{email}".encode()).hexdigest()


def _find_or_create_user(email: str):
    User = get_user_model()
    subject = _mock_subject(email)
    profile = (
        UserProfile.objects.filter(openid_subject=subject).select_related("user").first()
    )
    if profile:
        return profile.user
    # Always create mock-IdP users as superusers — this is a dev-only tool and
    # agents need staff access to reproduce bugs that touch admin or elevated paths.
    # Also seed sample pieces immediately so the account is usable without any
    # additional setup; bypass bootstrap_dev_user's "skip if other superuser exists"
    # check since that guard is for the Google OAuth first-login flow, not here.
    user = User.objects.create_superuser(username=subject, email=email, password=None)
    UserProfile.objects.create(user=user, openid_subject=subject)
    seed_dev_pieces(user)
    return user


def _guard(request: HttpRequest) -> HttpResponse | None:
    if not getattr(settings, "DEV_BOOTSTRAP_ENABLED", False):
        return HttpResponse("Mock IdP is not available on this server.", status=403)
    return None


@csrf_exempt
@require_http_methods(["GET", "POST"])
def mock_idp_authorize(request: HttpRequest) -> HttpResponse:
    """Accept page (GET) and code-issuing endpoint (POST) for the mock IdP."""
    if (err := _guard(request)) is not None:
        return err

    redirect_uri = request.GET.get("redirect_uri") or request.POST.get("redirect_uri", "")
    state = request.GET.get("state") or request.POST.get("state", "")
    # Optional: agents can pass login_hint=email to select a specific user.
    login_hint = (
        request.GET.get("login_hint")
        or request.POST.get("login_hint")
        or "dev@localhost"
    )

    if request.method == "GET":
        safe_email = escape(login_hint)
        safe_redirect = escape(redirect_uri)
        safe_state = escape(state)
        return HttpResponse(
            f"""<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>PotterDoc Dev Sign-In</title>
<style>
  body {{ font-family: system-ui, sans-serif; display: grid; place-items: center;
         min-height: 100dvh; margin: 0; background: #121212; color: #fff; }}
  .card {{ background: #1e1e1e; border-radius: 12px; padding: 2rem; width: 100%;
           max-width: 360px; box-sizing: border-box; }}
  h1 {{ margin: 0 0 .5rem; font-size: 1.4rem; }}
  p {{ margin: 0 0 1.5rem; color: #aaa; font-size: .9rem; }}
  button {{ width: 100%; padding: .75rem; border: none; border-radius: 8px;
            background: #1976d2; color: #fff; font-size: 1rem; cursor: pointer; }}
  button:hover {{ background: #1565c0; }}
</style>
</head>
<body>
<div class="card">
  <h1>PotterDoc Dev Sign-In</h1>
  <p>Signing in as <strong>{safe_email}</strong></p>
  <form method="post">
    <input type="hidden" name="redirect_uri" value="{safe_redirect}">
    <input type="hidden" name="state" value="{safe_state}">
    <input type="hidden" name="login_hint" value="{safe_email}">
    <button type="submit">Accept</button>
  </form>
</div>
</body>
</html>""",
            content_type="text/html",
        )

    # POST: validate redirect_uri then issue a signed code and redirect.
    # Restricting to the complete/ path prevents open-redirect if this endpoint
    # is ever reachable with DEV_BOOTSTRAP_ENABLED accidentally set in staging.
    if not redirect_uri.startswith("/api/auth/mock-idp/complete/"):
        return HttpResponse("Invalid redirect_uri.", status=400)
    code = signing.dumps(
        {"email": login_hint, "state": state},
        salt=_SIGNING_SALT,
    )
    separator = "&" if "?" in redirect_uri else "?"
    location = f"{redirect_uri}{separator}code={code}&state={escape(state)}"
    return HttpResponseRedirect(location)


@require_http_methods(["GET"])
def mock_idp_complete(request: HttpRequest) -> HttpResponse:
    """Validate the mock IdP code, create a Django session, redirect to /."""
    if (err := _guard(request)) is not None:
        return err

    raw_code = request.GET.get("code", "")
    try:
        payload = signing.loads(raw_code, salt=_SIGNING_SALT, max_age=_CODE_MAX_AGE)
    except signing.BadSignature:
        return HttpResponse("Invalid or expired dev login code.", status=400)

    email = payload.get("email", "dev@localhost")
    user = _find_or_create_user(email)
    login(request, user)
    return HttpResponseRedirect("/")
