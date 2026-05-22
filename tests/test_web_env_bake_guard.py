from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
WEB_DIR = REPO_ROOT / "web"
CI_YML = REPO_ROOT / ".github" / "workflows" / "ci.yml"


def test_web_build_does_not_bake_env_files():
    build_text = (WEB_DIR / "BUILD.bazel").read_text()
    assert ".env.*" not in build_text

    vite_config_text = (WEB_DIR / "vite.config.ts").read_text()
    assert "loadEnv" not in vite_config_text
    assert "process.env.GOOGLE_OAUTH_CLIENT_ID" in vite_config_text

    gitignore_text = (WEB_DIR / ".gitignore").read_text()
    assert "/.env*" in gitignore_text

    assert not (WEB_DIR / ".env.example").exists()


def test_ci_does_not_write_env_file_for_image_build():
    # Ensure the CI image step exports GOOGLE_OAUTH_CLIENT_ID via env: rather
    # than writing a .env file that could be accidentally baked into the image.
    ci_text = CI_YML.read_text()
    assert "Write Vite env file" not in ci_text
    assert "GOOGLE_OAUTH_CLIENT_ID: ${{ vars.GOOGLE_OAUTH_CLIENT_ID }}" in ci_text
