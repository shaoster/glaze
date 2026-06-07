#!/usr/bin/env python3
"""Validate and publish Glaze Grafana dashboard snapshots.

This script treats `grafana/dashboards/*.snapshot.json` files as overlay
snapshots rather than full Grafana exports. The publish path merges the snapshot
into the live dashboard fetched from Grafana, which keeps untouched panel
settings intact while still versioning the query definitions and layout fields
we care about in git.
"""

from __future__ import annotations

import argparse
import copy
import json
import os
import pathlib
import sys
import urllib.error
import urllib.request
from collections.abc import Iterable, Mapping
from typing import Any

DEFAULT_GRAFANA_URL = "https://shaoster.grafana.net"
DEFAULT_FOLDER_UID = "general"

EXPECTED_DASHBOARD = {
    "uid": "glaze-app-summary",
    "title": "Glaze Application Observability",
    "tags": ["glaze", "production"],
    "refresh": "10s",
    "timezone": "browser",
    "time": {"from": "now-1h", "to": "now"},
}

EXPECTED_PANELS: dict[int, dict[str, Any]] = {
    1: {
        "title": "Total Requests (1h)",
        "type": "stat",
        "datasource": {"type": "prometheus", "uid": "grafanacloud-prom"},
        "targets": [
            {
                "refId": "A",
                "datasource": {"type": "prometheus", "uid": "grafanacloud-prom"},
                "expr": 'sum(increase(http_server_duration_milliseconds_count{service_name="glaze"}[$__range]))',
                "instant": True,
                "legendFormat": "Requests",
            }
        ],
    },
    2: {
        "title": "HTTP Error Rate (5xx)",
        "type": "stat",
        "datasource": {"type": "prometheus", "uid": "grafanacloud-prom"},
        "targets": [
            {
                "refId": "A",
                "datasource": {"type": "prometheus", "uid": "grafanacloud-prom"},
                "expr": '(sum(increase(http_server_duration_milliseconds_count{service_name="glaze", http_status_code=~"5.."}[$__range])) or vector(0)) / sum(increase(http_server_duration_milliseconds_count{service_name="glaze"}[$__range])) * 100',
                "instant": True,
                "legendFormat": "Error Rate",
            }
        ],
    },
    3: {
        "title": "p95 Latency",
        "type": "stat",
        "datasource": {"type": "prometheus", "uid": "grafanacloud-prom"},
        "targets": [
            {
                "refId": "A",
                "datasource": {"type": "prometheus", "uid": "grafanacloud-prom"},
                "expr": 'histogram_quantile(0.95, sum(rate(http_server_duration_milliseconds_bucket{service_name="glaze"}[$__rate_interval])) by (le))',
                "instant": True,
                "legendFormat": "p95 Latency",
            }
        ],
    },
    4: {
        "title": "Active Requests",
        "type": "stat",
        "datasource": {"type": "prometheus", "uid": "grafanacloud-prom"},
        "targets": [
            {
                "refId": "A",
                "datasource": {"type": "prometheus", "uid": "grafanacloud-prom"},
                "expr": 'sum(http_server_active_requests{service_name="glaze"})',
                "instant": True,
                "legendFormat": "Active",
            }
        ],
    },
    5: {
        "title": "Request Rate by Status Code",
        "type": "timeseries",
        "datasource": {"type": "prometheus", "uid": "grafanacloud-prom"},
        "targets": [
            {
                "refId": "A",
                "datasource": {"type": "prometheus", "uid": "grafanacloud-prom"},
                "expr": 'sum(rate(http_server_duration_milliseconds_count{service_name="glaze"}[$__rate_interval])) by (http_status_code)',
                "legendFormat": "{{http_status_code}}",
            }
        ],
    },
    7: {
        "title": "Error & Warning Logs",
        "type": "logs",
        "datasource": {"type": "loki", "uid": "grafanacloud-logs"},
        "targets": [
            {
                "refId": "A",
                "datasource": {"type": "loki", "uid": "grafanacloud-logs"},
                "expr": '{service_name="glaze"} | detected_level=~"warn|error" or severity_text=~"WARN|ERROR|CRITICAL"',
                "queryType": "range",
            }
        ],
    },
    8: {
        "title": "Backend Anomalous Traces (Slow >500ms or Errored)",
        "type": "table",
        "datasource": {"type": "tempo", "uid": "grafanacloud-traces"},
        "targets": [
            {
                "refId": "A",
                "datasource": {"type": "tempo", "uid": "grafanacloud-traces"},
                "queryType": "traceql",
                "tableType": "traces",
                "metricsQueryType": "range",
                "serviceMapUseNativeHistograms": False,
                "limit": 30,
                "query": '{resource.service.name="glaze" && (duration > 500ms || status=error)}',
            }
        ],
    },
    9: {
        "title": "Metrics Series Quota",
        "type": "piechart",
        "datasource": {"type": "prometheus", "uid": "grafanacloud-usage"},
        "targets": [
            {
                "refId": "A",
                "datasource": {"type": "prometheus", "uid": "grafanacloud-usage"},
                "expr": "grafanacloud_org_metrics_billable_series",
                "instant": True,
                "legendFormat": "Used",
            },
            {
                "refId": "B",
                "datasource": {"type": "prometheus", "uid": "grafanacloud-usage"},
                "expr": 'grafanacloud_instance_metrics_limits{limit_name="max_global_series_per_user"} - on(org_id) grafanacloud_org_metrics_billable_series',
                "instant": True,
                "legendFormat": "Remaining",
            },
        ],
    },
    10: {
        "title": "Logs Quota (Monthly)",
        "type": "piechart",
        "datasource": {"type": "prometheus", "uid": "grafanacloud-usage"},
        "targets": [
            {
                "refId": "A",
                "datasource": {"type": "prometheus", "uid": "grafanacloud-usage"},
                "expr": "grafanacloud_org_logs_usage",
                "instant": True,
                "legendFormat": "Used",
            },
            {
                "refId": "B",
                "datasource": {"type": "prometheus", "uid": "grafanacloud-usage"},
                "expr": "grafanacloud_org_logs_included_usage - grafanacloud_org_logs_usage",
                "instant": True,
                "legendFormat": "Remaining",
            },
        ],
    },
    13: {
        "title": "Cloudinary Credits Quota",
        "type": "piechart",
        "datasource": {"type": "yesoreyeram-infinity-datasource", "uid": "ffo8wq300tukgb"},
        "targets": [
            {
                "refId": "A",
                "datasource": {"type": "yesoreyeram-infinity-datasource", "uid": "ffo8wq300tukgb"},
                "type": "json",
                "source": "url",
                "url": "https://api.cloudinary.com/v1_1/dxpnyhe1f/usage",
                "url_options": {"method": "GET"},
                "parser": "backend",
                "root_selector": "storage",
                "columns": [{"selector": "credits_usage", "text": "storage_cr", "type": "number"}],
            },
            {
                "refId": "B",
                "datasource": {"type": "yesoreyeram-infinity-datasource", "uid": "ffo8wq300tukgb"},
                "type": "json",
                "source": "url",
                "url": "https://api.cloudinary.com/v1_1/dxpnyhe1f/usage",
                "url_options": {"method": "GET"},
                "parser": "backend",
                "root_selector": "bandwidth",
                "columns": [{"selector": "credits_usage", "text": "bandwidth_cr", "type": "number"}],
            },
            {
                "refId": "C",
                "datasource": {"type": "yesoreyeram-infinity-datasource", "uid": "ffo8wq300tukgb"},
                "type": "json",
                "source": "url",
                "url": "https://api.cloudinary.com/v1_1/dxpnyhe1f/usage",
                "url_options": {"method": "GET"},
                "parser": "backend",
                "root_selector": "transformations",
                "columns": [{"selector": "credits_usage", "text": "transform_cr", "type": "number"}],
            },
            {
                "refId": "D",
                "datasource": {"type": "yesoreyeram-infinity-datasource", "uid": "ffo8wq300tukgb"},
                "type": "json",
                "source": "url",
                "url": "https://api.cloudinary.com/v1_1/dxpnyhe1f/usage",
                "url_options": {"method": "GET"},
                "parser": "backend",
                "root_selector": "credits",
                "columns": [],
                "computed_columns": [{"selector": "limit - usage", "text": "remaining", "type": "number"}],
            },
        ],
        "transformations": [
            {
                "id": "filterFieldsByName",
                "options": {
                    "include": {
                        "names": ["storage_cr", "bandwidth_cr", "transform_cr", "remaining"]
                    }
                },
            },
            {
                "id": "organize",
                "options": {
                    "renameByName": {
                        "bandwidth_cr": "Bandwidth (rotating)",
                        "remaining": "Headroom",
                        "storage_cr": "Storage (fixed)",
                        "transform_cr": "Transforms (rotating)",
                    }
                },
            },
        ],
    },
    14: {
        "title": "Frontend Anomalous Traces (glaze-web, Slow >2s or Errored)",
        "type": "table",
        "datasource": {"type": "tempo", "uid": "grafanacloud-traces"},
        "targets": [
            {
                "refId": "A",
                "datasource": {"type": "tempo", "uid": "grafanacloud-traces"},
                "queryType": "traceql",
                "tableType": "traces",
                "metricsQueryType": "range",
                "serviceMapUseNativeHistograms": False,
                "limit": 30,
                "query": '{resource.service.name="glaze-web" && (duration > 2s || status=error)}',
            }
        ],
    },
    15: {
        "title": "CPU Utilization",
        "type": "piechart",
        "datasource": {"type": "prometheus", "uid": "grafanacloud-prom"},
        "targets": [
            {
                "refId": "A",
                "datasource": {"type": "prometheus", "uid": "grafanacloud-prom"},
                "expr": '100 * rate(container_cpu_usage_seconds_total{id="/"}[5m]) / on(instance) machine_cpu_cores',
                "instant": False,
                "legendFormat": "Used",
            },
            {
                "refId": "B",
                "datasource": {"type": "prometheus", "uid": "grafanacloud-prom"},
                "expr": '100 - (100 * rate(container_cpu_usage_seconds_total{id="/"}[5m]) / on(instance) machine_cpu_cores)',
                "instant": False,
                "legendFormat": "Free",
            },
        ],
    },
    16: {
        "title": "RAM Utilization",
        "type": "piechart",
        "datasource": {"type": "prometheus", "uid": "grafanacloud-prom"},
        "targets": [
            {
                "refId": "A",
                "datasource": {"type": "prometheus", "uid": "grafanacloud-prom"},
                "expr": '100 * container_memory_working_set_bytes{id="/"} / on(instance) machine_memory_bytes',
                "instant": False,
                "legendFormat": "Used",
            },
            {
                "refId": "B",
                "datasource": {"type": "prometheus", "uid": "grafanacloud-prom"},
                "expr": '100 - (100 * container_memory_working_set_bytes{id="/"} / on(instance) machine_memory_bytes)',
                "instant": False,
                "legendFormat": "Free",
            },
        ],
    },
    17: {
        "title": "Swap Utilization",
        "type": "piechart",
        "datasource": {"type": "prometheus", "uid": "grafanacloud-prom"},
        "targets": [
            {
                "refId": "A",
                "datasource": {"type": "prometheus", "uid": "grafanacloud-prom"},
                "expr": '100 * container_memory_swap{id="/"} / on(instance) machine_swap_bytes',
                "instant": False,
                "legendFormat": "Used",
            },
            {
                "refId": "B",
                "datasource": {"type": "prometheus", "uid": "grafanacloud-prom"},
                "expr": '100 - (100 * container_memory_swap{id="/"} / on(instance) machine_swap_bytes)',
                "instant": False,
                "legendFormat": "Free",
            },
        ],
    },
}

