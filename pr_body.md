## Summary
This PR updates the Glaze development environment to funnel package management and tool invocations through Bazel.

### Changes
- **env.sh**: Updated `gz_setup`, `gz_manage`, and `gz_web` to use `bazel run` wrappers for `uv` and `npm`.
- **env.sh**: Updated test aliases (`gz_test_web`, `gz_test_backend`, `gz_test_common`) to use native `bazel test` targets.
- **Documentation**: Updated `README.md` and all agent guides to instruct developers and AI agents to use the new `bazel run` patterns.
- **Skills**: Updated repo-local agent skills to use Bazel for package management.

### Verification
- `gz_manage check` verified in a fresh worktree.
- `bazel run` commands for `uv` and `npm` confirmed working via `rules_python` and `rules_nodejs` toolchains.
