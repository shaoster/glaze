load("@aspect_rules_py//py:defs.bzl", "py_test")

def pytest_test(name, srcs, deps, cov_src = None, expected_coverage = [], **kwargs):
    """Wraps py_test, injecting --cov during coverage builds.

    Automatically adds pytest and coverage to deps. Callers should not list
    either explicitly.

    Args:
        name: Target name.
        srcs: Source files.
        deps: Dependencies (pytest and coverage are added automatically).
        cov_src: Package name to measure coverage for (default: current package name).
        expected_coverage: Optional list of file glob patterns (repo-root-relative) that
            this test is expected to cover. When set, coverage-audit will flag files
            covered outside these patterns. Example: ["api/piece_views.py", "api/models.py"].
            Defaults to [] (no scope declared; audit falls back to bucket heuristics).
        **kwargs: Forwarded to py_test (including args, main, data, env, size, tags, etc.)
    """
    args = kwargs.pop("args", [])
    if cov_src == None:
        cov_src = native.package_name()

    scope_args = ["--expected-coverage=" + p for p in expected_coverage]
    tags = kwargs.get("tags", [])
    integration_args = ["--coverage-integration-test"] if "integration" in tags else []

    py_test(
        name = name,
        srcs = srcs,
        deps = deps + ["@pypi//pytest", "@pypi//coverage"],
        args = select({
            "//:is_coverage_build": args + ["--cov=" + cov_src] + scope_args + integration_args,
            "//conditions:default": args,
        }),
        **kwargs
    )
