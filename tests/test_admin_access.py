"""Regression tests for admin subdomain access behavior."""

from __future__ import annotations

from pathlib import Path


def test_admin_ingress_routes_static_assets():
    repo_root = Path(__file__).resolve().parents[1]
    admin_ingress = (repo_root / "chart/glaze/templates/ingress-admin.yaml").read_text()
    admin_public_ingress = (
        repo_root / "chart/glaze/templates/ingress-admin-public.yaml"
    ).read_text()

    assert "path: /static/" in admin_ingress
    assert "path: /static/" in admin_public_ingress


def test_admin_ingress_is_tailnet_only():
    repo_root = Path(__file__).resolve().parents[1]
    admin_ingress = (repo_root / "chart/glaze/templates/ingress-admin.yaml").read_text()

    assert "default-{{ $fullName }}-security-headers@kubernetescrd" in admin_ingress
    assert (
        'traefik.ingress.kubernetes.io/router.entrypoints: "websecure-tailscale"'
        in admin_ingress
    )


def test_public_admin_ingress_remains_explicitly_public():
    repo_root = Path(__file__).resolve().parents[1]
    admin_public_ingress = (
        repo_root / "chart/glaze/templates/ingress-admin-public.yaml"
    ).read_text()

    assert (
        "default-{{ $fullName }}-security-headers@kubernetescrd" in admin_public_ingress
    )
    assert (
        "default-{{ $fullName }}-tailscale-only@kubernetescrd"
        not in admin_public_ingress
    )


def test_security_headers_allow_cloudinary_video_media():
    repo_root = Path(__file__).resolve().parents[1]
    security_headers = (
        repo_root / "chart/glaze/templates/middleware-security-headers.yaml"
    ).read_text()

    assert "media-src 'self' https://res.cloudinary.com;" in security_headers
