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


def test_security_headers_allow_r2_image_and_video_media():
    repo_root = Path(__file__).resolve().parents[1]
    security_headers = (
        repo_root / "chart/glaze/templates/middleware-security-headers.yaml"
    ).read_text()

    # Images and videos are served from the R2 public CDN domain; legacy
    # res.cloudinary.com stays allowed only until the stored-URL migration
    # (migrate_assets_to_r2) completes in prod.
    assert (
        "img-src 'self' data: blob: {{ .Values.appConfig.r2PublicUrl }}"
        " https://res.cloudinary.com;" in security_headers
    )
    assert (
        "media-src 'self' {{ .Values.appConfig.r2PublicUrl }}"
        " https://res.cloudinary.com;" in security_headers
    )
    # Presigned POST uploads go to R2 storage; crop tool fetches images from CDN.
    assert (
        "connect-src 'self'"
        " https://{{ .Values.appConfig.r2AccountId }}.r2.cloudflarestorage.com"
        " {{ .Values.appConfig.r2PublicUrl }};"
        in security_headers
    )
