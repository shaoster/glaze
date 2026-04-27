"""
Exposes vitest_macro to run vitest_tests in a manner that supports coverage collection.
"""

load("@npm//web:vitest/package_json.bzl", vitest_pkg = "bin")

def vitest_test(name, srcs, deps, **kwargs):
    """
    vitest macro takes care of setting up the necessary arguments and data dependencies for running vitest tests.

    Note: If you're using this macro outside of //web:*, make sure to include:
       `chdir = package_name()`

    Args:
        name: The name of the test target.
        srcs: The test files for the test target.
        deps: The js_library dependencies for the test target.
        **kwargs: Additional keyword arguments that can be passed to the vitest_test rule.
    """
    data = srcs + deps + ["//web:web_test_configs"]
    args = ["run"] + srcs

    # Use the user-provided chdir.
    kwargs.pop("chdir", None)
    vitest_pkg.vitest_test(
        name = name,
        args = select({
            "//:is_coverage_build": args + ["--coverage"],
            "//conditions:default": args,
        }),
        chdir = native.package_name(),
        data = data,
        **kwargs
    )
