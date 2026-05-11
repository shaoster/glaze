## Summary
Finalize the stabilization of the asynchronous task queue by resolving persistent crashes, deadlocks, and resource contention. This PR re-introduces structured log correlation and implements robust resource management for production environments.

## Changes
- **Structured Log Correlation**: Added `api/logging.py` with `contextvars`-based `task_context` and `TaskCorrelationFilter` to automatically tag all logs within a background task with its `task_id`.
- **rembg TypeError Fix**: Bypassed a known bug in `rembg.new_session` (present in v2.0.30) where passing `sess_opts` as a keyword argument causes a `TypeError`.
- **System Thread Limits**: Set `OMP_NUM_THREADS`, `MKL_NUM_THREADS`, and `ONNXRUNTIME_*_OP_NUM_THREADS` to `1` in the `Dockerfile` to prevent CPU over-subscription and deadlocks in multi-worker environments.
- **Async Streaming**: Refined `admin_cloudinary_cleanup_archive` to use an async generator for ZIP streaming while maintaining synchronous view compatibility for the test suite.
- **Task Lifecycle Improvements**: Integrated task correlation into `ApiConfig` and the `InMemoryTaskInterface` execution loop.
- **Test Suite Refactoring**: Consolidated redundant async task test helpers and improved mock reliability in `api/tests/`.

## Verification
- Ran `bazel test //api:api_test` (All 7 targets PASSED).
- Ran `bazel test //api:api_mypy` (PASSED).
- Verified that logs are correctly correlated and `rembg` sessions initialize without error.

Linked to #348.
