---
name: bazel-build-optimization
description: |
  Generic Bazel optimization patterns: remote caching, query analysis, performance
  profiling, custom rules, and .bazelrc configuration. In Glaze, invoke when modifying
  .bazelrc, MODULE.bazel, or lint.bzl; diagnosing slow or cache-missing CI builds;
  or writing a new Bazel rule or aspect. For routine BUILD.bazel source-file additions
  (new test srcs, new js_library targets), use /dev-testing instead.
source: https://github.com/wshobson/agents/tree/main/plugins/developer-essentials/skills/bazel-build-optimization
---

# Bazel Build Optimization

Production patterns for Bazel in large-scale monorepos.

## When to Use This Skill

- Setting up Bazel for monorepos
- Configuring remote caching/execution
- Optimizing build times
- Writing custom Bazel rules
- Debugging build issues
- Migrating to Bazel

## Core Concepts

### 1. Bazel Architecture

```
workspace/
├── WORKSPACE.bazel       # External dependencies
├── .bazelrc              # Build configurations
├── .bazelversion         # Bazel version
├── BUILD.bazel           # Root build file
├── apps/
│   └── web/
│       └── BUILD.bazel
├── libs/
│   └── utils/
│       └── BUILD.bazel
└── tools/
    └── bazel/
        └── rules/
```

### 2. Key Concepts

| Concept | Description |
|---------|-------------|
| **Target** | Buildable unit (library, binary, test) |
| **Package** | Directory with BUILD file |
| **Label** | Target identifier `//path/to:target` |
| **Rule** | Defines how to build a target |
| **Aspect** | Cross-cutting build behavior |

## Templates

### Template 1: .bazelrc — Remote Caching and CI

```bash
# Performance
build --jobs=auto
build --local_cpu_resources=HOST_CPUS*.75
build --local_ram_resources=HOST_RAM*.75

# Local caching
build --disk_cache=~/.cache/bazel-disk
build --repository_cache=~/.cache/bazel-repo

# Remote caching
build:remote-cache --remote_cache=grpcs://cache.example.com
build:remote-cache --remote_upload_local_results=true
build:remote-cache --remote_timeout=3600

# CI — enable remote cache, tag builds for BES
build:ci --config=remote-cache
build:ci --build_metadata=ROLE=CI

# Test settings
test --test_output=errors
test --test_summary=detailed

# Coverage
coverage --combined_report=lcov
coverage --instrumentation_filter="//..."

try-import %workspace%/user.bazelrc
```

### Template 2: TypeScript Library BUILD

```python
# libs/utils/BUILD.bazel
load("@aspect_rules_ts//ts:defs.bzl", "ts_project")
load("@aspect_rules_js//js:defs.bzl", "js_library")
load("@npm//:defs.bzl", "npm_link_all_packages")

npm_link_all_packages(name = "node_modules")

ts_project(
    name = "utils_ts",
    srcs = glob(["src/**/*.ts"]),
    declaration = True,
    source_map = True,
    tsconfig = "//:tsconfig.json",
    deps = [
        ":node_modules/@types/node",
    ],
)

js_library(
    name = "utils",
    srcs = [":utils_ts"],
    visibility = ["//visibility:public"],
)

# Tests
load("@aspect_rules_jest//jest:defs.bzl", "jest_test")

jest_test(
    name = "utils_test",
    config = "//:jest.config.js",
    data = [
        ":utils",
        "//:node_modules/jest",
    ],
    node_modules = "//:node_modules",
)
```

### Template 4: Python Library BUILD

```python
# libs/ml/BUILD.bazel
load("@rules_python//python:defs.bzl", "py_library", "py_test", "py_binary")
load("@pip//:requirements.bzl", "requirement")

py_library(
    name = "ml",
    srcs = glob(["src/**/*.py"]),
    deps = [
        requirement("numpy"),
        requirement("pandas"),
        requirement("scikit-learn"),
        "//libs/utils:utils_py",
    ],
    visibility = ["//visibility:public"],
)

py_test(
    name = "ml_test",
    srcs = glob(["tests/**/*.py"]),
    deps = [
        ":ml",
        requirement("pytest"),
    ],
    size = "medium",
    timeout = "moderate",
)

py_binary(
    name = "train",
    srcs = ["train.py"],
    deps = [":ml"],
    data = ["//data:training_data"],
)
```

## Performance Optimization

```bash
# Profile build
bazel build //... --profile=profile.json
bazel analyze-profile profile.json

# Identify slow actions
bazel build //... --execution_log_json_file=exec_log.json

# Memory profiling
bazel build //... --memory_profile=memory.json

# Skip analysis cache
bazel build //... --notrack_incremental_state
```

## Best Practices

### Do's
- **Use fine-grained targets** - Better caching
- **Pin dependencies** - Reproducible builds
- **Enable remote caching** - Share build artifacts
- **Use visibility wisely** - Enforce architecture
- **Write BUILD files per directory** - Standard convention

### Don'ts
- **Don't use glob for deps** - Explicit is better
- **Don't commit bazel-* dirs** - Add to .gitignore
- **Don't skip WORKSPACE setup** - Foundation of build
- **Don't ignore build warnings** - Technical debt

## Resources

- [Bazel Documentation](https://bazel.build/docs)
- [Bazel Remote Execution](https://bazel.build/docs/remote-execution)
- [rules_js](https://github.com/aspect-build/rules_js)
