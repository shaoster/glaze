import logging

from django.conf import settings
from django.core import signing
from django.core.mail import send_mail

logger = logging.getLogger(__name__)

_INVITE_SALT = "invite"
_INVITE_MAX_AGE = 7 * 24 * 3600  # 7 days


def make_invite_token(email: str) -> str:
    return signing.dumps({"email": email, "kind": "invite"}, salt=_INVITE_SALT)


def verify_invite_token(token: str) -> str:
    """Return the email encoded in *token*, or raise signing.BadSignature / signing.SignatureExpired."""
    data = signing.loads(token, salt=_INVITE_SALT, max_age=_INVITE_MAX_AGE)
    return data["email"]


def send_invitation_email(email: str, token: str) -> None:
    base_url = getattr(settings, "INVITE_LINK_BASE_URL", "").rstrip("/")
    invite_url = f"{base_url}/invite?token={token}"
    send_mail(
        subject="You're invited to PotterDoc",
        message=(
            f"You've been invited to PotterDoc!\n\n"
            f"Click the link below to accept your invitation and sign in:\n\n"
            f"{invite_url}\n\n"
            f"This link expires in 7 days."
        ),
        from_email=settings.DEFAULT_FROM_EMAIL,
        recipient_list=[email],
    )
    logger.info("Invitation email sent to %s — invite URL: %s", email, invite_url)
