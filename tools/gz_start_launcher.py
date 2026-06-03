"""Hermetic launcher for Glaze development servers.

This script is intended to be invoked via `bazel run //tools:gz_start_launcher`.
It performs the full dev-stack orchestration in one place:

* load repo-local env files when present
* choose backend/web ports
* start the backend and web dev servers as detached process groups
* wait for backend readiness
* open the browser

`gz_stop` remains responsible for terminating the stored process groups.
"""

from __future__ import annotations

import ast
import json
import os
import platform
import re
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable
from urllib.error import HTTPError

BACKEND_MIN_PORT = 8080
WEB_MIN_PORT = 5173


@dataclass(frozen=True)
class Roots:
    workspace: Path
    shared: Path


def _git_output(args: list[str], cwd: Path) -> str | None:
    try:
        result = subprocess.run(
            ["git", "-C", str(cwd), *args],
            check=True,
            capture_output=True,
            text=True,
        )
    except (FileNotFoundError, subprocess.CalledProcessError):
        return None
    return result.stdout.strip() or None


def detect_roots() -> Roots:
    cwd = Path(os.environ.get("BUILD_WORKSPACE_DIRECTORY") or os.getcwd()).resolve()
    workspace = Path(
        _git_output(["rev-parse", "--show-toplevel"], cwd) or str(cwd)
    ).resolve()
    git_common_dir = _git_output(
        ["rev-parse", "--path-format=absolute", "--git-common-dir"],
        workspace,
    )
    if git_common_dir:
        shared = Path(git_common_dir).resolve().parent
    else:
        shared = workspace
    return Roots(workspace=workspace, shared=shared)


def preferred_root_for(roots: Roots, relative_path: str) -> Path:
    workspace_candidate = roots.workspace / relative_path
    if workspace_candidate.exists():
        return roots.workspace
    shared_candidate = roots.shared / relative_path
    if roots.shared != roots.workspace and shared_candidate.exists():
        return roots.shared
    return roots.workspace


def load_env_file(path: Path, env: dict[str, str]) -> None:
    if not path.is_file():
        return

    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line.removeprefix("export ").lstrip()
        if "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        if not key:
            continue

        value = value.strip()
        if not value:
            env[key] = ""
            continue

        if value[0] in {'"', "'"}:
            try:
                env[key] = ast.literal_eval(value)
                continue
            except (SyntaxError, ValueError):
                pass

        if " #" in value:
            value = value.split(" #", 1)[0].rstrip()
        env[key] = value


def load_repo_env(roots: Roots) -> dict[str, str]:
    env = os.environ.copy()
    env["GLAZE_ROOT"] = str(roots.workspace)
    env["GLAZE_SHARED_ROOT"] = str(roots.shared)

    for relative_path in [".env.local", "web/.env.local", "mobile/.env.local"]:
        root = preferred_root_for(roots, relative_path)
        load_env_file(root / relative_path, env)

    return env


def port_is_free(port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.2)
        return sock.connect_ex(("127.0.0.1", port)) != 0


def find_free_port(start_port: int) -> int:
    port = start_port
    while port <= 65535:
        if port_is_free(port):
            return port
        port += 1
    raise RuntimeError(f"no free port found at or above {start_port}")


def read_int_file(path: Path) -> int | None:
    try:
        return int(path.read_text(encoding="utf-8").strip())
    except (FileNotFoundError, ValueError):
        return None


def process_is_running(pid: int) -> bool:
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def process_group_kwargs() -> dict[str, object]:
    if os.name == "nt":
        creationflags = 0
        for attr in ("CREATE_NEW_PROCESS_GROUP", "DETACHED_PROCESS"):
            creationflags |= int(getattr(subprocess, attr, 0))
        return {"creationflags": creationflags}
    return {"start_new_session": True}


def process_group_is_running(pgid: int) -> bool:
    if os.name == "nt":
        return process_is_running(pgid)
    try:
        os.killpg(pgid, 0)
    except ProcessLookupError:
        return False
    except PermissionError:
        return True
    return True


