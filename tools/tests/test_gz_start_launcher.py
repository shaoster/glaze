from __future__ import annotations

import signal
from pathlib import Path

from tools import gz_start_launcher as launcher


def test_load_env_file_parses_export_and_quotes(tmp_path: Path) -> None:
    env_file = tmp_path / ".env.local"
    env_file.write_text(
        """
        # comment
        export SIMPLE=value
        QUOTED=\"hello world\"
        SINGLE='still works'
        TRAILING=keep-this # comment
        EMPTY=
        """.strip()
        + "\n",
        encoding="utf-8",
    )

    env: dict[str, str] = {}
    launcher.load_env_file(env_file, env)

    assert env["SIMPLE"] == "value"
    assert env["QUOTED"] == "hello world"
    assert env["SINGLE"] == "still works"
    assert env["TRAILING"] == "keep-this"
    assert env["EMPTY"] == ""


def test_port_from_log_reads_latest_port(tmp_path: Path) -> None:
    log_file = tmp_path / "backend.log"
    log_file.write_text(
        "\n".join(
            [
                "INFO: Uvicorn running on http://127.0.0.1:8080",
                "Local: http://localhost:5173/",
                "INFO: Uvicorn running on http://127.0.0.1:8081",
            ]
        ),
        encoding="utf-8",
    )

    assert launcher.port_from_log(log_file) == 8081


def test_web_executable_path_prefers_bazel_bin(tmp_path: Path) -> None:
    roots = launcher.Roots(workspace=tmp_path, shared=tmp_path)
    web_exec = tmp_path / "bazel-bin" / "web" / "dev_server_" / "dev_server"
    web_exec.parent.mkdir(parents=True)
    web_exec.write_text("#!/bin/sh\n", encoding="utf-8")

    assert launcher.web_executable_path(roots) == web_exec


def test_detect_roots_uses_git_common_dir_for_shared_checkout(
    monkeypatch, tmp_path: Path
) -> None:
    workspace = tmp_path / "repo" / ".agent-worktrees" / "codex" / "issue-610"
    workspace.mkdir(parents=True)
    common_git = tmp_path / "repo" / ".git"

    monkeypatch.setenv("BUILD_WORKSPACE_DIRECTORY", str(workspace))

    def fake_git_output(args: list[str], cwd: Path) -> str | None:
        if args == ["rev-parse", "--show-toplevel"]:
            return str(workspace)
        if args == ["rev-parse", "--path-format=absolute", "--git-common-dir"]:
            return str(common_git)
        return None

    monkeypatch.setattr(launcher, "_git_output", fake_git_output)

    assert launcher.detect_roots() == launcher.Roots(
        workspace=workspace,
        shared=tmp_path / "repo",
    )


def test_preferred_root_for_falls_back_to_shared_worktree_file(tmp_path: Path) -> None:
    workspace = tmp_path / "repo" / ".agent-worktrees" / "codex" / "issue-610"
    shared = tmp_path / "repo"
    workspace.mkdir(parents=True)
    (shared / ".env.local").write_text("CLOUDINARY_CLOUD_NAME=demo\n", encoding="utf-8")

    root = launcher.preferred_root_for(
        launcher.Roots(workspace=workspace, shared=shared),
        ".env.local",
    )

    assert root == shared


def test_find_free_port_returns_first_available(monkeypatch) -> None:
    monkeypatch.setattr(launcher, "port_is_free", lambda port: port == 8082)

    assert launcher.find_free_port(8080) == 8082


def test_find_free_port_raises_when_none_available(monkeypatch) -> None:
    monkeypatch.setattr(launcher, "port_is_free", lambda _: False)

    try:
        launcher.find_free_port(65535)
    except RuntimeError as error:
        assert "no free port found" in str(error)
    else:
        raise AssertionError("find_free_port should fail when no port is free")


def test_read_int_file_returns_none_for_invalid_content(tmp_path: Path) -> None:
    path = tmp_path / "backend.pid"
    path.write_text("not-a-pid\n", encoding="utf-8")

    assert launcher.read_int_file(path) is None


def test_process_group_is_running_treats_permission_error_as_alive(
    monkeypatch,
) -> None:
    if launcher.os.name == "nt":
        return

    def fake_killpg(pgid: int, sig: int) -> None:
        raise PermissionError

    monkeypatch.setattr(launcher.os, "killpg", fake_killpg)

    assert launcher.process_group_is_running(1234) is True


def test_process_group_kwargs_uses_platform_specific_mode() -> None:
    kwargs = launcher.process_group_kwargs()
    if launcher.os.name == "nt":
        assert "creationflags" in kwargs
    else:
        assert kwargs == {"start_new_session": True}


def test_choose_port_reuses_existing_free_port(monkeypatch, tmp_path: Path) -> None:
    port_file = tmp_path / "backend.port"
    port_file.write_text("8088\n", encoding="utf-8")

    monkeypatch.setattr(launcher, "port_is_free", lambda port: port == 8088)

    assert launcher.choose_port(port_file, 8080) == 8088


def test_choose_port_falls_back_when_existing_port_is_busy(
    monkeypatch, tmp_path: Path
) -> None:
    port_file = tmp_path / "backend.port"
    port_file.write_text("8088\n", encoding="utf-8")

    monkeypatch.setattr(launcher, "port_is_free", lambda port: False)
    monkeypatch.setattr(launcher, "find_free_port", lambda start: 9090)

    assert launcher.choose_port(port_file, 8080) == 9090


