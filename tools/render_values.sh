#!/usr/bin/env bash
# Renders the Helm values override file from environment variables.
# Prints to stdout; caller redirects to a file.
#
# Required env: IMAGE_TAG, INFISICAL_PROJECT_SLUG, ALLOWED_HOST, APP_ORIGIN,
#   GOOGLE_OAUTH_CLIENT_ID, CLOUDINARY_CLOUD_NAME, CLOUDINARY_UPLOAD_FOLDER,
#   CLOUDINARY_UPLOAD_PRESET, CLOUDINARY_PUBLIC_UPLOAD_FOLDER
# Optional env: CLOUDINARY_VIDEO_UPLOAD_PRESET, CLOUDINARY_VIDEO_UPLOAD_FOLDER
set -euo pipefail

: "${IMAGE_TAG:?IMAGE_TAG must be set}"
: "${INFISICAL_PROJECT_SLUG:?INFISICAL_PROJECT_SLUG must be set}"
: "${ALLOWED_HOST:?ALLOWED_HOST must be set}"
: "${APP_ORIGIN:?APP_ORIGIN must be set}"
: "${GOOGLE_OAUTH_CLIENT_ID:?GOOGLE_OAUTH_CLIENT_ID must be set}"
: "${CLOUDINARY_CLOUD_NAME:?CLOUDINARY_CLOUD_NAME must be set}"
: "${CLOUDINARY_UPLOAD_FOLDER:?CLOUDINARY_UPLOAD_FOLDER must be set}"
: "${CLOUDINARY_UPLOAD_PRESET:?CLOUDINARY_UPLOAD_PRESET must be set}"
: "${CLOUDINARY_PUBLIC_UPLOAD_FOLDER:?CLOUDINARY_PUBLIC_UPLOAD_FOLDER must be set}"

cat << EOF
image:
  tag: "${IMAGE_TAG}"
infisical:
  projectSlug: "${INFISICAL_PROJECT_SLUG}"
appConfig:
  allowedHost: "${ALLOWED_HOST}"
  appOrigin: "${APP_ORIGIN}"
  googleOauthClientId: "${GOOGLE_OAUTH_CLIENT_ID}"
  cloudinaryCloudName: "${CLOUDINARY_CLOUD_NAME}"
  cloudinaryUploadFolder: "${CLOUDINARY_UPLOAD_FOLDER}"
  cloudinaryUploadPreset: "${CLOUDINARY_UPLOAD_PRESET}"
  cloudinaryPublicUploadFolder: "${CLOUDINARY_PUBLIC_UPLOAD_FOLDER}"
$([ -n "${CLOUDINARY_VIDEO_UPLOAD_PRESET:-}" ] && echo "  cloudinaryVideoUploadPreset: \"${CLOUDINARY_VIDEO_UPLOAD_PRESET}\"")
$([ -n "${CLOUDINARY_VIDEO_UPLOAD_FOLDER:-}" ] && echo "  cloudinaryVideoUploadFolder: \"${CLOUDINARY_VIDEO_UPLOAD_FOLDER}\"")
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
EOF