EXPECTED_PANEL_IDS = set(EXPECTED_PANELS)
SECRET_MARKERS = ("Authorization", "Basic ", "Bearer ")


class ValidationError(RuntimeError):
    """Raised when a dashboard fails validation."""


def load_dashboard(path: pathlib.Path) -> dict[str, Any]:
    try:
        with path.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError as exc:
        raise ValidationError(f"{path}: file not found") from exc
    except json.JSONDecodeError as exc:
        raise ValidationError(f"{path}: invalid JSON: {exc}") from exc
    if not isinstance(data, dict):
        raise ValidationError(f"{path}: dashboard root must be an object")
    return data


def subset_errors(expected: Any, actual: Any, path: str) -> list[str]:
    errors: list[str] = []
    if isinstance(expected, Mapping):
        if not isinstance(actual, Mapping):
            return [f"{path}: expected object, got {type(actual).__name__}"]
        for key, value in expected.items():
            if key not in actual:
                errors.append(f"{path}.{key}: missing key")
                continue
            errors.extend(subset_errors(value, actual[key], f"{path}.{key}"))
        return errors
    if isinstance(expected, list):
        if not isinstance(actual, list):
            return [f"{path}: expected list, got {type(actual).__name__}"]
        if len(expected) != len(actual):
            errors.append(f"{path}: expected {len(expected)} items, got {len(actual)}")
        for index, (expected_item, actual_item) in enumerate(zip(expected, actual)):
            errors.extend(subset_errors(expected_item, actual_item, f"{path}[{index}]"))
        return errors
    if actual != expected:
        return [f"{path}: expected {expected!r}, got {actual!r}"]
    return errors


