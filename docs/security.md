# PotterDoc Security Posture

This document describes the security architecture, threat model, and deliberate design decisions for potterdoc.com.

---

## Identity and Authentication

PotterDoc uses **Google OAuth 2.0** as the sole authentication mechanism. No passwords are stored.

On first sign-in, the backend receives a Google ID token and extracts the OpenID Connect `sub` claim — a stable, Google-assigned subject identifier. This value is **immediately hashed with SHA-256** before any storage or use:

```
hashed_sub = sha256(google_sub)
```

The raw `sub` is never written to disk. Django's `username` field and `UserProfile.openid_subject` both store only `hashed_sub`. This means:

- The database contains **no PII** that could be linked back to a Google account without already knowing the `sub` value.
- Email addresses, names, and profile photos from Google are **not requested and not stored**.
- A database dump is not sufficient to enumerate or identify users — an attacker also needs the original Google `sub` values.

Access is gated by invite code. New users cannot register without a valid, unused invite.

Crucially, account-existence is never disclosed before the identity-provider challenge is passed. The "already registered → log in" versus "new account → invite required" branch is reached only **after** the Google authorization code is exchanged and the ID token is cryptographically verified. A caller therefore cannot probe whether a given email or OpenID is registered without already controlling that Google account, so the login endpoint cannot be used as a correlation oracle by an attacker who lacks database access.

---

## Invite Codes and Email Invites

Invites are single-use UUID codes (`InviteCode`) with **no email field**. Admins can hand them out two ways: as a link/QR (the staff invite page) or by emailing a recipient directly. The email flow is built to leak no email↔account linkage into the database:

- **The recipient address is never persisted.** It is used only to hand the message to the SMTP relay, then discarded — not stored on the code, on the user (accounts are created with `email=""`), in application logs, or as a telemetry attribute.
- **Codes are pre-generated in batches.** Because a batch is written in one transaction, a code's `created_at` is uniform across the batch and decoupled from any individual send, defeating creation-time correlation against an external send-time oracle.
- **Sending only flips a `sent` boolean.** This prevents re-emailing a code. The send-time write leaves a row-version (`xmin`/`ctid`) signal, but only on *unredeemed* codes — which have no associated account yet.
- **Redemption deletes the code row.** No `used_at`/`used_by` is retained, so once an account exists there is no surviving code↔account tuple in the live database. Single-use is preserved by a `SELECT ... FOR UPDATE` row lock during redemption.
- **The send endpoint is staff-only and rate-limited** (`IsAdminUser` + a per-admin scoped throttle) and returns `204` regardless of address validity, so it cannot be used to enumerate accounts.

### Residual correlation vectors (accepted)

These live outside the running database and are accepted under the threat model of *an attacker with logical database access*:

- **SMTP provider logs.** The email relay (Resend) retains delivery logs containing recipient addresses paired with the invite link (and thus the code). This is the primary out-of-database email↔code record.
- **Unencrypted backups.** A deleted code can persist in the unencrypted `pg_dump` backups (see Backups) until they roll over, recoverable only with backup-file access — a stronger capability than logical DB access.
- **Invite-redemption probe.** There is deliberately **no read-only "validate code" endpoint** — a free validity check would be a polling oracle: anyone holding a code (e.g. from the Resend logs above) could poll it and watch the `valid → invalid` transition to learn when the recipient registered. Codes are checked **only at redemption**, which is authenticated (Google sign-in) and destructive (the row is deleted). The residual is therefore a single, destructive, authenticated probe: an attacker who attempts to redeem a code learns only whether it was already used — and if it was not, they consume it (a noisy, detectable DoS on that one invite that creates an account under *their own* Google identity, revealing nothing about the intended recipient). This is far weaker than a polling oracle: no continuous timing signal, no membership confirmation without destroying the invite.

---

## Data Classification

| Category | What we store | Notes |
|---|---|---|
| User identity | SHA-256 hash of Google `sub` | Not reversible without the original `sub` |
| Invite codes | UUID, timestamps, `sent` boolean | No email or redeemer recorded; deleted on redemption |
| User content | Pottery piece records, workflow states, images | Owned by the authenticated user; isolated by FK |
| Public library | Shared pieces with `user=NULL` | Admin-managed only; not user-writable |
| Credentials | Django `SECRET_KEY`, `POSTGRES_PASSWORD`, R2 access keys, email relay key, Dropbox tokens | Source of truth: Infisical Cloud; synced into k8s Secrets via External Secrets Operator |
| Backups | Plain pg_dump output | See Backup section |

No Social Security numbers, payment card numbers, physical addresses, or government IDs are collected or processed.

---

## Transport Security

- All external traffic is served over HTTPS. TLS certificates are issued by **Let's Encrypt** via cert-manager on the k3s cluster.
- HTTP Strict Transport Security (HSTS) is enabled with a one-year `max-age`, `includeSubDomains`, and `preload`.
- `SECURE_SSL_REDIRECT = True` in production — all HTTP requests are redirected to HTTPS (health checks at `/api/health/` are exempt to allow k8s probes).
- Session and CSRF cookies are `Secure` and scoped to the parent domain to support the shared auth session across subdomains.
- CORS is restricted to the configured `APP_ORIGIN`.

---

## Network Isolation — Tailscale Tailnet

The k3s cluster node (DigitalOcean droplet) is enrolled in a **Tailscale tailnet**. Operator access (SSH, `kubectl`, Helm deployments) flows exclusively through the tailnet:

- No public SSH port exposure — the droplet's SSH daemon is accessible only via `tailscale ssh`.
- Tailscale's WireGuard-based mesh provides mutual authentication between operator devices and the server at the network layer.
- The tailnet auth key is rotated on re-enrollment via `tools/ensure_k3s_tailscale.sh`.

