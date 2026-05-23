"""Regression tests for admin subdomain access behavior."""

from __future__ import annotations

from pathlib import Path


def test_admin_ingress_routes_static_assets():
    repo_root = Path(__file__).resolve().parents[1]
    admin_ingress = (
        repo_root / "chart/glaze/templates/ingress-admin.yaml"
    ).read_text()
    admin_public_ingress = (
        repo_root / "chart/glaze/templates/ingress-admin-public.yaml"
    ).read_text()

    assert "path: /static/" in admin_ingress
    assert "path: /static/" in admin_public_ingress
