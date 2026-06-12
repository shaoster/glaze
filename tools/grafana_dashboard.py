#!/usr/bin/env python3
"""Build, validate, and publish the Glaze Grafana dashboard with Foundation SDK.

The dashboard lives in Python code so the repo can keep Grafana-specific logic
typed, reviewable, and testable under Bazel. The publish path emits Grafana
JSON from the SDK-generated model and updates the live dashboard directly.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from copy import deepcopy
from typing import Any

from grafana_foundation_sdk.builders.dashboard import Dashboard as DashboardBuilder
from grafana_foundation_sdk.builders.logs import Panel as LogsPanelBuilder
from grafana_foundation_sdk.builders.loki import Dataquery as LokiQueryBuilder
from grafana_foundation_sdk.builders.piechart import Panel as PieChartPanelBuilder
from grafana_foundation_sdk.builders.prometheus import (
    Dataquery as PrometheusQueryBuilder,
)
from grafana_foundation_sdk.builders.stat import Panel as StatPanelBuilder
from grafana_foundation_sdk.builders.table import Panel as TablePanelBuilder
from grafana_foundation_sdk.builders.tempo import TempoQuery as TempoQueryBuilder
from grafana_foundation_sdk.builders.timeseries import Panel as TimeseriesPanelBuilder
from grafana_foundation_sdk.cog.encoder import JSONEncoder
from grafana_foundation_sdk.models.dashboard import (
    DataSourceRef,
    DataTransformerConfig,
    GridPos,
)

DEFAULT_GRAFANA_URL = "https://shaoster.grafana.net"
DEFAULT_FOLDER_UID = ""

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
                "query": '{trace:rootService="glaze" && (duration > 500ms || status=error)}',
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
    18: {
        "title": "R2 Storage",
        "type": "piechart",
        "datasource": {
            "type": "yesoreyeram-infinity-datasource",
            "uid": "cloudflare-r2-infinity",
        },
        "targets": [
            {
                "refId": "A",
                "datasource": {
                    "type": "yesoreyeram-infinity-datasource",
                    "uid": "cloudflare-r2-infinity",
                },
                "type": "json",
                "source": "url",
                "url": "https://api.cloudflare.com/client/v4/graphql",
                "url_options": {
                    "method": "POST",
                    "data": '{"query":"query { viewer { accounts(filter: { accountTag: \\"e43555a6c4fcc087a74f2d775c9a0513\\" }) { r2StorageAdaptiveGroups(filter: { bucketName: \\"potterdoc\\", datetime_geq: \\"${__from:date:YYYY-MM}-01T00:00:00Z\\", datetime_leq: \\"${__to:date:iso}\\" }, limit: 1000) { max { payloadSize } } } } }"}',
                    "body_type": "raw",
                    "body_content_type": "application/json",
                },
                "parser": "backend",
                "root_selector": '($vals := data.viewer.accounts[0].r2StorageAdaptiveGroups.max.payloadSize; $avg_used := $vals ? $average($vals) : 0; [{"Used": $avg_used, "Remaining": 10000000000 - $avg_used}])',
                "columns": [
                    {
                        "selector": "Used",
                        "text": "Used",
                        "type": "number",
                    },
                    {
                        "selector": "Remaining",
                        "text": "Remaining",
                        "type": "number",
                    },
                ],
                "cache_timeout_in_seconds": 3600,
            }
        ],
    },
    19: {
        "title": "R2 Class A Operations",
        "type": "piechart",
        "datasource": {
            "type": "yesoreyeram-infinity-datasource",
            "uid": "cloudflare-r2-infinity",
        },
        "targets": [
            {
                "refId": "A",
                "datasource": {
                    "type": "yesoreyeram-infinity-datasource",
                    "uid": "cloudflare-r2-infinity",
                },
                "type": "json",
                "source": "url",
                "url": "https://api.cloudflare.com/client/v4/graphql",
                "url_options": {
                    "method": "POST",
                    "data": '{"query":"query { viewer { accounts(filter: { accountTag: \\"e43555a6c4fcc087a74f2d775c9a0513\\" }) { r2OperationsAdaptiveGroups(filter: { bucketName: \\"potterdoc\\", datetime_geq: \\"${__from:date:YYYY-MM}-01T00:00:00Z\\", datetime_leq: \\"${__to:date:iso}\\", actionType_in: [\\"PutObject\\", \\"CopyObject\\", \\"ListObjects\\", \\"ListBuckets\\", \\"CompleteMultipartUpload\\", \\"CreateMultipartUpload\\", \\"UploadPart\\"] }, limit: 1000) { sum { requests } } } } }"}',
                    "body_type": "raw",
                    "body_content_type": "application/json",
                },
                "parser": "backend",
                "root_selector": '($reqs := data.viewer.accounts[0].r2OperationsAdaptiveGroups.sum.requests; $used := $reqs ? $sum($reqs) : 0; [{"Used": $used, "Remaining": 1000000 - $used}])',
                "columns": [
                    {
                        "selector": "Used",
                        "text": "Used",
                        "type": "number",
                    },
                    {
                        "selector": "Remaining",
                        "text": "Remaining",
                        "type": "number",
                    },
                ],
                "cache_timeout_in_seconds": 3600,
            }
        ],
    },
    20: {
        "title": "R2 Class B Operations",
        "type": "piechart",
        "datasource": {
            "type": "yesoreyeram-infinity-datasource",
            "uid": "cloudflare-r2-infinity",
        },
        "targets": [
            {
                "refId": "A",
                "datasource": {
                    "type": "yesoreyeram-infinity-datasource",
                    "uid": "cloudflare-r2-infinity",
                },
                "type": "json",
                "source": "url",
                "url": "https://api.cloudflare.com/client/v4/graphql",
                "url_options": {
                    "method": "POST",
                    "data": '{"query":"query { viewer { accounts(filter: { accountTag: \\"e43555a6c4fcc087a74f2d775c9a0513\\" }) { r2OperationsAdaptiveGroups(filter: { bucketName: \\"potterdoc\\", datetime_geq: \\"${__from:date:YYYY-MM}-01T00:00:00Z\\", datetime_leq: \\"${__to:date:iso}\\", actionType_in: [\\"GetObject\\", \\"HeadObject\\", \\"HeadBucket\\"] }, limit: 1000) { sum { requests } } } } }"}',
                    "body_type": "raw",
                    "body_content_type": "application/json",
                },
                "parser": "backend",
                "root_selector": '($reqs := data.viewer.accounts[0].r2OperationsAdaptiveGroups.sum.requests; $used := $reqs ? $sum($reqs) : 0; [{"Used": $used, "Remaining": 10000000 - $used}])',
                "columns": [
                    {
                        "selector": "Used",
                        "text": "Used",
                        "type": "number",
                    },
                    {
                        "selector": "Remaining",
                        "text": "Remaining",
                        "type": "number",
                    },
                ],
                "cache_timeout_in_seconds": 3600,
            }
        ],
    },
}

EXPECTED_PANEL_IDS = set(EXPECTED_PANELS)


class ValidationError(RuntimeError):
    """Raised when a dashboard build or publish step fails."""


class InfinityQuery:
    def __init__(self, spec: dict[str, Any]) -> None:
        self._spec = deepcopy(spec)

    def to_json(self) -> dict[str, Any]:
        return deepcopy(self._spec)


class InfinityQueryBuilder:
    def __init__(self, spec: dict[str, Any]) -> None:
        self._internal = InfinityQuery(spec)

    def build(self) -> InfinityQuery:
        return self._internal


def _datasource_ref(spec: dict[str, Any]) -> DataSourceRef:
    return DataSourceRef(type_val=spec.get("type"), uid=spec.get("uid"))


def _grid_pos(spec: dict[str, Any]) -> GridPos:
    return GridPos(
        h=spec.get("h", 9),
        w=spec.get("w", 12),
        x=spec.get("x", 0),
        y=spec.get("y", 0),
        static=spec.get("static"),
    )


def _transformer(spec: dict[str, Any]) -> DataTransformerConfig:
    return DataTransformerConfig(
        id_val=spec["id"],
        disabled=spec.get("disabled"),
        options=deepcopy(spec.get("options", {})),
    )


def _prometheus_query(panel_type: str, spec: dict[str, Any]) -> PrometheusQueryBuilder:
    query = PrometheusQueryBuilder().ref_id(spec.get("refId", "A")).expr(spec["expr"])
    if spec.get("legendFormat") is not None:
        query.legend_format(spec["legendFormat"])
    if panel_type == "timeseries":
        query.range()
    elif spec.get("instant"):
        query.instant()
    elif spec.get("range"):
        query.range()
    if datasource := spec.get("datasource"):
        query.datasource(_datasource_ref(datasource))
    return query


def _loki_query(spec: dict[str, Any]) -> LokiQueryBuilder:
    query = LokiQueryBuilder().ref_id(spec.get("refId", "A")).expr(spec["expr"])
    if spec.get("legendFormat") is not None:
        query.legend_format(spec["legendFormat"])
    if spec.get("queryType") is not None:
        query.query_type(spec["queryType"])
    if spec.get("maxLines") is not None:
        query.max_lines(spec["maxLines"])
    if spec.get("direction") is not None:
        query.direction(spec["direction"])
    if datasource := spec.get("datasource"):
        query.datasource(_datasource_ref(datasource))
    return query


def _tempo_query(spec: dict[str, Any]) -> TempoQueryBuilder:
    query = TempoQueryBuilder().ref_id(spec.get("refId", "A")).query(spec["query"])
    if spec.get("queryType") is not None:
        query.query_type(spec["queryType"])
    if spec.get("limit") is not None:
        query.limit(spec["limit"])
    if spec.get("serviceName") is not None:
        query.service_name(spec["serviceName"])
    if spec.get("spanName") is not None:
        query.span_name(spec["spanName"])
    if spec.get("minDuration") is not None:
        query.min_duration(spec["minDuration"])
    if spec.get("maxDuration") is not None:
        query.max_duration(spec["maxDuration"])
    if spec.get("serviceMapQuery") is not None:
        query.service_map_query(spec["serviceMapQuery"])
    if spec.get("serviceMapIncludeNamespace") is not None:
        query.service_map_include_namespace(spec["serviceMapIncludeNamespace"])
    if datasource := spec.get("datasource"):
        query.datasource(_datasource_ref(datasource))
    return query


def _build_query(panel_type: str, spec: dict[str, Any]) -> Any:
    if "query" in spec:
        return _tempo_query(spec)
    if panel_type == "logs":
        return _loki_query(spec)
    if "expr" in spec:
        return _prometheus_query(panel_type, spec)
    if spec.get("type") == "json" and spec.get("source") == "url":
        return InfinityQueryBuilder(spec)
    raise ValidationError(f"unsupported query spec: {spec!r}")


def _build_panel(panel_id: int, panel_spec: dict[str, Any]) -> Any:
    panel_type = panel_spec["type"]
    if panel_type == "stat":
        panel = StatPanelBuilder()
    elif panel_type == "timeseries":
        panel = TimeseriesPanelBuilder()
    elif panel_type == "logs":
        panel = LogsPanelBuilder()
    elif panel_type == "table":
        panel = TablePanelBuilder()
    elif panel_type == "piechart":
        panel = PieChartPanelBuilder()
    else:
        raise ValidationError(f"unsupported panel type: {panel_type}")

    panel.id(panel_id).title(panel_spec["title"])
    if description := panel_spec.get("description"):
        panel.description(description)
    if datasource := panel_spec.get("datasource"):
        panel.datasource(_datasource_ref(datasource))
    if grid_pos := panel_spec.get("gridPos"):
        panel.grid_pos(_grid_pos(grid_pos))
    for target in panel_spec.get("targets", []):
        panel.with_target(_build_query(panel_type, target))
    for transformer in panel_spec.get("transformations", []):
        panel.with_transformation(_transformer(transformer))
    return panel


def build_dashboard() -> Any:
    dashboard = DashboardBuilder(EXPECTED_DASHBOARD["title"])
    dashboard.uid(EXPECTED_DASHBOARD["uid"])
    dashboard.tags(EXPECTED_DASHBOARD["tags"])
    dashboard.refresh(EXPECTED_DASHBOARD["refresh"])
    dashboard.time(EXPECTED_DASHBOARD["time"]["from"], EXPECTED_DASHBOARD["time"]["to"])
    dashboard.timezone(EXPECTED_DASHBOARD["timezone"])

    for panel_id in sorted(EXPECTED_PANELS):
        dashboard.with_panel(_build_panel(panel_id, EXPECTED_PANELS[panel_id]))

    return dashboard.build()


def dashboard_json() -> dict[str, Any]:
    return json.loads(JSONEncoder(sort_keys=True, indent=2).encode(build_dashboard()))


def validate_dashboard() -> None:
    payload = dashboard_json()
    errors: list[str] = []

    for key, expected in EXPECTED_DASHBOARD.items():
        if key == "time":
            if payload.get("time") != expected:
                errors.append(
                    f"$.time: expected {expected!r}, got {payload.get('time')!r}"
                )
        elif payload.get(key) != expected:
            errors.append(f"$.{key}: expected {expected!r}, got {payload.get(key)!r}")

    panels = payload.get("panels")
    if not isinstance(panels, list):
        errors.append("$.panels: missing or not a list")
    else:
        panel_ids = {panel.get("id") for panel in panels if isinstance(panel, dict)}
        if panel_ids != EXPECTED_PANEL_IDS:
            errors.append(
                f"$.panels: expected ids {sorted(EXPECTED_PANEL_IDS)}, got {sorted(pid for pid in panel_ids if isinstance(pid, int))}"
            )

    if errors:
        raise ValidationError("\n".join(errors))


def fetch_dashboard(url: str, api_token: str, uid: str) -> dict[str, Any]:
    request = urllib.request.Request(
        f"{url.rstrip('/')}/api/dashboards/uid/{uid}",
        headers={"Authorization": f"Bearer {api_token}"},
    )
    try:
        with urllib.request.urlopen(request) as response:
            payload = json.load(response)
    except urllib.error.HTTPError as exc:
        raise RuntimeError(
            f"failed to fetch dashboard {uid}: {exc.read().decode('utf-8', 'replace')}"
        ) from exc
    if not isinstance(payload, dict) or "dashboard" not in payload:
        raise RuntimeError(f"unexpected dashboard response for {uid}")
    dashboard = payload["dashboard"]
    if not isinstance(dashboard, dict):
        raise RuntimeError(f"dashboard payload for {uid} was not an object")
    return payload


def publish_dashboard(grafana_url: str, api_token: str) -> None:
    validate_dashboard()
    uid = EXPECTED_DASHBOARD["uid"]

    live_payload = fetch_dashboard(grafana_url, api_token, uid)
    live_dashboard = live_payload["dashboard"]
    published_dashboard = dashboard_json()
    published_dashboard["id"] = live_dashboard.get("id")
    for key in ("editable", "schemaVersion", "version"):
        if key in live_dashboard:
            published_dashboard[key] = live_dashboard[key]

    folder_uid = live_payload.get("meta", {}).get("folderUid") or DEFAULT_FOLDER_UID
    body = json.dumps(
        {
            "dashboard": published_dashboard,
            "folderUid": folder_uid,
            "overwrite": True,
            "message": "Publish glaze-app-summary dashboard",
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
        raise RuntimeError(
            f"failed to publish dashboard {uid}: {exc.read().decode('utf-8', 'replace')}"
        ) from exc

    print(json.dumps(result, indent=2, sort_keys=True))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)

    subparsers.add_parser(
        "validate", help="Validate the dashboard code and generated JSON"
    )

    publish_parser = subparsers.add_parser(
        "publish", help="Publish the generated dashboard to Grafana"
    )
    publish_parser.add_argument(
        "--grafana-url", default=os.environ.get("GRAFANA_URL", DEFAULT_GRAFANA_URL)
    )
    publish_parser.add_argument(
        "--api-token",
        default=os.environ.get("GRAFANA_SERVICE_ACCOUNT_TOKEN")
        or os.environ.get("GRAFANA_API_TOKEN"),
    )

    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)

    try:
        if args.command == "validate":
            validate_dashboard()
            print("Grafana dashboard: OK")
        elif args.command == "publish":
            if not args.api_token:
                raise RuntimeError(
                    "GRAFANA_SERVICE_ACCOUNT_TOKEN is required; set it as an environment variable or pass --api-token"
                )
            publish_dashboard(args.grafana_url, args.api_token)
        else:
            raise RuntimeError(f"unknown command {args.command}")
    except (ValidationError, RuntimeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