This boundary means that even if the application's public endpoints were compromised, the control plane (SSH, cluster API) remains unreachable from the internet.

---

## Secrets Management

**Source of truth: [Infisical Cloud](https://infisical.com)** (`glaze-production` project, `prod` environment).

The secrets lifecycle is:

1. Secrets are authored and rotated in Infisical Cloud's web UI or CLI.
2. A read-only machine identity (`glaze-eso`) grants the **External Secrets Operator** (ESO) access to Infisical via Universal Auth.
3. ESO syncs secrets into the `glaze-secrets` Kubernetes Secret on a 1-hour refresh cycle (`infra/k3s/secretstore.yaml`, `chart/glaze/templates/externalsecret.yaml`).
4. Pods consume the k8s Secret as environment variables at runtime.

The k8s Secret is a **derived operational artifact**, not the source of truth. Deleting or corrupting it does not lose data — ESO recreates it from Infisical on the next sync.

Secrets are not baked into container images or committed to source control. The only credential that bootstraps this chain is the Infisical client secret stored in the GitHub Actions `glaze-droplet` environment, used during CD deploys.

The threat model for secret storage:

- **Cluster compromise**: An attacker with `kubectl` access can read the k8s Secret, but not the Infisical vault itself. Access to Infisical requires the ESO machine identity credential, which is not exposed inside the cluster.
- **Infisical Cloud compromise**: Infisical is a third-party SaaS. Their security posture is documented in their Cure53 penetration test report (request via `security@infisical.com`). The credential scope is read-only for the ESO identity.
- **Image compromise**: Secrets are not in images, so a leaked image does not expose credentials.
- **Source control compromise**: No secrets in git; `.env.production.example` documents required variable names without values.

---

## Backups

Database backups are taken via a k8s CronJob that runs `pg_dump` and uploads the result to **Dropbox** over TLS.

**Backups are not encrypted at rest.** This is a deliberate choice:

- The backup destination (Dropbox) provides its own at-rest encryption at the storage layer.
- Avoiding application-level encryption eliminates key management complexity (no key escrow, no risk of losing the decryption key and making backups unrecoverable).
- The threat being defended against is accidental data loss, not targeted exfiltration of backup files. An attacker who compromises the Dropbox account could read the backup — this is accepted risk given the low sensitivity of the data (pseudonymized user content with no PII).
- If the data sensitivity profile changes (e.g., PII is introduced), this decision should be revisited and backups should be encrypted with an escrowed key (e.g., age + Tailscale KMS or a cloud KMS).

---

## Image Storage

Pottery piece images are stored in **Cloudflare R2** and delivered through a public CDN domain. Uploads go directly from the browser to R2 via short-lived presigned PUT URLs issued by `POST /api/uploads/r2/presigned-url/` (authentication required):

- **Server-generated keys** — the object key is composed entirely server-side (`images/{user.id}/{uuid}.{ext}`); client filenames never reach the key, so collisions, overwrites, and path traversal are impossible.
- **Content-type allowlist** — only allowlisted image/video/audio content types are accepted, the file extension is derived from the validated content type, and the presigned signature pins the `Content-Type` header so the client cannot upload under a different type.
- **Staff-only video/audio** — `resource_type: video` and `audio` (showcase assets) are restricted to staff accounts; regular users may upload images only.
- **Short expiry** — presigned URLs expire after 10 minutes; the signature in the URL is the only credential, and app auth headers are never sent to R2.
- **CSP** — the CSP only permits image/media loads from the R2 CDN domain and upload connections to the account-scoped `*.r2.cloudflarestorage.com` endpoint. (Transitional: `res.cloudinary.com` remains in `img-src`/`media-src` only until the prod asset migration `migrate_assets_to_r2` rewrites legacy stored URLs; it is removed in a follow-up PR.)

---

## Threat Model Summary

| Threat | Mitigated by | Residual risk |
|---|---|---|
| Credential theft from source control | No secrets in git | Low |
| Database dump exposing user identity | SHA-256 pseudonymization of `sub` | Attacker needs Google sub values too |
| Unauthorized account creation | Invite-code gate; account-existence disclosed only after IdP challenge | Invite codes can be shared |
| Email↔account correlation (DB snapshot) | No email stored; code deleted on redemption; batch pre-generation decouples `created_at` from send time | `sent`-flip row-version signal on unredeemed (account-less) codes; deleted rows linger in unencrypted backups |
| Invite-redemption oracle (Resend logs) | No read-only validity check; codes are verified only at authenticated, destructive redemption | A code holder can make a single destructive probe (consuming the invite), learning used/unused but not the OpenID; no polling/timing oracle |
| Cluster takeover via SSH | Tailnet-only SSH access | Tailscale account compromise |
| Backup exfiltration | Dropbox account-level access controls | Dropbox account compromise |
| TLS stripping | HSTS preload, SECURE_SSL_REDIRECT | Preload list propagation delay on new domains |
| Session hijacking | Secure + HttpOnly cookies, CSRF protection | Standard Django session risk |
| SSRF / injection | No user-controlled outbound requests; Django ORM | Standard Django mitigations |

---

## Out of Scope

PotterDoc does not currently:

- Process payments
- Store health, financial, or legal records
- Operate under HIPAA, PCI-DSS, or SOC 2 frameworks
- Offer a supported public API — an OpenAPI-compatible API exists and is documented, but it carries no SLA, is tailored for the web UI, and requires CSRF token handling that makes programmatic consumption cumbersome. The API surface is nonetheless held to the same security mitigations described above.

These are not future commitments — they are statements about the current scope that inform the proportional security controls above.