def iter_string_values(value: Any, path: str = "$") -> Iterable[tuple[str, str]]:
    if isinstance(value, str):
        yield path, value
    elif isinstance(value, Mapping):
        for key, item in value.items():
            yield from iter_string_values(item, f"{path}.{key}")
    elif isinstance(value, list):
        for index, item in enumerate(value):
            yield from iter_string_values(item, f"{path}[{index}]")


def validate_dashboard(path: pathlib.Path) -> None:
    dashboard = load_dashboard(path)
    errors: list[str] = []

    errors.extend(subset_errors(EXPECTED_DASHBOARD, dashboard, "$"))

    panels = dashboard.get("panels")
    if not isinstance(panels, list):
        errors.append("$.panels: missing or not a list")
    else:
        panel_by_id: dict[int, dict[str, Any]] = {}
        for index, panel in enumerate(panels):
            panel_path = f"$.panels[{index}]"
            if not isinstance(panel, Mapping):
                errors.append(f"{panel_path}: expected object, got {type(panel).__name__}")
                continue
            panel_id = panel.get("id")
            if not isinstance(panel_id, int):
                errors.append(f"{panel_path}.id: missing or non-integer")
                continue
            if panel_id in panel_by_id:
                errors.append(f"$.panels: duplicate panel id {panel_id}")
                continue
            panel_by_id[panel_id] = dict(panel)

        if set(panel_by_id) != EXPECTED_PANEL_IDS:
            missing = sorted(EXPECTED_PANEL_IDS - set(panel_by_id))
            extra = sorted(set(panel_by_id) - EXPECTED_PANEL_IDS)
            if missing:
                errors.append(f"$.panels: missing panels {missing}")
            if extra:
                errors.append(f"$.panels: unexpected panels {extra}")

        for panel_id, expected_panel in EXPECTED_PANELS.items():
            actual_panel = panel_by_id.get(panel_id)
            if actual_panel is None:
                continue
            errors.extend(subset_errors(expected_panel, actual_panel, f"$.panels[id={panel_id}]"))

    for path_name, string_value in iter_string_values(dashboard):
        if any(marker in string_value for marker in SECRET_MARKERS):
            errors.append(f"{path_name}: secret-bearing string detected")

    if errors:
        raise ValidationError("\n".join(errors))


