# ── Stage 1: builder ──────────────────────────────────────────────────────────
# Needs both Python and Node to generate TS types from the live OpenAPI schema
# and build the Vite frontend before collectstatic can run.
FROM python:3.14-slim AS builder

RUN apt-get update && apt-get install -y --no-install-recommends \
        curl ca-certificates && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y --no-install-recommends nodejs && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# 1. Start Django (using dev SQLite — schema endpoint needs no real data).
# 2. Generate TypeScript types from the OpenAPI schema.
# 3. Build the Vite frontend.
# 4. Run collectstatic so Django can serve admin/DRF assets via WhiteNoise.
RUN bash -c '\
    set -euo pipefail; \
    python manage.py runserver 8080 & \
    DJANGO_PID=$!; \
    echo "Waiting for Django on :8080..."; \
    for i in $(seq 1 30); do \
        curl -sf http://localhost:8080/api/schema/ > /dev/null 2>&1 && break; \
        sleep 1; \
    done; \
    cd web && npm ci && npm run generate-types && npm run build && cd ..; \
    kill "$DJANGO_PID"; \
    wait "$DJANGO_PID" 2>/dev/null || true; \
    python manage.py collectstatic --no-input \
'

# ── Stage 2: runtime ──────────────────────────────────────────────────────────
# Lean Python-only image — no Node, no source maps, no node_modules.
FROM python:3.14-slim AS runtime

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Python source
COPY --from=builder /app/backend ./backend
COPY --from=builder /app/api ./api
COPY --from=builder /app/manage.py .
COPY --from=builder /app/workflow.yml .
COPY --from=builder /app/workflow.schema.yml .

# Built frontend and collected static files
COPY --from=builder /app/web/dist ./web/dist
COPY --from=builder /app/staticfiles ./staticfiles

COPY docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]
