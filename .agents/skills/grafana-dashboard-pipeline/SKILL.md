---
name: grafana-dashboard-pipeline
description: Validate Glaze Grafana dashboards locally with Bazel, test PromQL/TraceQL formulas, and publish SDK-generated dashboards to Grafana on main.
---

# Grafana Dashboard Pipeline

Use this skill when editing `tools/grafana_dashboard.py`, the Grafana dashboard workflow, or any dashboard query that needs local validation before merge.

## Repo Pattern

- Treat the dashboard as code, built through Grafana Foundation SDK and checked into `tools/grafana_dashboard.py`.
- Validate pull requests locally and in CI before any publish step runs.
- Publish only from `main` after CI succeeds.
- Keep Grafana API secrets out of PR jobs; publishing uses a token only in the `workflow_run` path.

## Local Validation

1. Run the Bazel-backed test target so the dashboard build uses the same controlled Python deps as CI:
   `rtk bazel test //tools:test_grafana_dashboard --test_output=errors`
2. Validate the generated dashboard directly when you want to smoke-test the CLI:
   `rtk bazel run //tools:grafana_dashboard -- validate`
3. Inspect the saved queries and panel datasources:
   `mcp__grafana.get_dashboard_panel_queries`
4. Test PromQL against the live datasource before merging:
   `mcp__grafana.query_prometheus`
5. Test TraceQL against Tempo for trace panels:
   `mcp__grafana.tempo_traceql_search`

## Formula Best Practices

- Test PromQL as the panel will run it:
  - `instant` queries for stat/pie panels
  - range queries for time series
- Verify label matchers against the live datasource before saving a panel.
- Keep query changes in the dashboard file, not in ad hoc Grafana-only edits.
- If a panel goes blank, confirm the metric exists and the labels still match before changing the visualization.

## Dashboard Config Best Practices

- Keep the dashboard source sanitized. Never commit Grafana auth headers or tokens.
- Preserve stable panel `id` values so CI and the publish step can update the live dashboard predictably.
- Update the dashboard source, the validation helper, and the workflow together when a dashboard changes shape.
- Use the publish workflow only for `main` merges; PRs should only validate.

## Workflow Notes

- The validation workflow should stay path-scoped to the dashboard source, its tests, and the helper/build files.
- The publish workflow should:
  - run after CI success on `main`
  - skip non-dashboard commits
  - use the dedicated `glaze-grafana` GitHub environment
  - use `GRAFANA_SERVICE_ACCOUNT_TOKEN` only at publish time
