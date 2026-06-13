import json

_EXCLUDED_PREFIXES = (
    "/api/admin/",
    "/api/health/",
    "/api/telemetry/",
    "/api/auth/",
    "/api/tasks/",
    "/api/graphql/",
    "/api/uploads/",
    "/api/workflow/",
    "/api/analysis/",
    "/api/staff/",
)

_EXCLUDED_IMAGE_PATHS = (
    "/api/images/{image_id}/piece_state/{piece_state_id}/",
    "/api/images/{image_id}/crop-runs/",
)

_EXPECTED_PATHS = (
    "/api/pieces/",
    "/api/pieces/{piece_id}/states/",
    "/api/pieces/{piece_id}/current_state/",
    "/api/pieces/{piece_id}/state/",
    "/api/images/{image_id}/crop/",
)


def _get_llm_schema(client):
    response = client.get("/api/schema/llm/?format=json")
    assert response.status_code == 200
    return json.loads(response.content)


class TestLLMSchemaEndpoint:
    def test_schema_endpoint_returns_200(self, client):
        response = client.get("/api/schema/llm/?format=json")
        assert response.status_code == 200

    def test_schema_endpoint_returns_json(self, client):
        response = client.get("/api/schema/llm/?format=json")
        assert "application/vnd.oai.openapi+json" in response["Content-Type"]

    def test_schema_is_parseable(self, client):
        schema = _get_llm_schema(client)
        assert "paths" in schema
        assert "info" in schema


class TestLLMSchemaFiltering:
    def test_excluded_paths_absent(self, client):
        schema = _get_llm_schema(client)
        paths = schema.get("paths", {})
        for path in paths:
            for prefix in _EXCLUDED_PREFIXES:
                assert not path.startswith(prefix), (
                    f"Excluded path {path!r} should not appear in LLM schema"
                )
            for excluded in _EXCLUDED_IMAGE_PATHS:
                assert path != excluded, (
                    f"Internal image path {path!r} should not appear in LLM schema"
                )

    def test_piece_global_excluded(self, client):
        schema = _get_llm_schema(client)
        paths = schema.get("paths", {})
        assert "/api/globals/piece/" not in paths, (
            "Piece pseudo-global must be excluded — use POST /api/pieces/ instead"
        )

    def test_expected_paths_present(self, client):
        schema = _get_llm_schema(client)
        paths = schema.get("paths", {})
        for expected in _EXPECTED_PATHS:
            assert expected in paths, (
                f"Expected path {expected!r} missing from LLM schema"
            )

    def test_globals_paths_present(self, client):
        from api.llm_schema import _EXCLUDED_GLOBALS
        from api.workflow import get_global_names

        schema = _get_llm_schema(client)
        paths = schema.get("paths", {})
        global_names = [n for n in get_global_names() if n not in _EXCLUDED_GLOBALS]
        assert len(global_names) > 0, (
            "workflow.yml should define at least one non-excluded global"
        )
        for name in global_names:
            expected = f"/api/globals/{name}/"
            assert expected in paths, (
                f"Global entry path {expected!r} missing from LLM schema"
            )

    def test_all_operations_have_operation_id(self, client):
        schema = _get_llm_schema(client)
        for path, path_item in schema.get("paths", {}).items():
            for method, operation in path_item.items():
                if method == "parameters":
                    continue
                op_id = operation.get("operationId", "")
                assert op_id, f"Operation {method.upper()} {path} missing operationId"

    def test_agent_auth_security_scheme_present(self, client):
        schema = _get_llm_schema(client)
        schemes = schema.get("components", {}).get("securitySchemes", {})
        assert "agentAuth" in schemes, (
            "agentAuth security scheme missing from LLM schema"
        )
        assert schemes["agentAuth"]["type"] == "http"
        assert schemes["agentAuth"]["scheme"] == "bearer"
        assert set(schemes.keys()) == {"agentAuth"}, (
            f"Only agentAuth should appear; extra: {set(schemes.keys()) - {'agentAuth'}}"
        )

    def test_no_per_operation_security_overrides(self, client):
        schema = _get_llm_schema(client)
        for path, path_item in schema.get("paths", {}).items():
            for method, operation in path_item.items():
                if method == "parameters" or not isinstance(operation, dict):
                    continue
                assert "security" not in operation, (
                    f"Operation {method.upper()} {path} has a per-op security "
                    "override referencing removed schemes"
                )

    def test_schema_title_is_agent_api(self, client):
        schema = _get_llm_schema(client)
        assert schema["info"]["title"] == "PotterDoc Agent API"
