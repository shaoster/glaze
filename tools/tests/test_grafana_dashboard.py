from __future__ import annotations

import io
import json
from copy import deepcopy
from typing import Any
from urllib.request import Request

import pytest

from tools import grafana_dashboard as dashboard


def _panel_map(payload: dict[str, Any]) -> dict[int, dict[str, Any]]:
    panels = payload["panels"]
    assert isinstance(panels, list)
    return {panel["id"]: panel for panel in panels}


def test_validate_dashboard_builds_expected_dashboard() -> None:
    dashboard.validate_dashboard()


def test_dashboard_json_contains_expected_sdk_fields() -> None:
    payload = dashboard.dashboard_json()
    panels = _panel_map(payload)

    assert payload["title"] == "Glaze Application Observability"
    assert payload["uid"] == "glaze-app-summary"
    assert payload["tags"] == ["glaze", "production"]
    assert payload["refresh"] == "10s"
    assert payload["timezone"] == "browser"
    assert payload["time"] == {"from": "now-1h", "to": "now"}

    assert panels[1]["title"] == "Total Requests (1h)"
    assert panels[1]["targets"][0]["expr"] == (
        'sum(increase(http_server_duration_milliseconds_count{service_name="glaze"}[$__range]))'
    )
    assert panels[1]["targets"][0]["instant"] is True

    assert panels[5]["type"] == "timeseries"
    assert panels[5]["targets"][0]["range"] is True

    assert panels[7]["targets"][0]["queryType"] == "range"
    assert panels[8]["targets"][0]["queryType"] == "traceql"
    assert panels[8]["targets"][0]["limit"] == 30
    assert panels[8]["targets"][0]["query"] == '{resource.service.name="glaze" && (duration > 500ms || status=error)}'

    assert panels[13]["transformations"][0]["id"] == "filterFieldsByName"
    assert panels[13]["transformations"][1]["options"]["renameByName"]["remaining"] == "Headroom"


def test_publish_dashboard_uses_generated_dashboard_and_live_metadata(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    live_payload = {
        "dashboard": {
            "id": 123,
            "editable": False,
            "schemaVersion": 42,
            "version": 17,
        },
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

    dashboard.publish_dashboard(dashboard.DEFAULT_GRAFANA_URL, "secret-token")

    assert len(requests) == 1
    body = json.loads(requests[0].data.decode("utf-8"))
    published = body["dashboard"]

    assert body["folderUid"] == "custom-folder"
    assert body["overwrite"] is True
    assert body["message"] == "Publish glaze-app-summary dashboard"
    assert published["id"] == 123
    assert published["editable"] is False
    assert published["schemaVersion"] == 42
    assert published["version"] == 17
    assert published["title"] == "Glaze Application Observability"
    assert published["uid"] == "glaze-app-summary"
    published_panels = _panel_map(published)
    assert published_panels[13]["transformations"][1]["options"]["renameByName"]["remaining"] == "Headroom"


def test_main_validate_prints_ok(capsys: pytest.CaptureFixture[str]) -> None:
    exit_code = dashboard.main(["validate"])

    assert exit_code == 0
    assert capsys.readouterr().out.strip() == "Grafana dashboard: OK"
