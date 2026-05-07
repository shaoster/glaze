---
name: test-performance-audit
description: Run a full test suite performance and flakiness audit. Profiles both the backend (Python cProfile via pytest) and frontend (vitest JSON reporter), runs each suite twice to detect timing variance, generates a gist with raw profiler dumps, and opens a GitHub issue summarizing hotspots and recommended fixes.
---

# Test Performance Audit

Profiles the full Glaze test suite, detects flaky/slow tests, and publishes findings as a GitHub issue with attached profiler artifacts.

## When to Use

- Periodic CI health checks
- After a large batch of new tests lands
- When CI times have noticeably increased
- Before optimizing test infrastructure

## Steps

### 1 — Environment setup

```bash
source env.sh
# Ensure pytest-profiling is installed (dev dep, not in requirements.txt)
pip install pytest-profiling gprof2dot
```

### 2 — Backend profiling (two passes for variance detection)

Run from the repo root with Django settings configured:

```bash
export DJANGO_SETTINGS_MODULE=backend.settings
source .venv/bin/activate

# Pass 1 — timed, profiled
time pytest api/ tests/ --profile -p no:randomly 2>&1 | tee /tmp/pytest_run1.txt

# Pass 2 — timed only (detect per-test variance)
time pytest api/ tests/ --durations=20 -p no:randomly 2>&1 | tee /tmp/pytest_run2.txt
```

pytest-profiling writes a `prof/combined.prof` (pstats binary) plus per-test `.prof` files to `prof/` in the repo root. These are gitignored.

Parse the combined profile into a readable text report:

```python
import pstats

p = pstats.Stats('prof/combined.prof', stream=open('/tmp/backend_profile_report.txt', 'w'))
p.strip_dirs()
p.sort_stats('cumulative')
p.print_stats(60)
p.sort_stats('tottime')
p.print_stats(40)
```

Key things to look for in `tottime` output:
- `pbkdf2_hmac` — password hashing; fix with `MD5PasswordHasher` in test settings
- `_seed_dev_pieces` / `bootstrap_dev_user` — dev bootstrap running in tests; disable with `GLAZE_DEV_BOOTSTRAP=0`
- `whitenoise/base.py … update_files_dictionary` — static file scan per request; fix with `WHITENOISE_AUTOREFRESH = False`
- `validators.py … validate` — jsonschema per state save; usually cascades from bootstrap seeding

### 3 — Frontend profiling (two passes)

```bash
cd web

# Pass 1 — JSON output for structured timing data
npm test -- --reporter=json --outputFile=/tmp/vitest_results.json

# Pass 2 — verbose for human-readable variance check
npm test -- --reporter=verbose 2>&1 | tee /tmp/web_test_run2.txt
```

Parse per-test timings from the JSON output:

```python
import json
from collections import defaultdict

with open('/tmp/vitest_results.json') as f:
    data = json.load(f)

tests = []
for suite in data.get('testResults', []):
    filepath = suite['name'].replace('/path/to/web/', '')
    for test in suite.get('assertionResults', []):
        tests.append({
            'duration': test.get('duration', 0) or 0,
            'name': ' > '.join(test.get('ancestorTitles', [])) + ' > ' + test.get('title', ''),
            'file': filepath,
            'status': test['status']
        })

tests.sort(key=lambda t: t['duration'], reverse=True)

by_file = defaultdict(list)
for t in tests:
    by_file[t['file']].append(t['duration'])
file_totals = sorted([(f, sum(d), len(d)) for f, d in by_file.items()], key=lambda x: x[1], reverse=True)
```

Key things to look for:
- `userEvent.type()` on MUI Autocomplete inputs dominates `GlobalEntryDialog`, `TagManager`, `WorkflowState` tests — consider `fireEvent.change()` where per-keystroke behavior is not tested
- Test files with many tests and high total time (e.g. `PieceDetail.test.tsx`) may benefit from splitting to allow Vitest worker parallelism
- Single tests >500ms are strong optimization candidates
- Fast reference patterns: pure util tests (`workflow.test.ts` ~17ms for 63 tests) and axios-mock tests (`api.test.ts` ~77ms for 34 tests)

### 4 — Cross-check via Bazel

Run the authoritative Bazel suite to confirm all tests pass under the required test runner before reporting:

```bash
rtk bazel test //...
```

Any test that fails under `pytest` directly but passes under `bazel test` is a **test isolation issue** (env var leakage from `.env.local`), not a real failure. Do not report these as broken tests — note them as environment-only issues if relevant.

### 5 — Upload artifacts to a gist

```bash
# Base64-encode the binary pstats dump so gh gist can accept it
base64 prof/combined.prof > /tmp/combined_prof_b64.txt

gh gist create \
  /tmp/backend_profile_report.txt \
  /tmp/vitest_timings.json \
  /tmp/combined_prof_b64.txt \
  --desc "Glaze test suite profiler results — issue #<N>" \
  --public
```

The base64 dump can be restored with: `base64 -d combined_prof_b64.txt > combined.prof`, then opened with `python -m pstats` or [SnakeViz](https://jiffyclub.github.io/snakeviz/).

### 6 — Create the GitHub issue

Write the issue body to a temp file and use `--body-file`. The body should contain:

1. **Gist link** at the top with file descriptions
2. **Backend hotspot table** — time, %, and concrete fix for each hotspot
3. **Frontend slowest-files table** — total ms, test count, avg/test, root cause
4. **Slowest individual tests** (top 10) with durations
5. **Priority table** — ranked fixes with estimated savings

Use the priority schema:
- 🔴 P0 — tests that fail under `bazel test //...`
- 🟠 P1 — single-line settings changes with high savings
- 🟡 P2 — test code changes (swap `userEvent` → `fireEvent`, disable bootstrap in env)
- 🟢 P3 — structural refactors (split large test files)

```bash
gh issue create \
  --title "Test suite audit: <summary of top finding>" \
  --body-file /tmp/test_audit_issue.md \
  --label "testing"
```

Create the `testing` label first if needed: `gh label create testing --color 0075ca --force`

### 7 — Keep the issue clean

Write one self-contained issue body. If you iterate during investigation, **edit the issue body** (`gh issue edit <N> --body-file`) and delete follow-on comments (`gh api -X DELETE /repos/<owner>/<repo>/issues/comments/<integer-id>`) rather than accumulating comment threads.

## Known Hotspots (as of last audit, 2026-05-07)

| Layer | Hotspot | Time | Fix |
|-------|---------|------|-----|
| Backend | Dev bootstrap seeding | 7.7s / 27% | `GLAZE_DEV_BOOTSTRAP=0` in test env |
| Backend | WhiteNoise static scan | 6.1s / 22% | `WHITENOISE_AUTOREFRESH = False` |
| Backend | PBKDF2 password hashing | 4.6s / 16% | `MD5PasswordHasher` in test settings |
| Frontend | `userEvent.type()` on Autocomplete | ~5s across files | `fireEvent.change()` where keystroke behavior not tested |
| Frontend | `PieceDetail.test.tsx` breadth (40 tests) | 4.7s | Split into sub-files for parallelism |

## Variance Detection

Compare `--durations=20` output between run 1 and run 2. Flag any test whose time varies by >3× between runs — this is a flakiness signal (likely a real network call, cold template cache, or non-deterministic mock). Example from prior audit: `test_change_page_renders_with_test_tile_image` varied from 0.24s to 4.53s.
