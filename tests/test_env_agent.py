from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def test_env_agent_no_process_substitution():
    """Assert that env-agent.sh does not contain process substitutions like '2> >(tee ...)'
    which can leak file descriptors to background daemons (like Bazel server) and cause hangs.
    """
    env_agent_path = ROOT / "env-agent.sh"
    assert env_agent_path.exists(), (
        f"env-agent.sh file does not exist at {env_agent_path}"
    )

    content = env_agent_path.read_text()
    # Check for the process substitution leak pattern in bazel query redirects
    assert "2> >(tee" not in content, (
        "env-agent.sh contains '2> >(tee', which leaks file descriptors to background daemons "
        "spawned by Bazel, causing commands to hang indefinitely on a cold cache."
    )
