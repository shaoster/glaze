---
model: opus
created: 2026-05-28
modified: 2026-05-28
reviewed: 2026-05-28
name: report-bug
description: |
  Interactively gather evidence, reproduce a bug locally, and file a GitHub issue
  with validated reproduction steps. Use when a developer has observed unexpected
  behavior and wants to turn it into an actionable issue. Produces a GitHub issue
  with confirmed local repro — no code fixes, no commits.
allowed-tools: Bash, Read, WebFetch
---

# Report Bug

**Mode: evidence gathering and issue authoring. This session produces a GitHub
issue with validated local reproduction steps. No fixes, no code changes, no
commits.**

The boundary of `/report` is a filed issue whose reproduction steps have been
executed and confirmed in the local environment. `/fix` takes it from there.

## Flow

### 1. Orient

Ask the user **one** question before loading any context:

> What did you observe, and where — backend API, frontend UI, state machine,
> admin, or somewhere else?

Use the answer to select 1–2 resources:

| Touches | Read |
|---|---|
| Workflow state machine, globals DSL, `workflow.yml` | `.agents/skills/glaze-workflow/SKILL.md` |
| Backend models, API, serializers, admin | `.agents/skills/glaze-backend/SKILL.md` |
| Frontend components, UI, type pipeline | `.agents/skills/glaze-frontend/SKILL.md` |
| Django/DRF conventions | `.agents/skills/django-api/SKILL.md` |
| Testing infrastructure | `.agents/skills/dev-testing/SKILL.md` |

Also always read `.agents/skills/github-pr/SKILL.md` for issue-writing conventions.

### 2. Gather evidence

Ask focused follow-up questions — at most **three rounds** — to establish:

- **Symptom** — exactly what was observed (error message, wrong value, UI state)
- **Expected** — what should have happened instead
- **Context** — user, object state, browser/environment, recent changes
- **Frequency** — always, intermittent, or under specific conditions

Do not ask all questions at once. Prioritize whichever gap most limits your
ability to reproduce. If the user provides logs, stack traces, or screenshots,
extract the key signal before asking follow-ups.

### 3. Prepare the worktree and start the local server

Repro always runs in the worktree for this branch, with its own database so
bootstrap seeding is predictable.

**3a. Verify `.env.local`**

Read `.env.local` in the worktree and confirm:
- `DATABASE_URL` is set and points to a SQLite file inside the worktree (e.g.
  `sqlite:////absolute/path/to/worktree/db.sqlite3`). If it is absent, empty,
  or points to the main checkout, the worktree will share state with main and
  bootstrap seeding may be suppressed by existing data.
- No variable is set to an empty string — omit it entirely or comment it out.
  Empty values cause Django startup errors (e.g. `invalid literal for int()`).

If `.env.local` is absent in the worktree, copy it from the main checkout and
edit `DATABASE_URL` to point into the worktree:

```bash
cp /home/phil/code/glaze/.env.local .env.local
# then edit DATABASE_URL= to point to a fresh db inside the worktree
```

**3b. Run migrations** (creates the fresh database):

```bash
.manage.venv/bin/python manage.py migrate
```

**3c. Start the server**

`cd` into the worktree, source `env.sh` (which sets `GLAZE_ROOT` to the worktree),
then start the servers in the background and poll for the port file:

```bash
cd /path/to/worktree
source env.sh
gz_start &
for i in $(seq 1 20); do
  port=$(cat .dev-pids/backend.port 2>/dev/null)
  [ -n "$port" ] && echo "Backend on port $port" && break
  sleep 3
done
```

**Critical:** `env.sh` must be sourced from inside the worktree directory.
Sourcing it from the main checkout sets `GLAZE_ROOT` to the main checkout,
causing `gz_start` to write pid/port files there instead of the worktree.

Confirm the server is up:

```bash
BASE=http://localhost:$(cat .dev-pids/backend.port)
curl -s "${BASE}/api/auth/me/" | python3 -m json.tool   # confirm mockIdpUrl is present
```