def test_backend_is_ready_uses_health_checks(monkeypatch) -> None:
    monkeypatch.setattr(
        launcher,
        "backend_ready_payload",
        lambda port: {
            "checks": {"database": True, "async_tasks": True, "migrations": False}
        },
    )

    assert launcher.backend_is_ready(8080) is True


def test_terminate_process_group_stops_gracefully(monkeypatch) -> None:
    if launcher.os.name == "nt":
        return

    signals: list[int] = []
    times = iter([0.0, 0.1])
    alive = {"value": True}

    def fake_killpg(pgid: int, sig: int) -> None:
        signals.append(sig)
        if sig == signal.SIGTERM:
            alive["value"] = False
        if sig == 0 and not alive["value"]:
            raise ProcessLookupError

    monkeypatch.setattr(launcher.os, "killpg", fake_killpg)
    monkeypatch.setattr(launcher.time, "monotonic", lambda: next(times))
    monkeypatch.setattr(launcher.time, "sleep", lambda _: None)

    launcher.terminate_process_group(1234, timeout_seconds=0.5)

    assert signals == [0, signal.SIGTERM, 0]


def test_terminate_process_group_escalates_after_timeout(monkeypatch) -> None:
    if launcher.os.name == "nt":
        return

    signals: list[int] = []
    times = iter([0.0, 1.1, 1.2, 1.3])
    alive = {"value": True}

    def fake_killpg(pgid: int, sig: int) -> None:
        signals.append(sig)
        if sig == signal.SIGKILL:
            alive["value"] = False
        if sig == 0 and not alive["value"]:
            raise ProcessLookupError

    monkeypatch.setattr(launcher.os, "killpg", fake_killpg)
    monkeypatch.setattr(launcher.time, "monotonic", lambda: next(times))
    monkeypatch.setattr(launcher.time, "sleep", lambda _: None)

    launcher.terminate_process_group(1234, timeout_seconds=0.0)

    assert signals == [0, signal.SIGTERM, signal.SIGKILL, 0]


def test_start_web_sets_bazel_bindir_only_on_linux(monkeypatch, tmp_path: Path) -> None:
    roots = launcher.Roots(workspace=tmp_path, shared=tmp_path)
    pidfile = tmp_path / "web.pid"
    portfile = tmp_path / "web.port"
    log_path = tmp_path / "web.log"

    # Mock web executable
    web_bin = tmp_path / "bazel-bin" / "web" / "dev_server_" / "dev_server"
    web_bin.parent.mkdir(parents=True)
    web_bin.touch()

    class MockPopen:
        pid = 9999

    monkeypatch.setattr(launcher, "ensure_running", lambda _: (None, False))
    monkeypatch.setattr(launcher, "rotate_log", lambda _: None)
    monkeypatch.setattr(launcher, "web_executable_path", lambda _: web_bin)

    # 1. Test Linux behavior: BAZEL_BINDIR must be set if missing
    monkeypatch.setattr(launcher.sys, "platform", "linux")
    captured_env_linux: dict[str, str] = {}

    def fake_launch_child_linux(argv, cwd, env, log_path):
        nonlocal captured_env_linux
        captured_env_linux = env
        return MockPopen()

    monkeypatch.setattr(launcher, "launch_child", fake_launch_child_linux)
    launcher.start_web(roots, {}, pidfile, portfile, log_path, 8080, 5173)

    assert captured_env_linux.get("BAZEL_BINDIR") == ".", (
        "On Linux, BAZEL_BINDIR must fallback to '.' if missing to prevent: "
        "FATAL: aspect_rules_js[js_binary]: BAZEL_BINDIR must be set in environment"
    )

    # 1b. Test Linux behavior: BAZEL_BINDIR should be respected if already set
    captured_env_linux_existing: dict[str, str] = {}

    def fake_launch_child_linux_existing(argv, cwd, env, log_path):
        nonlocal captured_env_linux_existing
        captured_env_linux_existing = env
        return MockPopen()

    monkeypatch.setattr(launcher, "launch_child", fake_launch_child_linux_existing)
    launcher.start_web(
        roots,
        {"BAZEL_BINDIR": "bazel-out/k8-fastbuild/bin"},
        pidfile,
        portfile,
        log_path,
        8080,
        5173,
    )

    assert (
        captured_env_linux_existing.get("BAZEL_BINDIR") == "bazel-out/k8-fastbuild/bin"
    ), "BAZEL_BINDIR should be respected if already provided by the environment."

    # 2. Test Mac behavior: BAZEL_BINDIR should NOT be set (not required)
    monkeypatch.setattr(launcher.sys, "platform", "darwin")
    captured_env_mac: dict[str, str] = {}

    def fake_launch_child_mac(argv, cwd, env, log_path):
        nonlocal captured_env_mac
        captured_env_mac = env
        return MockPopen()

    monkeypatch.setattr(launcher, "launch_child", fake_launch_child_mac)
    launcher.start_web(roots, {}, pidfile, portfile, log_path, 8080, 5173)

    assert "BAZEL_BINDIR" not in captured_env_mac, (
        "BAZEL_BINDIR should not be set on macOS as it is not required by aspect_rules_js."
    )
