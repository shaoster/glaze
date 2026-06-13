"""DRF authentication class for long-lived agent API tokens.

Tokens are prefixed with ``pdagent_`` and stored as SHA-256 hashes in the
database.  When this class authenticates a request it forces ``is_staff`` and
``is_superuser`` to ``False`` on the returned user object so that even staff
accounts cannot exercise admin privileges via an agent token.
"""

from __future__ import annotations

import hashlib

from django.utils import timezone
from rest_framework.authentication import BaseAuthentication
from rest_framework.exceptions import AuthenticationFailed

from api.models import AgentToken

_PREFIX = "Bearer pdagent_"
_LAST_USED_DEBOUNCE_SECONDS = 60


class AgentTokenAuthentication(BaseAuthentication):
    def authenticate(self, request):
        header: str = request.META.get("HTTP_AUTHORIZATION", "")
        if not header.startswith(_PREFIX):
            return None

        raw_token = header[len("Bearer ") :]
        token_hash = hashlib.sha256(raw_token.encode()).hexdigest()

        try:
            agent_token = AgentToken.objects.select_related("user").get(
                token_hash=token_hash, user__is_active=True
            )
        except AgentToken.DoesNotExist:
            raise AuthenticationFailed("Invalid agent token.")

        now = timezone.now()
        if (
            agent_token.last_used_at is None
            or (now - agent_token.last_used_at).total_seconds()
            > _LAST_USED_DEBOUNCE_SECONDS
        ):
            AgentToken.objects.filter(pk=agent_token.pk).update(last_used_at=now)

        user = agent_token.user
        user.is_staff = False
        user.is_superuser = False
        return (user, agent_token)

    def authenticate_header(self, request):
        return 'Bearer realm="pdagent"'
