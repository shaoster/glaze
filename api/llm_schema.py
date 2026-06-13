"""LLM-tailored OpenAPI schema configuration for the PotterDoc Agent API."""

_LLM_PATH_PREFIXES = (
    "/api/pieces/",
    "/api/globals/",
    "/api/images/",
)

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


def llm_schema_preprocessing_hook(endpoints, **kwargs):
    return [
        (path, path_regex, method, callback)
        for path, path_regex, method, callback in endpoints
        if any(path.startswith(prefix) for prefix in _LLM_PATH_PREFIXES)
    ]


def llm_schema_postprocessing_hook(result, generator, request, public, **kwargs):
    """Replace all security schemes with agentAuth only and set document-level security."""
    result.setdefault("components", {})
    result["components"]["securitySchemes"] = {"agentAuth": _AGENT_AUTH_SCHEME}
    result["security"] = [{"agentAuth": []}]
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
