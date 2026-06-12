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


def _assert_grid_pos(panel: dict[str, Any], expected: dict[str, int]) -> None:
    assert panel["gridPos"] == expected


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

    _assert_grid_pos(panels[1], {"h": 4, "w": 3, "x": 0, "y": 0})
    _assert_grid_pos(panels[2], {"h": 4, "w": 3, "x": 3, "y": 0})
    _assert_grid_pos(panels[5], {"h": 8, "w": 6, "x": 6, "y": 0})
    _assert_grid_pos(panels[9], {"h": 5, "w": 5, "x": 12, "y": 0})
    _assert_grid_pos(panels[10], {"h": 5, "w": 5, "x": 17, "y": 0})
    _assert_grid_pos(panels[3], {"h": 4, "w": 3, "x": 0, "y": 4})
    _assert_grid_pos(panels[4], {"h": 4, "w": 3, "x": 3, "y": 4})
    _assert_grid_pos(panels[16], {"h": 5, "w": 5, "x": 17, "y": 5})
    _assert_grid_pos(panels[7], {"h": 7, "w": 12, "x": 0, "y": 8})
    _assert_grid_pos(panels[15], {"h": 5, "w": 5, "x": 12, "y": 10})
    _assert_grid_pos(panels[17], {"h": 5, "w": 5, "x": 17, "y": 10})
    _assert_grid_pos(panels[8], {"h": 8, "w": 12, "x": 0, "y": 15})
    _assert_grid_pos(panels[18], {"h": 5, "w": 5, "x": 12, "y": 15})
    _assert_grid_pos(panels[19], {"h": 5, "w": 5, "x": 17, "y": 15})
    _assert_grid_pos(panels[20], {"h": 5, "w": 5, "x": 12, "y": 20})
    _assert_grid_pos(panels[14], {"h": 8, "w": 12, "x": 0, "y": 23})

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
    assert (
        panels[8]["targets"][0]["query"]
        == '{trace:rootService="glaze" && (duration > 500ms || status=error)}'
    )

    # The Cloudinary quota panel (id 13) was retired with the move to R2.
    assert 13 not in panels
    assert panels[14]["targets"][0]["queryType"] == "traceql"

    # R2 panels
    assert panels[18]["title"] == "R2 Storage"
    assert panels[18]["type"] == "piechart"
    assert panels[18]["targets"][0]["type"] == "json"
    assert panels[18]["targets"][0]["source"] == "url"
    assert "payloadSize" in panels[18]["targets"][0]["url_options"]["data"]

    assert panels[19]["title"] == "R2 Class A Operations"
    assert panels[19]["type"] == "piechart"
    assert "PutObject" in panels[19]["targets"][0]["url_options"]["data"]

    assert panels[20]["title"] == "R2 Class B Operations"
    assert panels[20]["type"] == "piechart"
    assert "GetObject" in panels[20]["targets"][0]["url_options"]["data"]


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
    assert published_panels[14]["targets"][0]["queryType"] == "traceql"
    assert published_panels[18]["title"] == "R2 Storage"
    assert published_panels[19]["title"] == "R2 Class A Operations"
    assert published_panels[20]["title"] == "R2 Class B Operations"


def test_main_validate_prints_ok(capsys: pytest.CaptureFixture[str]) -> None:
    exit_code = dashboard.main(["validate"])

    assert exit_code == 0
    assert capsys.readouterr().out.strip() == "Grafana dashboard: OK"