**3d. Authenticate via the dev login flow**

Sign in using the mock-IdP dev login. The canonical two-step curl flow,
the relative-`redirect_uri` requirement, and the auto-seeded sample pieces
are documented once in
[`dev-environment` → Authenticating Against the Local Dev Server](../dev-environment/SKILL.md#authenticating-against-the-local-dev-server-dev-login).
Follow that flow; first login seeds ~75 pieces for the chosen `login_hint`,
which is usually enough data to reproduce list/pagination bugs without a prod restore.

**Repro-specific shell-escaping tip:** the POST body contains `&`, which some
shells and tool proxies interpret as an operator. If inline `--data` misbehaves,
write the body to a file and use `--data-binary @file`:

```bash
printf 'redirect_uri=/api/auth/mock-idp/complete/&state=repro&login_hint=dev@localhost' \
  > /tmp/idp-post.txt
# ...then --data-binary @/tmp/idp-post.txt in the authorize POST.
```

For multi-user repros, repeat the flow with a second cookie jar and a different
`login_hint`. The guard is the same as documented in the skill: the mock IdP
exists only when `DEV_BOOTSTRAP_ENABLED=True` (default in dev), and is absent
from production (403/404 there).

### 4. Investigate locally

Before drafting the issue, **attempt to reproduce the bug yourself** using the
dev environment. This is the core obligation of `/report`.

Load `.agents/skills/dev-environment/SKILL.md` and `.agents/skills/dev-testing/SKILL.md`
if you need to set up or run commands.

Investigation steps — work through these in order, stopping when you reproduce:

1. **Read relevant code** — find the code path the symptom implicates. Check
   models, views, serializers, or components as appropriate.

2. **Run existing tests** for the affected area to see if any already catch this:
   ```bash
   # Example — adjust target to the affected layer
   rtk bazel test //api:api_test --test_output=short 2>&1 | tail -40
   rtk bazel test //web:web_test --test_output=short 2>&1 | tail -40
   ```

3. **Reproduce interactively** — use the dev server, Django shell, or a quick
   scratch script to trigger the observed behavior:
   ```bash
   # Django shell example
   rtk bazel run //api:manage -- shell -c "..."
   ```

4. **Confirm the repro** — the reproduction is valid when you can trigger the
   symptom on demand. Record the exact commands or UI steps.

If you cannot reproduce after a genuine attempt, work through §4a–4d before
giving up. Do not file an issue with unverified steps.

### 4a. Cluster-configuration triage (production-reported bugs)

If the symptom involves **remote/network errors that look like infrastructure**
— one-word bodies (`Forbidden`, `Not Found`, `Bad Gateway`), missing CORS
headers, TLS errors, unexpected redirects — these are almost never reproducible
in dev. They point to cluster ingress, cert, or proxy configuration. Do not
spend time trying to reproduce them locally.

Instead, load `.agents/skills/k8s/SKILL.md` and scan server-side logs:

```bash
# Recent backend pod logs — look for 4xx/5xx patterns, auth errors, panics
ssh $PROD_HOST "export KUBECONFIG=/etc/rancher/k3s/k3s.yaml && \
  kubectl logs -l app=glaze-backend --tail=200 --since=1h"

# Recent events — probe failures, OOMKills, crashloops
ssh $PROD_HOST "export KUBECONFIG=/etc/rancher/k3s/k3s.yaml && \
  kubectl get events --sort-by=.lastTimestamp | tail -40"
```

If the logs point to a clear misconfiguration (missing secret, wrong ingress
rule, probe failure), document it in the issue as a cluster-config bug and skip
further local reproduction attempts.

### 4b. Grafana traces (production-reported bugs, logs inconclusive)

If k8s logs are clean but the bug is still not understood, the distributed
traces in Grafana Cloud often reveal the exact request path, latency spike, or
downstream failure.

Prompt the user to add the Grafana MCP server if not already present:

> To examine production traces I need the Grafana MCP server. Add it with:
>
> **Claude Code:** `claude mcp add grafana --transport http https://mcp.grafana.com/mcp`
> **Codex:** `codex mcp add grafana -- npx -y @grafana/mcp-server`
> **Gemini CLI:** see https://grafana.com/docs/grafana/latest/developer-resources/mcp/clients/gemini-cli/
>
> Then restart the agent session so it can use the new server.

Once available, use the Grafana MCP tools to:
- Search traces for the affected endpoint around the time the bug was reported
- Look for high-latency spans, error spans, or unexpected downstream calls
- Check whether errors originated in the backend, a sidecar, or an external
  dependency (Cloudinary, Google OAuth)

Document the trace ID and relevant spans in the issue.

### 4c. Production-only code path scan

Before completely giving up on local repro, grep the codebase for behavior
that is explicitly conditioned on production mode:

```bash
grep -rn "IS_PRODUCTION\|not DEBUG\|PRODUCTION" api/ backend/ --include="*.py" | \
  grep -v "test_\|\.pyc" | grep -v "^Binary"
```

Common production-only divergences to flag in the issue:
- `IS_PRODUCTION` gates (security headers, HTTPS redirects, cookie flags)
- `SESSION_COOKIE_SECURE = True` / `CSRF_COOKIE_SECURE = True` — can cause
  auth to silently fail if the request arrives over HTTP or a misconfigured proxy
- `SECURE_SSL_REDIRECT = True` — redirects HTTP → HTTPS before Django sees the
  request; hard to observe in dev
- `ALLOWED_HOSTS` — in prod this is a real domain; mismatches 400 with no body
- `EMAIL_BACKEND` — console in dev, real SMTP in prod; silent send failures
- `ADMIN_INGRESS_HOST` — controls whether the admin URL appears in `auth/me/`
- Third-party credentials absent in dev (Cloudinary, Google OAuth) — endpoints
  return 503 in dev but are expected to work in prod

If any of these match the symptom, note them explicitly in the issue under a
**Production-only divergence** heading so `/fix` knows the test environment
cannot validate the fix directly.

### 5. Identify the fault location

Once reproduced, read the implicated code and determine:

- Which function, component, or model is the proximate cause
- Whether the fault is a missing guard, wrong condition, data assumption, or
  race condition
- Which layer owns the fix (backend, frontend, or both)

Do **not** fix anything yet — that is `/fix`'s job. Just locate the fault
precisely enough to write actionable acceptance criteria.

### 6. Draft the issue

```markdown
## Observed Behavior
<exact symptom — copy error messages or wrong values verbatim>

## Expected Behavior
<what should happen instead>

## Reproduction Steps
<!-- These steps were validated locally by the reporting agent -->
1. <exact step>
2. <exact step>
3. ...

**Result:** <what you see>
**Expected:** <what you should see>

## Environment
- Branch: `<branch>`
- Relevant object state: <any preconditions>

## Root Cause (preliminary)
<file:line or component — the proximate fault location identified during
investigation. Mark uncertain with "suspected".>

## Acceptance Criteria
- [ ] <the symptom no longer occurs under the reproduction steps>
- [ ] <regression test covers this path>
- [ ] <any related edge cases>

## Out of Scope
<explicit exclusions if useful>
```

Title format: `fix: <concise description of what is broken>` (under 70 chars).

### 7. Discuss & refine

After presenting the draft, ask:
> Does this capture the bug accurately? Anything to adjust before I file it?

Enter a conversational phase. Refine without re-drafting the entire body until
the user approves.

### 8. Confirm and file

Show the final title and body, then file:

```bash
cat > /tmp/issue-body.md << 'EOF'
<body>
EOF

gh issue create \
  --title "<title>" \
  --body-file /tmp/issue-body.md \
  --label bug
```

Report the created issue URL. Suggest `/fix #<N>` as the natural next step.
