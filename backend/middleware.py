from whitenoise.middleware import WhiteNoiseMiddleware


class AsyncCompatWhiteNoiseMiddleware(WhiteNoiseMiddleware):
    """WhiteNoise middleware that yields an async iterator for static file responses.

    WhiteNoise's FileResponse wraps file chunks in a synchronous map() iterator.
    Django's ASGI handler cannot async-iterate a sync iterator without emitting a
    StreamingHttpResponse warning (and falling back to synchronous consumption).
    This subclass converts the sync iterator to an async generator so ASGI serving
    is clean with no warning.
    """

    @staticmethod
    def serve(static_file, request):
        response = WhiteNoiseMiddleware.serve(static_file, request)
        sync_content = response.streaming_content

        async def _async_content():
            for chunk in sync_content:
                yield chunk

        response.streaming_content = _async_content()
        return response
