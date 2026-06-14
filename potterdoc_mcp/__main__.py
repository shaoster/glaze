"""Entry point: python -m potterdoc_mcp"""

import argparse

from potterdoc_mcp.server import mcp


def _build_http_app():
    from starlette.applications import Starlette
    from starlette.middleware import Middleware
    from starlette.middleware.base import BaseHTTPMiddleware
    from starlette.requests import Request
    from starlette.responses import JSONResponse, Response
    from starlette.routing import Mount, Route

    class BearerAuthMiddleware(BaseHTTPMiddleware):
        async def dispatch(self, request: Request, call_next) -> Response:
            if request.url.path.startswith("/mcp"):
                auth = request.headers.get("authorization", "")
                token = auth.removeprefix("Bearer ").removeprefix("bearer ").strip()
                if not token:
                    return JSONResponse(
                        {"detail": "Authorization Bearer token required."},
                        status_code=401,
                    )
            return await call_next(request)

    async def health(request: Request) -> JSONResponse:
        return JSONResponse({"status": "ok"})

    return Starlette(
        middleware=[Middleware(BearerAuthMiddleware)],
        routes=[
            Route("/health", health),
            Mount("/", mcp.streamable_http_app()),
        ],
    )


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--transport", choices=["stdio", "http"], default="stdio")
    args = parser.parse_args()

    if args.transport == "http":
        import uvicorn

        uvicorn.run(_build_http_app(), host="0.0.0.0", port=8080)
    else:
        mcp.run()


if __name__ == "__main__":
    main()
