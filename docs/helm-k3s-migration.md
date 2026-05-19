# Helm + k3s Migration Plan

This document turns [issue #277](https://github.com/shaoster/glaze/issues/277) into a concrete migration checklist for moving Glaze production from `docker-compose` to Helm on k3s.

The intended production shape is:

- Helm packages the release.
- k3s runs on the droplet.
- `deploy_init` becomes a Kubernetes `Job` or Helm hook `Job`.
- `web` and `worker` become independent `Deployment`s.
- `nginx` becomes ingress.
- The database migration uses explicit backup and restore steps before any PVC churn.

Minikube is useful for local chart validation, but not as the production runtime.

## Migration Checklist

### 1. Model the existing Compose stack in Kubernetes terms

- [ ] Map `deploy_init` to a Helm hook `Job` or a pre-install / pre-upgrade `Job`.
- [ ] Map `web` to a `Deployment` with readiness and liveness probes.
- [ ] Map `worker` to a separate `Deployment` with independent scaling.
- [ ] Map `otelcol` to a `Deployment`.
- [ ] Decide whether `nginx` becomes an `Ingress` controller or remains a separate ingress layer.
- [ ] Decide whether `redis` stays inside the cluster or moves to an external managed service.
- [ ] Decide whether Postgres stays on the droplet or moves into the cluster behind a PVC.
- [ ] Document which environment values belong in `ConfigMap` versus `Secret`.

### 2. Keep the release contract portable

- [ ] Align Kubernetes readiness probes with `/api/health/ready/`.
- [ ] Keep liveness behavior consistent with the current container startup assumptions.
- [ ] Keep image tags immutable per release.
- [ ] Preserve the one-shot bootstrap contract for migrations, public library refresh, and stuck-task cleanup.
- [ ] Make it explicit that worker startup is independent from web replica count.

### 3. Introduce Helm before cutting over

- [ ] Create a Helm chart that mirrors the current Compose topology.
- [ ] Validate the chart in a non-production environment first.
- [ ] Keep Compose as the production path while the chart is being proven.
- [ ] Add a documented `helm upgrade --install` release flow.
- [ ] Document how rollbacks work with Helm revisions.

### 4. Stand up k3s on the droplet

- [ ] Install k3s on the droplet.
- [ ] Deploy the stateless workloads first.
- [ ] Prove that `web` and `worker` can run under k3s while Compose still serves production.
- [ ] Confirm ingress and TLS behavior match the current public site.
- [ ] Confirm the bootstrap job runs successfully in the cluster.

### 5. Protect Postgres before any PVC churn

- [ ] Freeze the database migration plan before touching storage.
- [ ] Take a full logical backup of the live Postgres database.
- [ ] Store that backup off-droplet, not just on the same machine.
- [ ] Record a checksum for the backup artifact.
- [ ] Restore the backup into a disposable Postgres instance.
- [ ] Verify the restore by running application-level checks against the disposable database.
- [ ] Keep the current Compose Postgres volume untouched until the restore test passes.

### 6. Move Postgres into the new storage model

- [ ] Create a dedicated PVC for Postgres in k3s, if Postgres remains cluster-managed.
- [ ] Restore the verified backup into the new PVC-backed database.
- [ ] Run read-only application checks against the restored database.
- [ ] Take a fresh backup immediately before cutover if the old stack has continued accepting writes.
- [ ] Apply the final backup or replay to the new database.
- [ ] Verify the application can read and write normally against the new database.

### 7. Cut over traffic with downtime allowed

- [ ] Schedule a maintenance window for the production cutover.
- [ ] Stop writes on the old Compose stack before the final database sync.
- [ ] Route ingress traffic to the k3s `web` deployment.
- [ ] Confirm health checks, async jobs, and uploads work end to end.
- [ ] Keep the Compose stack available until the new stack has been stable long enough to trust it.
- [ ] Define a Helm rollback path that does not require database deletion.
- [ ] Define a database rollback path that uses the saved backup artifacts.
- [ ] Decommission the Compose deploy path only after the k3s path is proven.

## Explicit Backup Safety Steps

These are the non-negotiable protections for the Postgres volume churn:

1. Take a logical backup of the current Postgres database before any PVC work.
2. Copy the backup off the droplet.
3. Record and verify a checksum for the backup artifact.
4. Restore the backup into a disposable database.
5. Run application-level smoke checks against the disposable database.
6. Only then create or reuse a k3s PVC for the production restore.
7. Keep the old Compose Postgres volume untouched until the new database is proven.
8. Keep a final backup available for the cutover window in case writes continue during the migration.

## Risks and Decisions

- [ ] Decide whether Postgres should be cluster-managed or remain external.
- [ ] Decide whether Redis should remain cluster-managed or remain external.
- [ ] Decide whether ingress should stay nginx-based or move to a cluster ingress controller.
- [ ] Decide how secrets will be sourced on the droplet.
- [ ] Decide whether the existing rolling deploy logic is kept as a fallback during migration.

## Exit Criteria

- [ ] The Helm chart reproduces the current app topology.
- [ ] The one-shot bootstrap job works under the new release flow.
- [ ] The Postgres backup and restore path has been tested before any PVC churn.
- [ ] The k3s deployment can be rolled back without data loss.
- [ ] The issue can be closed only after the new path is proven in production.