def deep_merge(base: Any, overlay: Any) -> Any:
    if isinstance(base, dict) and isinstance(overlay, dict):
        merged = copy.deepcopy(base)
        for key, value in overlay.items():
            if key == "panels" and isinstance(value, list):
                merged[key] = merge_panels(base.get(key, []), value)
            elif key in merged and isinstance(merged[key], dict) and isinstance(value, dict):
                merged[key] = deep_merge(merged[key], value)
            else:
                merged[key] = copy.deepcopy(value)
        return merged
    return copy.deepcopy(overlay)


def merge_panels(base_panels: Any, overlay_panels: Any) -> list[dict[str, Any]]:
    if not isinstance(base_panels, list) or not isinstance(overlay_panels, list):
        return copy.deepcopy(overlay_panels)

    base_by_id: dict[int, dict[str, Any]] = {}
    for panel in base_panels:
        if isinstance(panel, dict) and isinstance(panel.get("id"), int):
            base_by_id[panel["id"]] = copy.deepcopy(panel)

    merged: list[dict[str, Any]] = []
    seen: set[int] = set()
    for panel in overlay_panels:
        if not isinstance(panel, dict) or not isinstance(panel.get("id"), int):
            merged.append(copy.deepcopy(panel))
            continue
        panel_id = panel["id"]
        seen.add(panel_id)
        if panel_id in base_by_id:
            merged.append(deep_merge(base_by_id[panel_id], panel))
        else:
            merged.append(copy.deepcopy(panel))

    for panel in base_panels:
        if isinstance(panel, dict) and isinstance(panel.get("id"), int) and panel["id"] not in seen:
            merged.append(copy.deepcopy(panel))

    return merged


