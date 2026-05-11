Migrate `backpopulate_crops` to the async task pipeline

The management command previously ran every crop detection synchronously
in-process, blocking the shell for the entire run with no progress
feedback. This PR routes all work through the production `AsyncTask`
pipeline (`detect_subject_crop` task type) and adds basic progress output.

## What changed

### `api/management/commands/backpopulate_crops.py`
- Removed direct calls to `calculate_subject_crop` / `requests.get`
- Each qualifying `(image, piece)` and `(image, PieceStateImage)` pair is
  now enqueued as an `AsyncTask` via `AsyncTask.objects.create` +
  `get_task_interface().submit()`
- Added required `--user <email>` argument to own the created task records
  (raises `CommandError` if omitted in live mode or if the email is unknown)
- `--dry-run` counts qualifying images and prints a summary without
  touching the DB
- `--force` semantics preserved: re-enqueues tasks even for images that
  already have a crop
- Inline progress counter (`Queued N / TOTAL tasks...`) uses a
  carriage-return overwrite loop — no new dependencies required

### `api/tests/test_utils.py`
- Replaced three synchronous-write tests with six async-pipeline tests:
  - `test_dry_run_does_not_enqueue_tasks`
  - `test_live_mode_requires_user_arg`
  - `test_live_mode_enqueues_task_for_missing_thumbnail_crop`
  - `test_skips_images_with_existing_crop_by_default`
  - `test_force_enqueues_tasks_for_existing_crops`
  - `test_unknown_user_raises_command_error`

## Usage

```bash
# Preview how many tasks would be enqueued
python manage.py backpopulate_crops --dry-run

# Enqueue tasks for all images missing a crop
python manage.py backpopulate_crops --user admin@example.com

# Re-enqueue even for images that already have a crop
python manage.py backpopulate_crops --user admin@example.com --force
```

Monitor task progress at `/admin/api/asynctask/`.

Closes #342
