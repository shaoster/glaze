Implement a shared-broker task backend using Celery and Redis to decouple async task execution from the API server processes (#436). This PR also relocates the task cleanup logic to a dedicated initialization service (#437), unblocking rolling production deploys.

### Changes

- **Infrastructure:**
  - Added `celery` and `redis` Python dependencies.
  - Created `backend/celery.py` to initialize the Celery application.
  - Updated `docker-compose.yml` to include `redis`, `worker`, and `deploy_init` services.
  - Added a `deploy_init` one-shot service that runs migrations and `clear_stuck_tasks` before the app starts.

- **Backend Logic:**
  - Implemented `CeleryTaskInterface` in `api/tasks.py`.
  - Refactored task execution into a standalone `_execute_task` helper shared by both in-memory and Celery backends.
  - Updated `get_task_interface()` to switch backends based on the `ASYNC_TASK_BACKEND` setting (defaulting to `celery` if a broker URL is present).
  - Implemented health checks for the Celery/Redis backend.

- **Cleanup:**
  - Removed `clear_stuck_tasks` from `docker-entrypoint.sh` to prevent cross-instance interference during rolling restarts.

- **Verification:**
  - Added `api/tests/test_celery_tasks.py` for comprehensive coverage of the new interface.
  - Updated existing async task tests to work with the refactored execution logic.
  - Verified all tests pass via Bazel.

Closes #436
Closes #437
