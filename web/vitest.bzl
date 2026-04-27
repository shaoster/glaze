"""
Exposes vitest_macro to run vitest_tests in a manner that supports coverage collection.
"""

load("@npm//web:vitest/package_json.bzl", vitest_pkg = "bin")

def vitest_test(name, srcs, deps, config = "//web:vitest.config.ts", **kwargs):
    """
    vitest macro takes care of setting up the necessary arguments and data dependencies for running vitest tests.

    Note: If you're using this macro outside of //web:*, make sure to include:
       `chdir = package_name()`

    Args:
        name: The name of the test target.
        srcs: The test files for the test target.
        config: The label for the vitest.config.ts file. Needs to also be declared in deps.
        deps: The js_library dependencies for the test target.
        **kwargs: Additional keyword arguments that can be passed to the vitest_test rule.
    """
    data = srcs + deps + ["//web:web_test_configs", config]

    # If we want to eventually do the bazel-idiomatic path resolutions, we can resolve
    # args to vitest like so:
    #
    # args = ["--config", "$(location %s)" % config, "run"] + ["$(location %s)" % src for src in srcs]
    args = ["run"] + srcs

    # This chdir makes it easier to configure vitest's relative path discovery
    # with the downside of it being surprising for users outside of //:web.
    chdir = kwargs.pop("chdir", native.package_name())
    vitest_pkg.vitest_test(
        name = name,
        args = select({
            "//:is_coverage_build": args + ["--coverage"],
            "//conditions:default": args,
        }),
        chdir = chdir,
        data = data,
        **kwargs
    )
