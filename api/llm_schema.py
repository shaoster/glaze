"""LLM-tailored OpenAPI schema configuration for the PotterDoc Agent API."""

# Only these globals appear in the LLM schema. The piece global is excluded
# because pieces must be created via POST /api/pieces/ (so the initial
# `designed` state is initialized). All other library globals (clay_body,
# glaze_type, etc.) are reference data that LLM clients can derive from
# the piece detail response; they are excluded to stay within the 30-operation
# limit imposed by GPT Builder.
_INCLUDED_GLOBALS = {"tag"}

_AGENT_AUTH_SCHEME = {
    "type": "http",
    "scheme": "bearer",
    "bearerFormat": "pdagent_<token>",
    "description": (
        "Long-lived agent token created in the PotterDoc web UI. "
        "Tokens are prefixed with `pdagent_` and grant standard user "
        "permissions only — no admin or staff actions."
    ),
}


def _is_llm_endpoint(path: str) -> bool:
    if path.startswith("/api/pieces/"):
        return True
    if path.startswith("/api/globals/"):
        # Extract the global name (third path segment).
        parts = path.split("/")  # ['', 'api', 'globals', '<name>', ...]
        global_name = parts[3] if len(parts) > 3 else ""
        return global_name in _INCLUDED_GLOBALS
    # Only the specific crop endpoint, not piece_state or crop-runs.
    if path.endswith("/crop/"):
        return True
    return False


def llm_schema_preprocessing_hook(endpoints, **kwargs):
    return [
        (path, path_regex, method, callback)
        for path, path_regex, method, callback in endpoints
        if _is_llm_endpoint(path)
    ]


def llm_schema_postprocessing_hook(result, generator, request, public, **kwargs):
    """Replace all security schemes with agentAuth and normalize per-op security."""
    # GPT Builder rejects schemas where `servers` is absent or contains only a
    # relative URL ("/"). Inject the absolute origin derived from the request so
    # the schema is importable regardless of whether SERVERS is set in settings.
    if request is not None:
        result["servers"] = [{"url": request.build_absolute_uri("/").rstrip("/")}]

    result.setdefault("components", {})
    result["components"]["securitySchemes"] = {"agentAuth": _AGENT_AUTH_SCHEME}
    result["security"] = [{"agentAuth": []}]

    # Per-operation security overrides reference whichever schemes were registered
    # on the authenticators (bearerAuth, cookieAuth). Those schemes are removed
    # above, so stale per-op entries must be cleared to avoid dangling references.
    for path_item in result.get("paths", {}).values():
        for operation in path_item.values():
            if isinstance(operation, dict):
                operation.pop("security", None)

    return result


LLM_SPECTACULAR_SETTINGS = {
    "TITLE": "PotterDoc Agent API",
    "DESCRIPTION": (
        "Pottery workflow tracking API — agent-optimized subset.\n\n"
        "**Authentication:** All endpoints require a Bearer agent token. "
        "Create a token via the PotterDoc web UI under Settings → Agent Tokens. "
        "Tokens are prefixed with `pdagent_`. "
        "Pass it as: `Authorization: Bearer pdagent_<your-token>`."
    ),
    "VERSION": "0.0.1",
    "PREPROCESSING_HOOKS": ["api.llm_schema.llm_schema_preprocessing_hook"],
    "POSTPROCESSING_HOOKS": ["api.llm_schema.llm_schema_postprocessing_hook"],
}
