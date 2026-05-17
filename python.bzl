load("@aspect_rules_py//py:defs.bzl", "py_test")

def pytest_test(name, srcs, deps, cov_src = None, **kwargs):
    """Wraps py_test, injecting --cov during coverage builds.

    Automatically adds pytest and coverage to deps. Callers should not list
    either explicitly.

    Args:
        name: Target name.
        srcs: Source files.
        deps: Dependencies (pytest and coverage are added automatically).
        cov_src: Package name to measure coverage for (default: current package name).
        **kwargs: Forwarded to py_test (including args, main, data, env, size, tags, etc.)
    """
    args = kwargs.pop("args", [])
    if cov_src == None:
        cov_src = native.package_name()

    py_test(
        name = name,
        srcs = srcs,
        deps = deps + ["@pypi//pytest", "@pypi//coverage"],
        args = select({
            "//:is_coverage_build": args + ["--cov=" + cov_src],
            "//conditions:default": args,
        }),
        **kwargs
    )