def rotate_log(log_path: Path) -> None:
    if not log_path.exists():
        return
    rotated = log_path.with_name(
        f"{log_path.stem}.{datetime.now().strftime('%Y%m%dT%H%M%S')}{log_path.suffix}"
    )
    log_path.rename(rotated)


def write_text(path: Path, value: str) -> None:
    path.write_text(f"{value}\n", encoding="utf-8")


def choose_port(port_file: Path, minimum: int) -> int:
    existing = read_int_file(port_file)
    if existing is not None and port_is_free(existing):
        return existing
    return find_free_port(minimum)


def port_from_log(log_path: Path) -> int | None:
    if not log_path.is_file():
        return None

    pattern = re.compile(r"(?:127\.0\.0\.1|localhost):(\d+)")
    for line in reversed(
        log_path.read_text(encoding="utf-8", errors="ignore").splitlines()
    ):
        match = pattern.search(line)
        if match:
            return int(match.group(1))
    return None


def bazel_binary_path(roots: Roots, relative_path: str) -> Path:
    candidate = roots.workspace / "bazel-bin" / relative_path
    if os.name == "nt":
        windows_candidate = candidate.with_suffix(".exe")
        if windows_candidate.exists():
            return windows_candidate
    if candidate.exists():
        return candidate
    raise FileNotFoundError(
        "could not find bazel-built executable at "
        f"{candidate} (run the matching Bazel target first if needed)"
    )


def manage_script_path(roots: Roots) -> Path:
    return roots.workspace / "manage.py"


def web_executable_path(roots: Roots) -> Path:
    return bazel_binary_path(roots, "web/dev_server_/dev_server")


def ensure_local_web_node_modules(roots: Roots) -> None:
    if roots.workspace == roots.shared:
        return

    worktree_nm = roots.workspace / "web" / "node_modules"
    if worktree_nm.is_symlink():
        worktree_nm.unlink()

    if worktree_nm.exists():
        return

    print("web: installing local node_modules via npm install...")
    subprocess.run(["npm", "install"], cwd=str(roots.workspace / "web"), check=True)


def sync_generated_types(roots: Roots, env: dict[str, str]) -> None:
    print("web: regenerating TypeScript types...")
    generated_types_env = env.copy()
    if not generated_types_env.get("BAZEL_BINDIR"):
        generated_types_env["BAZEL_BINDIR"] = "."
    subprocess.run(
        ["bazel", "build", "//web:generated_types"],
        cwd=str(roots.workspace),
        env=generated_types_env,
        check=True,
    )

    source_dir = roots.workspace / "web" / "src" / "util"
    source_dir.mkdir(parents=True, exist_ok=True)
    generated_dir = roots.workspace / "bazel-bin" / "web" / "src" / "util"
    for filename in ("generated-types.ts", "types.ts"):
        source_path = source_dir / filename
        target_path = generated_dir / filename
        if source_path.exists() or source_path.is_symlink():
            source_path.unlink()
        source_path.symlink_to(target_path)
        print(f"Generated: {source_path} -> {target_path}")


def backend_ready_payload(port: int) -> dict[str, object]:
    url = f"http://127.0.0.1:{port}/api/health/ready/"
    try:
        with urllib.request.urlopen(url, timeout=1) as response:
            payload = json.loads(response.read().decode("utf-8"))
            payload["_http_status"] = response.status
            return payload
    except HTTPError as error:
        payload = json.loads(error.read().decode("utf-8"))
        payload["_http_status"] = error.code
        return payload


def backend_is_ready(port: int) -> bool:
    payload = backend_ready_payload(port)
    checks = payload.get("checks", {})
    return bool(checks.get("database")) and bool(checks.get("async_tasks"))


