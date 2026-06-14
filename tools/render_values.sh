#!/usr/bin/env bash
# Renders the Helm values override file from environment variables.
# Prints to stdout; caller redirects to a file.
#
# Required env: IMAGE_TAG, INFISICAL_PROJECT_SLUG, ALLOWED_HOST, APP_ORIGIN,
#   GOOGLE_OAUTH_CLIENT_ID, R2_ACCOUNT_ID, R2_BUCKET_NAME, R2_PUBLIC_URL
set -euo pipefail

: "${IMAGE_TAG:?IMAGE_TAG must be set}"
: "${INFISICAL_PROJECT_SLUG:?INFISICAL_PROJECT_SLUG must be set}"
: "${ALLOWED_HOST:?ALLOWED_HOST must be set}"
: "${APP_ORIGIN:?APP_ORIGIN must be set}"
: "${GOOGLE_OAUTH_CLIENT_ID:?GOOGLE_OAUTH_CLIENT_ID must be set}"
: "${R2_ACCOUNT_ID:?R2_ACCOUNT_ID must be set}"
: "${R2_BUCKET_NAME:?R2_BUCKET_NAME must be set}"
: "${R2_PUBLIC_URL:?R2_PUBLIC_URL must be set}"

cat << EOF
image:
  tag: "${IMAGE_TAG}"
infisical:
  projectSlug: "${INFISICAL_PROJECT_SLUG}"
appConfig:
  allowedHost: "${ALLOWED_HOST}"
  appOrigin: "${APP_ORIGIN}"
  googleOauthClientId: "${GOOGLE_OAUTH_CLIENT_ID}"
  r2AccountId: "${R2_ACCOUNT_ID}"
  r2BucketName: "${R2_BUCKET_NAME}"
  r2PublicUrl: "${R2_PUBLIC_URL}"
ingress:
  hosts:
    - host: "${ALLOWED_HOST}"
      paths:
        - path: /
          pathType: ImplementationSpecific
  tls:
    - secretName: glaze-tls
      hosts:
        - "${ALLOWED_HOST}"
mcp:
  enabled: true
  host: "mcp.potterdoc.com"
  apiUrl: "${APP_ORIGIN}"
  image:
    repository: "ghcr.io/shaoster/glaze-mcp"
    tag: "${IMAGE_TAG}"
EOF
