---
name: test-performance-audit
description: Run a full test suite performance and flakiness audit. Profiles both the backend (Python cProfile injected into Bazel test sandbox via PYTEST_ADDOPTS) and frontend (vitest JSON reporter), runs each suite twice to detect timing variance, generates a gist with raw profiler dumps, and opens a GitHub issue summarizing hotspots and recommended fixes.
---

# Test Performance Audit

Profiles the full Glaze test suite inside the Bazel sandbox, detects flaky/slow tests, and publishes findings as a GitHub issue with attached profiler artifacts.

## When to Use

- Periodic CI health checks
- After a large batch of new tests lands
- When CI times have noticeably increased
- Before optimizing test infrastructure

---

## Steps

### 1 — Write the cProfile pytest plugin

Bazel runs each `py_test` target in a hermetic sandbox. The way to profile from inside is to inject a small pytest plugin via `PYTEST_ADDOPTS` and make it importable via `PYTHONPATH`. Write the plugin to a temp path:

```bash
cat > /tmp/conftest_profile_plugin.py << 'PLUGIN'
import cProfile, os, pstats, io

def pytest_sessionstart(session):
    session._cprof = cProfile.Profile()
    session._cprof.enable()

def pytest_sessionfinish(session, exitstatus):
    session._cprof.disable()
    outdir = os.environ.get('TEST_UNDECLARED_OUTPUTS_DIR', '/tmp/bazel_prof_fallback')
    os.makedirs(outdir, exist_ok=True)
    session._cprof.dump_stats(os.path.join(outdir, 'combined.prof'))
    s = io.StringIO()
    ps = pstats.Stats(session._cprof, stream=s)
    ps.strip_dirs().sort_stats('cumulative').print_stats(60)
    ps.sort_stats('tottime').print_stats(40)
    with open(os.path.join(outdir, 'profile_report.txt'), 'w') as f:
        f.write(s.getvalue())
PLUGIN
```

Bazel sets `TEST_UNDECLARED_OUTPUTS_DIR` inside the sandbox; files written there are automatically collected into `bazel-testlogs/<target>/test.outputs/outputs.zip`.

### 2 — Backend profiling pass 1 (all targets, profiled)

```bash
rtk bazel test //api:api_test //tests/... \
  --test_env=PYTHONPATH=/tmp \
  --test_env=PYTEST_ADDOPTS="-p conftest_profile_plugin" \
  --test_output=errors
```

`--test_env=PYTHONPATH=/tmp` makes the plugin importable inside the sandbox. `PYTEST_ADDOPTS` is honoured by pytest before `args` from the `py_test` target, so the plugin loads automatically for every target.

### 3 — Backend profiling pass 2 (timing variance detection)

Run a second pass with `--durations` only (no profiler overhead) to detect per-test timing variance:

```bash
rtk bazel test //api:api_test //tests/... \
  --test_arg=--durations=10 \
  --test_output=all 2>&1 | tee /tmp/bazel_durations_run2.txt
```

Compare `slowest N durations` between pass 1 and pass 2. Any test whose time varies by >3× is a flakiness signal (likely a real network call, cold template cache, or non-deterministic mock).

### 4 — Extract and merge profiler outputs

```bash
mkdir -p /tmp/bazel_profiles

for target in api_auth_test api_admin_test api_glaze_test api_model_test api_piece_test api_workflow_test; do
  zip="bazel-testlogs/api/${target}/test.outputs/outputs.zip"
  [ -f "$zip" ] && unzip -o "$zip" -d /tmp/bazel_profiles/${target}/ > /dev/null && echo "extracted $target"
done

zip="bazel-testlogs/tests/common_test/test.outputs/outputs.zip"
[ -f "$zip" ] && unzip -o "$zip" -d /tmp/bazel_profiles/common_test/ > /dev/null && echo "extracted common_test"
```

To merge all per-target pstats files into one combined profile for cross-target analysis:

```python
import pstats, io, os, glob

combined = pstats.Stats()
for prof in glob.glob('/tmp/bazel_profiles/*/combined.prof'):
    combined.add(prof)

combined.strip_dirs()

with open('/tmp/backend_profile_report.txt', 'w') as f:
    combined.stream = f
    combined.sort_stats('cumulative').print_stats(60)
    combined.sort_stats('tottime').print_stats(40)

combined.dump_stats('/tmp/combined_all_targets.prof')
print('merged profile written')
```

### 5 — Interpret the backend profile

Key things to look for in `tottime` output:

| Symbol | Meaning | Fix |
|--------|---------|-----|
| `pbkdf2_hmac` | Password hashing (PBKDF2) in auth tests | `MD5PasswordHasher` in `backend/test_settings.py` |
| `_seed_dev_pieces` / `bootstrap_dev_user` | Dev bootstrap seeding (~800 ORM creates per call) | `GLAZE_DEV_BOOTSTRAP=0` in `_TEST_ENV` in `api/BUILD.bazel` or `backend/test_settings.py` |
| `whitenoise/base.py … update_files_dictionary` | WhiteNoise rescans static files on every middleware init | `WHITENOISE_AUTOREFRESH = False` in `backend/test_settings.py` |
| `validators.py … validate` | jsonschema per state-transition save; usually driven by bootstrap seeding | Drops automatically once bootstrap is off |
| `hashers.py … encode` cumtime high but `pbkdf2_hmac` tottime low | MD5Hasher already active but something else is slow | Check for bcrypt/argon2 in `PASSWORD_HASHERS` list order |

