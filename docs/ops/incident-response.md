# Incident Response — Credential Compromise

Use this runbook when you suspect a secret has been exposed or is actively being abused.

---

## Immediate Actions (first 15 minutes)

### 1. Rotate the compromised secret first

Go directly to the relevant dashboard and invalidate the exposed credential before anything else. Do not wait to understand the full scope — revoke first, investigate after.

| Compromised secret | Immediate action |
|---|---|
| `DEPLOY_SSH_KEY` (old) | Remove the public key from `~/.ssh/authorized_keys` on the droplet |
| `INFISICAL_CLIENT_SECRET` | Revoke in Infisical → Access Control → Machine Identities → `glaze-eso` |
| `TAILSCALE_OAUTH_CLIENT_SECRET` | Revoke in Tailscale admin → Settings → OAuth Clients |
| `POSTGRES_PASSWORD` | `ALTER USER glaze WITH PASSWORD '<new>'` (see rotation runbook) |
| `SECRET_KEY` | Generate new key, update Infisical, restart pods (all sessions invalidated) |
| Any Cloudinary / Resend / Grafana / Modal key | Revoke in the provider dashboard |

### 2. Force an immediate ESO sync

ESO refreshes every hour by default. After updating the secret in Infisical, trigger an immediate sync:

```bash
KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl annotate externalsecret glaze-secrets \
  force-sync=$(date +%s) --overwrite
```

Verify the sync completed:
```bash
KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl get externalsecret glaze-secrets
# STATUS should return to "Valid / True" within ~30 seconds
```

### 3. Restart affected pods

After ESO syncs the new value:

```bash
KUBECONFIG=/etc/rancher/k3s/k3s.yaml kubectl rollout restart \
  deployment/glaze-web deployment/glaze-worker deployment/glaze-otelcol
```

For `POSTGRES_PASSWORD` also restart the backup cronjob's next run (it picks up the new secret on the next scheduled execution automatically).

---

## Secondary Actions (first hour)

### Audit access logs

- **Infisical audit log**: Project → Audit Logs — look for unexpected machine identity usage or secret reads
- **Grafana / OTel traces**: Check for anomalous API calls or error spikes around the suspected exposure window
- **k8s events**: `kubectl get events --sort-by='.lastTimestamp'`
- **GitHub Actions**: Check recent CD runs for unexpected secret access patterns

### Rotate adjacent secrets

If one secret was exposed, assume any secret stored in the same location may be at risk. Rotate the full inventory using [the rotation runbook](secret-rotation.md) if the exposure vector was broad (e.g., a `.env` file committed to git, a GitHub secret visible to a compromised runner).

### Check for data exfiltration indicators

- Unusual Cloudinary upload activity (Cloudinary Usage dashboard)
- Unexpected Postgres queries (check `pg_stat_activity` or OTel slow query logs)
- Unexpected outbound requests from pods (OTel traces + k8s network policy logs)

---

## After Containment

- Document: what was exposed, when, how it was discovered, and what was rotated
- File a GitHub issue or private note in the ops log with the timeline
- If user data may have been accessed, review applicable privacy obligations
- Update this runbook if the response revealed a gap in coverage