def wait_for_backend(port: int, timeout_seconds: float = 60.0) -> None:
    deadline = time.monotonic() + timeout_seconds
    last_payload: dict[str, object] | None = None
    sys.stdout.write("Waiting for backend to be ready")
    sys.stdout.flush()
    while True:
        try:
            payload = backend_ready_payload(port)
            last_payload = payload
            checks = payload.get("checks", {})
            database_ready = bool(checks.get("database"))
            async_tasks_ready = bool(checks.get("async_tasks"))
            migrations_ready = bool(checks.get("migrations"))
            if database_ready and async_tasks_ready:
                if not migrations_ready:
                    sys.stdout.write(
                        " warning: migrations check is still false; continuing because database and async tasks are ready.\n"
                    )
                else:
                    sys.stdout.write(" ready.\n")
                sys.stdout.flush()
                return
            if payload.get("status") == "ready":
                sys.stdout.write(" ready.\n")
                sys.stdout.flush()
                return
        except Exception:
            pass

        if time.monotonic() >= deadline:
            sys.stdout.write(" timed out!\n")
            if last_payload is not None:
                sys.stdout.write(
                    f"Last readiness payload: {json.dumps(last_payload, sort_keys=True)}\n"
                )
            sys.stdout.flush()
            raise TimeoutError(f"backend did not become ready on port {port}")

        sys.stdout.write(".")
        sys.stdout.flush()
        time.sleep(0.5)


def wait_for_web(port: int, timeout_seconds: float = 60.0) -> None:
    deadline = time.monotonic() + timeout_seconds
    loopback_hosts = ("localhost", "127.0.0.1", "::1")
    sys.stdout.write("Waiting for web to be ready")
    sys.stdout.flush()
    while True:
        for host in loopback_hosts:
            try:
                # Match the browser URL (`http://localhost:<port>`) while also
                # trying the explicit loopback addresses. GitHub-hosted runners
                # can expose the dev server on a different loopback family than
                # the one the browser prefers.
                with socket.create_connection((host, port), timeout=1):
                    sys.stdout.write(" ready.\n")
                    sys.stdout.flush()
                    return
            except Exception:
                pass

        if time.monotonic() >= deadline:
            sys.stdout.write(" timed out!\n")
            sys.stdout.flush()
            raise TimeoutError(f"web did not become ready on port {port}")

        sys.stdout.write(".")
        sys.stdout.flush()
        time.sleep(0.5)


