---
model: opus
created: 2026-05-18
modified: 2026-05-18
reviewed: 2026-05-18
name: review
description: |
  Frontier agent review skill: Performs a high-signal security and architecture
  review of current changes. Call this via /review to verify mandates.
allowed-tools: Bash, Read, Write, Edit, Grep, Glob
---

# Review Skill

Invoke this skill to perform a comprehensive review of the active worktree or a pending PR.

## Security Mandates (CRITICAL)

### 🚨 [SECURITY MANDATE] No Production Secrets in CI
**Verify that `ci.yml` and its dependencies NEVER have access to production secrets.**
- Check `.github/workflows/ci.yml` for `${{ secrets.* }}` usage.
- Ensure any secrets used in CI are either BuildBuddy keys (`BAZEL_REMOTE_API_KEY`) or public configuration variables.
- **Loudly flag any attempt to inject production passwords, database strings, or live API keys into the CI environment.**
- Production secrets MUST be restricted to the `cd.yml` workflow.

## Architectural Integrity

### 1. Environment Configuration
- **Consolidation**: Use unified variable names (e.g., `GOOGLE_OAUTH_CLIENT_ID`) for both backend and frontend.
- **Build-time vs Runtime**: Confirm that frontend variables are baked in during CI image build, while backend variables are read from the host `.env` at runtime.
- **Defaults**: Ensure `settings.py` provides sensible defaults for optional features when environment variables are absent.

### 2. Docker Compose Parity
- Verify that `docker-compose.yml` uses `env_file: .env` to maintain parity with the production host.
- Check that entrypoint overrides are correctly applied for non-default services (workers, init jobs).

## Review Checklist

1. **Grep CI for Secrets**: `grep "\${{ secrets." .github/workflows/ci.yml`
2. **Verify .env generation**: Ensure smoke tests generate `.env` from templates rather than hand-exporting.
3. **Check Frontend Injection**: Verify Vite `define` config is used for public IDs instead of `VITE_` prefixes.
