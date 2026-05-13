import pytest
import os
import glob
from django.conf import settings

@pytest.mark.django_db
def test_migrations_completeness():
    """
    Verifies that all migration files present in the api/migrations directory
    are actually available at runtime. This prevents Bazel-built OCI images
    from missing migrations that weren't explicitly added to BUILD.bazel.
    """
    # Path to migrations in the source tree (or as seen by the test runner)
    # When running under Bazel, this should point to the runfiles.
    migrations_dir = os.path.join(settings.BASE_DIR, "api", "migrations")
    
    # Get all .py files in migrations directory, excluding __init__.py
    migration_files = glob.glob(os.path.join(migrations_dir, "*.py"))
    migration_files = [f for f in migration_files if not f.endswith("__init__.py")]
    
    # Extract just the filenames for comparison
    migration_filenames = {os.path.basename(f) for f in migration_files}
    
    # Now check what Django's migration loader sees (which depends on what's in the PYTHONPATH/runfiles)
    from django.db.migrations.loader import MigrationLoader
    from django.db import connections
    
    loader = MigrationLoader(connections["default"])
    
    # Get all migrations registered for the 'api' app
    registered_migrations = {
        m[1] for m in loader.disk_migrations.keys() if m[0] == "api"
    }
    
    # Convert filenames to migration names (e.g. '0001_initial.py' -> '0001_initial')
    expected_migration_names = {os.path.splitext(f)[0] for f in migration_filenames}
    
    missing_from_loader = expected_migration_names - registered_migrations
    
    assert not missing_from_loader, (
        f"Migrations found on disk but missing from Django loader: {missing_from_loader}. "
        "Check if they are missing from api/BUILD.bazel."
    )