def open_browser(url: str) -> None:
    if os.environ.get("CI") == "1" or os.environ.get("GLAZE_NO_BROWSER") == "1":
        return

    candidates: list[list[str]] = []
    if sys.platform == "darwin":
        candidates.append(["open", url])
    elif os.name == "nt":
        candidates.append(["cmd", "/c", "start", "", url])
    else:
        if (
            os.environ.get("WSL_DISTRO_NAME")
            or "microsoft" in platform.release().lower()
        ):
            if shutil_which("wslview"):
                candidates.append(["wslview", url])
        candidates.append(["xdg-open", url])

    if webbrowser.open(url, new=1, autoraise=True):
        return

    for command in candidates:
        try:
            subprocess.Popen(
                command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
            return
        except FileNotFoundError:
            continue


def dump_log_tail(log_path: Path, *, label: str, max_lines: int = 80) -> None:
    if not log_path.is_file():
        print(f"{label}: log file missing: {log_path}")
        return

    lines = log_path.read_text(encoding="utf-8", errors="ignore").splitlines()
    tail = lines[-max_lines:]
    print(f"{label}: showing last {len(tail)} lines from {log_path}")
    for line in tail:
        print(f"{label}: {line}")


def shutil_which(command: str) -> str | None:
    from shutil import which

    return which(command)


def launch_child(
    argv: list[str],
    *,
    cwd: Path,
    env: dict[str, str],
    log_path: Path,
) -> subprocess.Popen[str]:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log_file = log_path.open("a", encoding="utf-8")
    popen_kwargs: dict[str, object] = {
        "cwd": str(cwd),
        "env": env,
        "stdout": log_file,
        "stderr": subprocess.STDOUT,
        **process_group_kwargs(),
    }
    try:
        return subprocess.Popen(argv, text=True, **popen_kwargs)
    except Exception:
        log_file.close()
        raise


def terminate_process_group(pid: int, timeout_seconds: float = 3.0) -> None:
    if os.name == "nt":
        subprocess.run(["taskkill", "/T", "/F", "/PID", str(pid)], check=False)
        return
    if not process_group_is_running(pid):
        return
    try:
        os.killpg(pid, signal.SIGTERM)
    except (ProcessLookupError, PermissionError):
        return
    deadline = time.monotonic() + timeout_seconds
    while time.monotonic() < deadline:
        if not process_group_is_running(pid):
            return
        time.sleep(0.1)
    try:
        os.killpg(pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        return
    deadline = time.monotonic() + 1.0
    while time.monotonic() < deadline:
        if not process_group_is_running(pid):
            return
        time.sleep(0.05)


def kill_process_group(pid: int) -> None:
    terminate_process_group(pid)


def ensure_running(pidfile: Path) -> tuple[int | None, bool]:
    pid = read_int_file(pidfile)
    if pid is None:
        return None, False
    return pid, process_is_running(pid)


def start_backend(
    roots: Roots,
    env: dict[str, str],
    pidfile: Path,
    portfile: Path,
    log_path: Path,
    backend_port: int,
    web_port: int,
) -> int:
    pid, running = ensure_running(pidfile)
    if running and pid is not None:
        print(f"backend: already running (PID {pid})")
        existing_port = (
            read_int_file(portfile) or port_from_log(log_path) or backend_port
        )
        write_text(portfile, str(existing_port))
        return pid

    rotate_log(log_path)
    write_text(portfile, str(backend_port))

    backend_env = env.copy()
    backend_env["APP_ORIGIN"] = f"http://localhost:{web_port}"

    # In a worktree, prefer the shared checkout's db.sqlite3 so dev data (seeded
    # pieces, users) carries over without a fresh bootstrap. Falls back to a
    # worktree-local db if DATABASE_URL is already set in the environment (explicit
    # override) or if no shared db exists yet.
    if roots.workspace != roots.shared and not backend_env.get("DATABASE_URL"):
        shared_db = roots.shared / "db.sqlite3"
        if shared_db.exists():
            backend_env["DATABASE_URL"] = f"sqlite:///{shared_db}"
            print(f"backend: using shared db at {shared_db}")

    print(f"backend: starting on :{backend_port} ...")
    _db_url = backend_env.get("DATABASE_URL", "")
    db_path = (
        Path(_db_url.removeprefix("sqlite:///"))
        if _db_url.startswith("sqlite:///")
        else roots.workspace / "db.sqlite3"
    )

    def run_migrate(extra_args: list[str]) -> None:
        migrate_cmd = [
            sys.executable,
            str(manage_script_path(roots)),
            "migrate",
            *extra_args,
        ]
        subprocess.run(
            migrate_cmd,
            cwd=str(roots.workspace),
            env=backend_env,
            check=True,
        )

    try:
        if db_path.exists():
            run_migrate(["--fake-initial", "--no-input"])
        else:
            run_migrate(["--no-input"])
    except subprocess.CalledProcessError:
        if not db_path.exists():
            raise
        backup_path = db_path.with_name(
            f"{db_path.stem}.bak.{datetime.now().strftime('%Y%m%dT%H%M%S')}{db_path.suffix}"
        )
        db_path.replace(backup_path)
        print(f"backend: reset inconsistent SQLite database -> {backup_path.name}")
        run_migrate(["--no-input"])

    load_public_library = [
        sys.executable,
        str(manage_script_path(roots)),
        "load_public_library",
        "--skip-if-missing",
    ]
    subprocess.run(
        load_public_library, cwd=str(roots.workspace), env=backend_env, check=True
    )

    backend: subprocess.Popen[str] | None = None
    try:
        backend = launch_child(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "backend.asgi:application",
                "--host",
                "127.0.0.1",
                "--port",
                str(backend_port),
                "--reload",
            ],
            cwd=roots.workspace,
            env=backend_env,
            log_path=log_path,
        )
        write_text(pidfile, str(backend.pid))
        print(f"backend: started (PID {backend.pid}) — logs: {log_path}")
        return backend.pid
    except Exception:
        if backend is not None:
            terminate_process_group(backend.pid)
        raise


def start_web(
    roots: Roots,
    env: dict[str, str],
    pidfile: Path,
    portfile: Path,
    log_path: Path,
    backend_port: int,
    web_port: int,
) -> int:
    pid, running = ensure_running(pidfile)
    if running and pid is not None:
        print(f"web: already running (PID {pid})")
        existing_port = read_int_file(portfile) or port_from_log(log_path) or web_port
        write_text(portfile, str(existing_port))
        return pid

    rotate_log(log_path)
    write_text(portfile, str(web_port))

    web_env = env.copy()
    web_env["BACKEND_PORT"] = str(backend_port)

    # `bazel run` sets BAZEL_BINDIR, but `gz_start` launches the web `js_binary`
    # from the execroot after the launcher has exited. Make the environment look
    # like a non-build action so aspect_rules_js can resolve paths consistently
    # on both Linux and macOS runners.
    if not web_env.get("BAZEL_BINDIR"):
        web_env["BAZEL_BINDIR"] = "."

    # Worktrees must keep their own npm install so Vite/Babel resolve package
    # paths against the active checkout rather than borrowing another worktree's
    # node_modules tree through a symlink.
    ensure_local_web_node_modules(roots)

    print(f"web: starting on :{web_port} ...")
    web_binary = web_executable_path(roots)
    web: subprocess.Popen[str] | None = None
    try:
        web = launch_child(
            [str(web_binary), "--port", str(web_port), "--strictPort"],
            cwd=roots.workspace,
            env=web_env,
            log_path=log_path,
        )
        write_text(pidfile, str(web.pid))
        print(f"web: started (PID {web.pid}) — logs: {log_path}")
        return web.pid
    except Exception:
        if web is not None:
            terminate_process_group(web.pid)
        raise


def start_stack(no_browser: bool = False) -> int:
    roots = detect_roots()
    pid_dir = roots.workspace / ".dev-pids"
    log_dir = roots.workspace / ".dev-logs"
    pid_dir.mkdir(parents=True, exist_ok=True)
    log_dir.mkdir(parents=True, exist_ok=True)

    env = load_repo_env(roots)

    backend_pidfile = pid_dir / "backend.pid"
    backend_portfile = pid_dir / "backend.port"
    backend_log = log_dir / "backend.log"
    web_pidfile = pid_dir / "web.pid"
    web_portfile = pid_dir / "web.port"
    web_log = log_dir / "web.log"

    backend_port = choose_port(backend_portfile, BACKEND_MIN_PORT)
    web_port = choose_port(web_portfile, WEB_MIN_PORT)

    backend_started = False
    web_started = False

    try:
        pid, running = ensure_running(backend_pidfile)
        if not (running and pid is not None):
            start_backend(
                roots,
                env,
                backend_pidfile,
                backend_portfile,
                backend_log,
                backend_port,
                web_port,
            )
            backend_started = True
        else:
            print(f"backend: already running (PID {pid})")
            backend_port = (
                read_int_file(backend_portfile)
                or port_from_log(backend_log)
                or backend_port
            )

        wait_for_backend(backend_port)

        sync_generated_types(roots, env)

        pid, running = ensure_running(web_pidfile)
        if not (running and pid is not None):
            start_web(
                roots,
                env,
                web_pidfile,
                web_portfile,
                web_log,
                backend_port,
                web_port,
            )
            web_started = True
        else:
            print(f"web: already running (PID {pid})")
            web_port = read_int_file(web_portfile) or port_from_log(web_log) or web_port

        try:
            wait_for_web(web_port)
        except Exception:
            dump_log_tail(web_log, label="web")
            raise

        url = f"http://localhost:{web_port}"
        if not no_browser:
            print(f"Opening {url}")
            open_browser(url)

        print("Servers running — use 'gz_stop' to stop, 'gz_logs' to tail output.")
        return 0
    except Exception:
        if backend_started:
            pid, running = ensure_running(backend_pidfile)
            if running and pid is not None:
                terminate_process_group(pid)
        if web_started:
            pid, running = ensure_running(web_pidfile)
            if running and pid is not None:
                terminate_process_group(pid)
        raise


def main(argv: Iterable[str] | None = None) -> int:
    args = list(argv or sys.argv[1:])
    no_browser = False
    if args:
        if args == ["--no-browser"]:
            no_browser = True
        else:
            print("Usage: gz_start_launcher [--no-browser]", file=sys.stderr)
            return 2

    return start_stack(no_browser=no_browser)


if __name__ == "__main__":
    raise SystemExit(main())
