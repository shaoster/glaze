"""Cloudflare R2 (S3-compatible) object storage helpers.

All configuration is read from the environment at call time (matching the
project convention for optional integrations — no settings.py entries):

- ``R2_ACCOUNT_ID``         Cloudflare account id (forms the S3 endpoint URL).
- ``R2_ACCESS_KEY_ID``      Scoped R2 API token key id.
- ``R2_SECRET_ACCESS_KEY``  Scoped R2 API token secret.
- ``R2_BUCKET_NAME``        Bucket that stores all PotterDoc assets.
- ``R2_PUBLIC_URL``         Public CDN base URL (custom domain) for the bucket,
                            e.g. ``https://media.potterdoc.com``.

When any of these are absent, ``is_r2_configured()`` returns False and upload
endpoints degrade gracefully (503), mirroring the previous behavior when the
upload backend was unconfigured.
"""

import os
from typing import Any

_REQUIRED_ENV_VARS = (
    "R2_ACCOUNT_ID",
    "R2_ACCESS_KEY_ID",
    "R2_SECRET_ACCESS_KEY",
    "R2_BUCKET_NAME",
    "R2_PUBLIC_URL",
)

# Default presigned-PUT expiry, in seconds.
PRESIGNED_PUT_EXPIRES_SECONDS = 600

# Maximum file size accepted by the presigned-POST endpoint (50 MiB).
# This is enforced server-side via R2's content-length-range condition so
# clients cannot bypass it by sending a malformed Content-Length header.
MAX_UPLOAD_BYTES = 50 * 1024 * 1024


def is_r2_configured() -> bool:
    """Return True when every R2 environment variable is set and non-blank."""
    return all(os.environ.get(var, "").strip() for var in _REQUIRED_ENV_VARS)


def get_bucket_name() -> str:
    return os.environ.get("R2_BUCKET_NAME", "").strip()


def get_public_base_url() -> str:
    """Return the public CDN base URL without a trailing slash."""
    return os.environ.get("R2_PUBLIC_URL", "").strip().rstrip("/")


def get_r2_client() -> Any:
    """Return a boto3 S3 client configured for the Cloudflare R2 endpoint.

    Path-style addressing is set explicitly so presigned PUT URLs take the form
    ``https://{account}.r2.cloudflarestorage.com/{bucket}/{key}`` rather than
    the virtual-hosted ``https://{bucket}.{account}.r2.cloudflarestorage.com/{key}``.
    This keeps the URLs under the single account host that the CSP allows.
    """
    import boto3  # noqa: PLC0415 — keep boto3 import out of the hot path
    from botocore.config import Config  # noqa: PLC0415

    account_id = os.environ.get("R2_ACCOUNT_ID", "").strip()
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ.get("R2_ACCESS_KEY_ID", "").strip(),
        aws_secret_access_key=os.environ.get("R2_SECRET_ACCESS_KEY", "").strip(),
        region_name="auto",
        config=Config(s3={"addressing_style": "path"}),
    )


def generate_presigned_put(
    key: str,
    content_type: str,
    expires: int = PRESIGNED_PUT_EXPIRES_SECONDS,
) -> str:
    """Return a presigned PUT URL for *key* with the ContentType pinned.

    The signature covers the Content-Type header, so a client cannot upload
    under a different content type than the one validated server-side.
    """
    client = get_r2_client()
    return client.generate_presigned_url(
        "put_object",
        Params={
            "Bucket": get_bucket_name(),
            "Key": key,
            "ContentType": content_type,
        },
        ExpiresIn=expires,
    )


def generate_presigned_post(
    key: str,
    content_type: str,
    *,
    max_bytes: int = MAX_UPLOAD_BYTES,
    expires: int = PRESIGNED_PUT_EXPIRES_SECONDS,
) -> dict:
    """Return a presigned POST payload for *key* with a server-enforced size cap.

    Returns a dict with ``url`` and ``fields`` suitable for a multipart POST.
    The ``content-length-range`` condition is embedded in the policy so R2
    rejects uploads larger than *max_bytes* without involving our server.
    """
    client = get_r2_client()
    return client.generate_presigned_post(
        Bucket=get_bucket_name(),
        Key=key,
        Fields={"Content-Type": content_type},
        Conditions=[
            {"Content-Type": content_type},
            ["content-length-range", 1, max_bytes],
        ],
        ExpiresIn=expires,
    )


def public_url_for_key(key: str) -> str:
    """Return the public CDN URL for an object key."""
    return f"{get_public_base_url()}/{key.lstrip('/')}"


def key_for_public_url(url: str) -> str | None:
    """Return the object key for a public CDN URL, or None for foreign URLs."""
    base = get_public_base_url()
    if not base or not url:
        return None
    prefix = f"{base}/"
    if not url.startswith(prefix):
        return None
    key = url[len(prefix) :].split("?")[0]
    return key or None


def object_exists(key: str) -> bool:
    """Return True when *key* exists in the bucket (HEAD request)."""
    from botocore.exceptions import ClientError  # noqa: PLC0415

    client = get_r2_client()
    try:
        client.head_object(Bucket=get_bucket_name(), Key=key)
    except ClientError as exc:
        if exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode") == 404:
            return False
        error_code = exc.response.get("Error", {}).get("Code", "")
        if error_code in ("404", "NoSuchKey", "NotFound"):
            return False
        raise
    return True


def delete_object(key: str) -> None:
    """Delete an object from the bucket (no-op if it does not exist)."""
    client = get_r2_client()
    client.delete_object(Bucket=get_bucket_name(), Key=key)


def get_object_bytes(key: str) -> bytes:
    """Download an object's full body from the bucket."""
    client = get_r2_client()
    response = client.get_object(Bucket=get_bucket_name(), Key=key)
    return response["Body"].read()


def upload_bytes(key: str, data: bytes, content_type: str) -> str:
    """Upload raw bytes to *key* and return its public URL."""
    client = get_r2_client()
    client.put_object(
        Bucket=get_bucket_name(),
        Key=key,
        Body=data,
        ContentType=content_type,
    )
    return public_url_for_key(key)


def upload_file(path: str, key: str, content_type: str) -> str:
    """Upload a local file to *key* and return its public URL."""
    client = get_r2_client()
    client.upload_file(
        str(path),
        get_bucket_name(),
        key,
        ExtraArgs={"ContentType": content_type},
    )
    return public_url_for_key(key)
