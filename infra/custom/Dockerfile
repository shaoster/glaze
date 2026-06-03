# Stage 1: Build the backend schema
FROM python:3.12-slim AS schema-builder
WORKDIR /app

# Install uv for high-speed package management
RUN python -m pip install --no-cache-dir uv

# Copy python dependencies
COPY pyproject.toml uv.lock ./

# Install python dependencies system-wide
RUN uv pip install --system --no-cache -r pyproject.toml

# Copy Django code needed for schema generation
COPY api/ ./api/
COPY backend/ ./backend/
COPY manage.py ./
COPY tutorials.yml ./
COPY user_preferences.yml ./
COPY workflow.yml ./
COPY storyboard.schema.yml ./
COPY music_catalog.yml ./
COPY music_catalog.schema.yml ./
COPY assets/showcase_music/ ./assets/showcase_music/

# Generate the OpenAPI schema.json
RUN python manage.py spectacular --file schema.json --format openapi-json

# Stage 2: Build the React frontend
FROM node:22-slim AS web-builder
WORKDIR /app/web

# Copy package dependency files
COPY web/package*.json ./
COPY web/pnpm-lock.yaml ./

# Install dependencies using npm
RUN npm ci

# Copy the generated schema.json from Stage 1
COPY --from=schema-builder /app/schema.json /app/schema.json

# Copy the rest of the web workspace files
COPY web/ ./

# Copy config YAMLs needed by the frontend from the root build context
COPY tutorials.yml /app/
COPY user_preferences.yml /app/
COPY workflow.yml /app/

# Generate TypeScript types from the local schema.json file
ENV GLAZE_SCHEMA_SOURCE=/app/schema.json
RUN npm run generate-types

# Build the frontend production distribution
RUN npx tsc -p tsconfig.app.json && npx vite build

# Stage 3: Create the Python/Django backend & final runner
FROM python:3.12-slim

# Install system utilities (curl for health check probes)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install uv for high-speed package management
RUN python -m pip install --no-cache-dir uv

# Copy python dependencies
COPY pyproject.toml uv.lock ./

# Install python dependencies system-wide
RUN uv pip install --system --no-cache -r pyproject.toml

# Copy built frontend assets from web-builder
COPY --from=web-builder /app/web/dist ./web/dist

# Copy the generated types (kept for file layout alignment)
COPY --from=web-builder /app/web/src/util/generated-types.ts ./web/src/util/generated-types.ts
COPY --from=web-builder /app/web/src/util/types.ts ./web/src/util/types.ts

# Copy the Django application source files
COPY api/ ./api/
COPY backend/ ./backend/
COPY fixtures/ ./fixtures/
COPY manage.py ./
COPY docker-entrypoint.sh ./
COPY tutorials.yml ./
COPY user_preferences.yml ./
COPY workflow.yml ./
COPY storyboard.schema.yml ./
COPY music_catalog.yml ./
COPY music_catalog.schema.yml ./
COPY assets/showcase_music/ ./assets/showcase_music/

# Make the entrypoint executable
RUN chmod +x docker-entrypoint.sh

# Run collectstatic at build time so the container doesn't block on startup
RUN SECRET_KEY=buildtime-placeholder python manage.py collectstatic --no-input

# Expose Gunicorn/Uvicorn port
EXPOSE 8000

ENTRYPOINT ["/bin/bash", "./docker-entrypoint.sh"]
