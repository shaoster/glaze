# Restore Drill Log

Each row records one completed restore drill. See [restore-drill.md](restore-drill.md) for the runbook.

| Date | Operator | Backup filename (SHA256) | Users | Pieces | Orphan pieces | Orphan states | Elapsed | Notes |
|---|---|---|---|---|---|---|---|---|
| 2026-05-24 | shaoster | e406538a97f87bd33a3111129801765a75a4c8eaaeccbc6d64cb9a247d60307f.dump | ✓ >0 | ✓ >0 | ✓ 0 | ✓ 0 | ~1 min | Restored into empty prod DB (deliberately nuked first). No user session interruption observed. |
