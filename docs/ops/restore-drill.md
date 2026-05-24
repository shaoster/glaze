# Production Restore Drill Runbook

Use this runbook to restore a production database backup into production and verify it.
Run this drill before onboarding external users, after any suspected data loss, or on a
scheduled basis to verify the backup chain remains healthy.

---

## Backup source

Production backups are uploaded by the `glaze-db-backup` CronJob (runs hourly).

- **Dropbox path**: `Apps/potterdoc/glaze-db-backups/<sha256>.dump`
- The filename is the SHA256 checksum of the dump file.
- Format: `pg_dump -Fc` (custom format), no owner, no ACL.

## Choosing a backup

1. Open Dropbox → Apps → potterdoc → glaze-db-backups.
2. Sort by **Date modified** descending. The most recent file is the latest backup.
3. Note the filename (SHA256) — this is your audit reference.

RPO: backups run hourly, so worst-case data loss is up to 1 hour of changes.

## Running the drill

Download the chosen `.dump` file from Dropbox to your local machine, then run:

```bash
gz_restore --prod /path/to/<sha256>.dump
```

The command will:
1. Print a warning banner naming the dump file and production host.
2. Generate a random 6-character confirmation string and require you to type it.
3. Stream the dump into production Postgres via `ssh $GLAZE_PROD_HOST kubectl exec`.
4. Run four verification checks (see below).
5. Print elapsed time and all check results.

`GLAZE_PROD_HOST` must be set in your `.env.local` (e.g., `root@glaze-prod`).

## Verification checks

The command automatically runs all four checks and fails loudly if any do not pass:

| Check | Expected |
|---|---|
| `SELECT COUNT(*) FROM auth_user` | > 0 |
| `SELECT COUNT(*) FROM api_piece` | > 0 |
| Pieces with no state history | 0 |
| Orphaned piece states | 0 |

## Success criteria

- `gz_restore --prod` exits 0.
- All four verification checks pass.
- Elapsed time is reasonable (< 10 minutes for current data volume).

## After the drill

Record the results in [restore-drill-log.md](restore-drill-log.md).

## RPO / RTO

- **RPO (Recovery Point Objective)**: ≤ 1 hour. Backups run hourly; at most one hour of
  changes may be lost.
- **RTO (Recovery Time Objective)**: Operator-driven. Based on recorded drills, the
  restore + verification step takes approximately N minutes (see drill log). Re-pointing
  the application (pod restart) adds ~1 minute on top of that.

## Cleanup

The drill restores into production — there is no separate disposable environment to clean
up. If you ran a test drill against a non-production target, delete that target manually.
