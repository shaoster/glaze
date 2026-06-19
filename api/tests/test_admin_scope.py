from urllib.parse import parse_qs, urlparse

import pytest
from django.contrib.auth.models import User
from django.test import Client

from api.models import Image


@pytest.mark.django_db
class TestAuthAdminLogin:
    def test_admin_login_does_not_500_without_site_record(self):
        """Regression for #973: admin login must not 500 when no Site DB record exists.

        django.contrib.sites was in INSTALLED_APPS but unused; its domain-based
        Site lookup in LoginView.get_context_data raised Site.DoesNotExist → 500.
        Fix: remove django.contrib.sites from INSTALLED_APPS so get_current_site
        falls back to RequestSite (no DB lookup).
        """
        browser = Client()
        response = browser.get("/admin/login/")
        assert response.status_code != 500, (
            "admin login returned 500 — Site.DoesNotExist from django.contrib.sites"
        )

    def test_admin_login_redirects_to_apex_bootstrap(self, settings):
        settings.ADMIN_INGRESS_HOST = "admin.potterdoc.com"
        settings.ALLOWED_HOSTS = [
            "localhost",
            "127.0.0.1",
            "potterdoc.com",
            "admin.potterdoc.com",
        ]

        browser = Client()

        response = browser.get(
            "/admin/login/?next=/admin/",
            HTTP_HOST="admin.potterdoc.com",
            secure=True,
        )

        assert response.status_code == 302
        target = urlparse(response["Location"])
        assert target.scheme == "https"
        assert target.netloc == "potterdoc.com"
        assert parse_qs(target.query)["next"] == ["https://admin.potterdoc.com/admin/"]
