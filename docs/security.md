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

---

## Data Classification

| Category | What we store | Notes |
|---|---|---|
| User identity | SHA-256 hash of Google `sub` | Not reversible without the original `sub` |
| User content | Pottery piece records, workflow states, images | Owned by the authenticated user; isolated by FK |
| Public library | Shared pieces with `user=NULL` | Admin-managed only; not user-writable |
| Credentials | Django `SECRET_KEY`, `POSTGRES_PASSWORD`, Cloudinary keys, email relay key, Dropbox tokens | Stored as environment variables in k8s Secrets |
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

Secrets are stored as **Kubernetes Secrets** injected as environment variables into pods at runtime. They are not baked into container images or committed to source control.

The production `.env` file on the droplet (used only during initial cluster bootstrap) is not tracked in version control. `.env.production.example` documents the required variables without values.

There is no KMS or envelope encryption layer currently in use. The threat model for secret storage is:

- **Cluster compromise**: An attacker who gains `kubectl` access can read Secrets. This is mitigated by the tailnet boundary above.
- **Image compromise**: Secrets are not in images, so a leaked image does not expose credentials.
- **Source control compromise**: No secrets in git.

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

Pottery piece images are stored in **Cloudinary**. Upload credentials are scoped to a configured upload folder; public uploads use an unsigned upload preset scoped to a separate public folder. Cloudinary provides its own access controls and CDN-level delivery.

---

## Threat Model Summary

| Threat | Mitigated by | Residual risk |
|---|---|---|
| Credential theft from source control | No secrets in git | Low |
| Database dump exposing user identity | SHA-256 pseudonymization of `sub` | Attacker needs Google sub values too |
| Unauthorized account creation | Invite-code gate | Invite codes can be shared |
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
- Offer a public API or third-party integrations beyond Google OAuth

These are not future commitments — they are statements about the current scope that inform the proportional security controls above.
