"""Regression tests for host allowlisting in Django settings."""

from __future__ import annotations

import importlib
import sys

import pytest


def _reload_settings_module(name: str):
    sys.modules.pop(name, None)
    return importlib.import_module(name)


def test_backend_settings_includes_admin_ingress_host(monkeypatch):
    monkeypatch.setenv("ALLOWED_HOST", "potterdoc.com")
    monkeypatch.setenv("ADMIN_INGRESS_HOST", "admin.potterdoc.com")
    monkeypatch.delenv("ALLOWED_HOSTS", raising=False)

    settings = _reload_settings_module("backend.settings")

    assert "potterdoc.com" in settings.ALLOWED_HOSTS
    assert "www.potterdoc.com" in settings.ALLOWED_HOSTS
    assert "admin.potterdoc.com" in settings.ALLOWED_HOSTS
    assert "www.admin.potterdoc.com" not in settings.ALLOWED_HOSTS


@pytest.mark.parametrize(
    ("module_name", "env"),
    [
        (
            "backend.settings",
            {
                "PRODUCTION": "1",
                "SECRET_KEY": "test-secret",
                "DATABASE_URL": "sqlite:///db.sqlite3",
            },
        ),
        ("backend.test_settings", {}),
    ],
)
def test_backend_settings_share_parent_domain_cookies(
    monkeypatch, module_name, env
):
    monkeypatch.setenv("ALLOWED_HOST", "potterdoc.com")
    monkeypatch.setenv("ADMIN_INGRESS_HOST", "admin.potterdoc.com")
    monkeypatch.delenv("ALLOWED_HOSTS", raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)

    settings = _reload_settings_module(module_name)

    assert settings.SESSION_COOKIE_DOMAIN == ".potterdoc.com"
    assert settings.CSRF_COOKIE_DOMAIN == ".potterdoc.com"


def test_backend_test_settings_includes_admin_ingress_host(monkeypatch):
    monkeypatch.setenv("ALLOWED_HOST", "potterdoc.com")
    monkeypatch.setenv("ADMIN_INGRESS_HOST", "admin.potterdoc.com")
    monkeypatch.delenv("ALLOWED_HOSTS", raising=False)

    settings = _reload_settings_module("backend.test_settings")

    assert "potterdoc.com" in settings.ALLOWED_HOSTS
    assert "www.potterdoc.com" in settings.ALLOWED_HOSTS
    assert "admin.potterdoc.com" in settings.ALLOWED_HOSTS
    assert "www.admin.potterdoc.com" not in settings.ALLOWED_HOSTS