### 6 — Frontend profiling

Vitest doesn't run inside Bazel's sandbox in a way that makes timing data meaningful for profiling (the Bazel web test targets use the same vitest process). Run vitest directly for frontend profiling — the results are unaffected by env var contamination since vitest doesn't read Django settings or `.env.local`.

```bash
(cd web && npm test -- --reporter=json --outputFile=/tmp/vitest_results.json)
```

Parse per-test timings:

```python
import json
from collections import defaultdict

with open('/tmp/vitest_results.json') as f:
    data = json.load(f)

tests = []
for suite in data.get('testResults', []):
    filepath = suite['name'].replace('/path/to/glaze/web/', '')
    for test in suite.get('assertionResults', []):
        tests.append({
            'duration': test.get('duration', 0) or 0,
            'name': ' > '.join(test.get('ancestorTitles', [])) + ' > ' + test.get('title', ''),
            'file': filepath,
            'status': test['status']
        })

tests.sort(key=lambda t: t['duration'], reverse=True)
with open('/tmp/vitest_timings.json', 'w') as f:
    json.dump(tests, f, indent=2)

by_file = defaultdict(list)
for t in tests:
    by_file[t['file']].append(t['duration'])
file_totals = sorted([(f, sum(d), len(d)) for f, d in by_file.items()], key=lambda x: x[1], reverse=True)
```

Key things to look for:
- `userEvent.type()` on MUI Autocomplete inputs dominates `GlobalEntryDialog`, `TagManager`, `WorkflowState` — consider `fireEvent.change()` where per-keystroke behavior is not tested
- Test files with high total time and many tests (e.g. `PieceDetail.test.tsx`) may benefit from splitting to allow Vitest worker parallelism
- Single tests >500ms are strong optimization candidates
- Fast reference patterns: `workflow.test.ts` (~17ms for 63 tests — pure functions), `api.test.ts` (~77ms for 34 tests — axios-mock only)

### 7 — Upload artifacts to a gist

The binary pstats dump must be base64-encoded since `gh gist create` rejects binary files:

```bash
base64 /tmp/combined_all_targets.prof > /tmp/combined_prof_b64.txt

gh gist create \
  /tmp/backend_profile_report.txt \
  /tmp/vitest_timings.json \
  /tmp/combined_prof_b64.txt \
  --desc "Glaze test suite profiler results — issue #<N>" \
  --public
```

To restore the binary locally: `base64 -d combined_prof_b64.txt > combined.prof`, then open with `python -m pstats` or [SnakeViz](https://jiffyclub.github.io/snakeviz/).

### 8 — Create the GitHub issue

Write the issue body to a temp file and use `--body-file`. The body should contain:

1. **Gist link** at the top with file descriptions
2. **Backend hotspot table** — time, % of total, and concrete fix for each hotspot, per Bazel target and merged
3. **Frontend slowest-files table** — total ms, test count, avg/test, root cause
4. **Slowest individual tests** (top 10) with durations
5. **Priority table** — ranked fixes with estimated savings

Priority schema:
- 🔴 P0 — tests that fail under `rtk bazel test //...`
- 🟠 P1 — single-line settings changes with high savings (`test_settings.py`)
- 🟡 P2 — test code changes (swap `userEvent` → `fireEvent`, disable bootstrap in env)
- 🟢 P3 — structural refactors (split large test files for Vitest parallelism)

```bash
gh label create testing --color 0075ca --force
gh issue create \
  --title "Test suite audit: <summary of top finding>" \
  --body-file /tmp/test_audit_issue.md \
  --label "testing"
```

### 9 — Keep the issue clean

Write one self-contained issue body. If you iterate during investigation, **edit the issue body** rather than accumulating comment threads:

```bash
gh issue edit <N> --body-file /tmp/test_audit_issue.md
# Delete any stale comments:
gh api -X DELETE /repos/shaoster/glaze/issues/comments/<integer-id>
```

---

## Known Hotspots (baseline from 2026-05-07 audit)

These were measured via the Bazel-injected profiler. Use as a comparison baseline for future audits.

| Layer | Bazel target | Hotspot | Approx time | Fix |
|-------|-------------|---------|-------------|-----|
| Backend | `api_auth_test` | PBKDF2 password hashing | ~1.5s / target | `MD5PasswordHasher` in `backend/test_settings.py` |
| Backend | `api_glaze_test` | Dev bootstrap seeding (`_seed_dev_pieces`) | ~2s / target | `GLAZE_DEV_BOOTSTRAP=0` in test env |
| Backend | `api_admin_test` | WhiteNoise static file scan | ~1.3s / target | `WHITENOISE_AUTOREFRESH = False` |
| Frontend | `GlobalEntryDialog.test.tsx` | `userEvent.type()` on Autocomplete | 5039ms total (15 tests) | `fireEvent.change()` where keystroke behavior not tested |
| Frontend | `PieceDetail.test.tsx` | Breadth (40 tests, DOM re-init per file) | 4696ms total | Split into sub-files for Vitest parallelism |
| Frontend | `GlazeImportReviewStage.test.tsx` | Single test, multi-step form | 1296ms | Scope down or use `fireEvent` |
