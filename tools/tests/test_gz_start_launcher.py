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


def test_choose_port_falls_back_when_existing_port_is_busy(monkeypatch, tmp_path: Path) -> None:
    port_file = tmp_path / "backend.port"
    port_file.write_text("8088\n", encoding="utf-8")

    monkeypatch.setattr(launcher, "port_is_free", lambda port: False)
    monkeypatch.setattr(launcher, "find_free_port", lambda start: 9090)

    assert launcher.choose_port(port_file, 8080) == 9090


def test_backend_is_ready_uses_health_checks(monkeypatch) -> None:
    monkeypatch.setattr(
        launcher,
        "backend_ready_payload",
        lambda port: {"checks": {"database": True, "async_tasks": True, "migrations": False}},
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