def fetch_dashboard(url: str, api_token: str, uid: str) -> dict[str, Any]:
    request = urllib.request.Request(
        f"{url.rstrip('/')}/api/dashboards/uid/{uid}",
        headers={"Authorization": f"Bearer {api_token}"},
    )
    try:
        with urllib.request.urlopen(request) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"failed to fetch dashboard {uid}: {exc.read().decode('utf-8', 'replace')}") from exc
    if not isinstance(payload, dict) or "dashboard" not in payload:
        raise RuntimeError(f"unexpected dashboard response for {uid}")
    dashboard = payload["dashboard"]
    if not isinstance(dashboard, dict):
        raise RuntimeError(f"dashboard payload for {uid} was not an object")
    return payload


def publish_dashboard(path: pathlib.Path, grafana_url: str, api_token: str) -> None:
    overlay = load_dashboard(path)
    validate_dashboard(path)
    uid = overlay.get("uid")
    if not isinstance(uid, str) or not uid:
        raise ValidationError(f"{path}: missing dashboard uid")

    live_payload = fetch_dashboard(grafana_url, api_token, uid)
    live_dashboard = live_payload["dashboard"]
    merged_dashboard = deep_merge(live_dashboard, overlay)
    merged_dashboard["id"] = live_dashboard.get("id")
    merged_dashboard.setdefault("uid", uid)

    folder_uid = live_payload.get("meta", {}).get("folderUid") or DEFAULT_FOLDER_UID
    body = json.dumps(
        {
            "dashboard": merged_dashboard,
            "folderUid": folder_uid,
            "overwrite": True,
            "message": f"Publish {path.name}",
        }
    ).encode("utf-8")

    request = urllib.request.Request(
        f"{grafana_url.rstrip('/')}/api/dashboards/db",
        data=body,
        headers={
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request) as response:
            result = json.load(response)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f"failed to publish dashboard {uid}: {exc.read().decode('utf-8', 'replace')}") from exc

    print(json.dumps(result, indent=2, sort_keys=True))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    validate_parser = subparsers.add_parser("validate", help="Validate one or more dashboard snapshot files")
    validate_parser.add_argument("paths", nargs="+", type=pathlib.Path)

    publish_parser = subparsers.add_parser("publish", help="Publish a dashboard snapshot to Grafana")
    publish_parser.add_argument("path", type=pathlib.Path)
    publish_parser.add_argument("--grafana-url", default=os.environ.get("GRAFANA_URL", DEFAULT_GRAFANA_URL))
    publish_parser.add_argument("--api-token", default=os.environ.get("GRAFANA_API_TOKEN"))

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    try:
        if args.command == "validate":
            for path in args.paths:
                validate_dashboard(path)
                print(f"{path}: OK")
        elif args.command == "publish":
            if not args.api_token:
                raise RuntimeError(
                    "GRAFANA_API_TOKEN is required; set it as an environment variable or pass --api-token"
                )
            publish_dashboard(args.path, args.grafana_url, args.api_token)
        else:
            raise RuntimeError(f"unknown command {args.command}")
    except (ValidationError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
