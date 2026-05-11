"""
Standalone rembg microservice for remote offloading.
Can be deployed to Modal.com or run locally.

Usage (Local):
    pip install fastapi uvicorn rembg onnxruntime pillow
    uvicorn tools.remote_rembg_service:fastapi_app --port 8080

Usage (Modal):
    pip install modal
    modal setup
    modal deploy tools/remote_rembg_service.py
"""

import io
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Modal Configuration ---
try:
    import modal

    image = (
        modal.Image.debian_slim()
        .pip_install("fastapi", "uvicorn", "rembg", "onnxruntime", "pillow")
        # Pre-download the model into the image to reduce cold start latency
        .run_commands("python -c \"from rembg import new_session; new_session('u2netp')\"")
    )
    # Modal CLI looks for a variable named 'app' by default.
    app = modal.App("glaze-rembg", image=image)

    @app.function()
    @modal.asgi_app()
    def web():
        return create_app()

except ImportError:
    app = None


def create_app():
    """Factory to create the FastAPI app with heavy imports deferred."""
    from fastapi import FastAPI, Request, Response
    from PIL import Image
    from rembg import new_session, remove

    fastapi_instance = FastAPI(title="Glaze Remote rembg Service")
    _SESSION = new_session("u2netp")

    @fastapi_instance.post("/")
    async def detect_crop(request: Request):
        """Receive image bytes and return a relative crop box."""
        image_bytes = await request.body()
        if not image_bytes:
            return Response(content="Empty body", status_code=400)

        try:
            input_image = Image.open(io.BytesIO(image_bytes))
            width, height = input_image.size

            # 1. Remove background
            logger.info(f"Processing image: {width}x{height}")
            output_image = remove(input_image, session=_SESSION)

            # 2. Find non-transparent bounds
            alpha = output_image.getchannel("A")
            bbox = alpha.getbbox()

            if not bbox:
                logger.info("No subject detected.")
                return {"x": 0, "y": 0, "width": 0, "height": 0}

            left, upper, right, lower = bbox

            # 3. Return relative coordinates
            return {
                "x": left / width,
                "y": upper / height,
                "width": (right - left) / width,
                "height": (lower - upper) / height,
            }
        except Exception as e:
            logger.exception("Error processing image")
            return Response(content=str(e), status_code=500)

    @fastapi_instance.get("/health")
    def health():
        return {"status": "ok", "model": "u2netp"}

    return fastapi_instance


# --- Local Entry Point ---
# We wrap this in a try-except so 'modal deploy' doesn't fail if
# fastapi/rembg aren't installed locally.
try:
    fastapi_app = create_app()
except ImportError:
    # This will be triggered during 'modal deploy' on a machine
    # without the heavy dependencies. That's fine as Modal uses
    # the 'web' function above.
    fastapi_app = None

if __name__ == "__main__":
    import uvicorn

    if fastapi_app:
        uvicorn.run(fastapi_app, host="0.0.0.0", port=8080)
    else:
        print("Required packages (fastapi, rembg, pillow) not installed locally.")
