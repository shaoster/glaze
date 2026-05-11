"""
Standalone rembg microservice for remote offloading.
Can be deployed to Google Cloud Run or Modal.com.

Usage:
    pip install fastapi uvicorn rembg onnxruntime pillow
    uvicorn remote_rembg_service:app --port 8080
"""

import io
import logging

from fastapi import FastAPI, Request, Response
from PIL import Image
from rembg import new_session, remove

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Glaze Remote rembg Service")

# Cache the session at the module level for reuse across requests.
# u2netp is recommended for speed and memory efficiency in serverless.
_SESSION = new_session("u2netp")


@app.post("/")
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


@app.get("/health")
def health():
    return {"status": "ok", "model": "u2netp"}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8080)

# ── Modal Deployment ─────────────────────────────────────────────────────────
# To deploy: modal deploy tools/remote_rembg_service.py

try:
    import modal

    image = (
        modal.Image.debian_slim()
        .pip_install("fastapi", "uvicorn", "rembg", "onnxruntime", "pillow")
        # Pre-download the model into the image to reduce cold start latency
        .run_commands("python -c \"from rembg import new_session; new_session('u2netp')\"")
    )
    modal_app = modal.App("glaze-rembg", image=image)

    @modal_app.function()
    @modal.asgi_app()
    def web():
        return app

except ImportError:
    pass
