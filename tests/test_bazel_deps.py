import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_rules_shell_version():
    """Assert that the direct dependency version of rules_shell in MODULE.bazel is 0.6.1."""
    module_bazel_path = ROOT / "MODULE.bazel"
    assert module_bazel_path.exists(), "MODULE.bazel file does not exist"

    content = module_bazel_path.read_text()
    # Match: bazel_dep(name = "rules_shell", version = "X.Y.Z")
    match = re.search(
        r"bazel_dep\(\s*name\s*=\s*[\"']rules_shell[\"']\s*,\s*version\s*=\s*[\"']([^\"']+)[\"']\s*\)",
        content,
    )
    assert match is not None, "Could not find rules_shell dependency in MODULE.bazel"

    version = match.group(1)
    assert version == "0.6.1", (
        f"Expected rules_shell version to be '0.6.1', but got '{version}'"
    )
