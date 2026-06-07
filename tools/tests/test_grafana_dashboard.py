from __future__ import annotations

import io
import json
from copy import deepcopy
from pathlib import Path
from typing import Any
from urllib.request import Request

import pytest
import yaml

from tools import grafana_dashboard as dashboard


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[2]


def _dashboard_path() -> Path:
    return _repo_root() / "grafana/dashboards/glaze-app-summary.yaml"


def test_load_dashboard_accepts_comments(tmp_path: Path) -> None:
    source = _dashboard_path().read_text(encoding="utf-8")
    path = tmp_path / "glaze-app-summary.yaml"
    path.write_text("# extra comment\n" + source, encoding="utf-8")

    loaded = dashboard.load_dashboard(path)

    assert loaded["title"] == "Glaze Application Observability"
    assert loaded["panels"][0]["title"] == "Total Requests (1h)"


def test_load_dashboard_rejects_invalid_yaml(tmp_path: Path) -> None:
    path = tmp_path / "broken.yaml"
    path.write_text("title: [unterminated\n", encoding="utf-8")

    with pytest.raises(dashboard.ValidationError, match="invalid YAML"):
        dashboard.load_dashboard(path)


def test_validate_dashboard_accepts_repo_config() -> None:
    dashboard.validate_dashboard(_dashboard_path())


def test_validate_dashboard_rejects_secret_markers(tmp_path: Path) -> None:
    config = yaml.safe_load(_dashboard_path().read_text(encoding="utf-8"))
    config["panels"][0]["description"] = "Bearer token leaked"
    path = tmp_path / "broken.yaml"
    path.write_text(yaml.safe_dump(config, sort_keys=False), encoding="utf-8")

    with pytest.raises(dashboard.ValidationError, match="secret-bearing string detected"):
        dashboard.validate_dashboard(path)


def test_publish_dashboard_merges_overlay_and_uses_live_folder_uid(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    config = yaml.safe_load(_dashboard_path().read_text(encoding="utf-8"))
    config["description"] = "Updated dashboard description"
    config["panels"][0]["description"] = "Updated request volume description"
    overlay_path = tmp_path / "overlay.yaml"
    overlay_path.write_text(yaml.safe_dump(config, sort_keys=False), encoding="utf-8")

    live_dashboard: dict[str, Any] = {
        "id": 123,
        "uid": "glaze-app-summary",
        "title": "Old title",
        "editable": False,
        "panels": [
            {
                "id": 1,
                "title": "Old panel title",
                "type": "stat",
                "fieldConfig": {"defaults": {"unit": "short"}},
                "targets": [],
            }
        ],
    }
    live_payload = {
        "dashboard": live_dashboard,
        "meta": {"folderUid": "custom-folder"},
    }

    requests: list[Request] = []

    def fake_fetch_dashboard(url: str, api_token: str, uid: str) -> dict[str, Any]:
        assert url == dashboard.DEFAULT_GRAFANA_URL
        assert api_token == "secret-token"
        assert uid == "glaze-app-summary"
        return deepcopy(live_payload)

    class FakeResponse(io.BytesIO):
        def __enter__(self) -> "FakeResponse":
            return self

        def __exit__(self, exc_type, exc, tb) -> None:
            self.close()

    def fake_urlopen(request: Request) -> FakeResponse:
        requests.append(request)
        return FakeResponse(b'{"status":"success"}')

    monkeypatch.setattr(dashboard, "fetch_dashboard", fake_fetch_dashboard)
    monkeypatch.setattr(dashboard.urllib.request, "urlopen", fake_urlopen)

    dashboard.publish_dashboard(overlay_path, dashboard.DEFAULT_GRAFANA_URL, "secret-token")

    assert len(requests) == 1
    body = json.loads(requests[0].data.decode("utf-8"))
    published = body["dashboard"]

    assert body["folderUid"] == "custom-folder"
    assert body["overwrite"] is True
    assert published["id"] == 123
    assert published["description"] == "Updated dashboard description"
    assert published["editable"] is False
    assert published["panels"][0]["description"] == "Updated request volume description"
    assert published["panels"][0]["fieldConfig"]["defaults"]["unit"] == "short"


def test_main_validate_prints_ok(capsys: pytest.CaptureFixture[str]) -> None:
    exit_code = dashboard.main(["validate", str(_dashboard_path())])

    assert exit_code == 0
    assert capsys.readouterr().out.strip() == f"{_dashboard_path()}: OK"
