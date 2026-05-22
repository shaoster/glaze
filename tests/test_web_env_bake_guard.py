from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
WEB_DIR = REPO_ROOT / "web"


def test_web_build_does_not_bake_env_files():
    build_text = (WEB_DIR / "BUILD.bazel").read_text()
    assert ".env.*" not in build_text

    vite_config_text = (WEB_DIR / "vite.config.ts").read_text()
    assert "loadEnv" not in vite_config_text
    assert "process.env.GOOGLE_OAUTH_CLIENT_ID" in vite_config_text

    gitignore_text = (WEB_DIR / ".gitignore").read_text()
    assert "/.env*" in gitignore_text

    assert not (WEB_DIR / ".env.example").exists()
