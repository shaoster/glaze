"""
Standalone piece image crop service for remote offloading.
Can be deployed to Modal.com or run locally.

Deployment (Modal):
    1. Set up a secret named 'piece-image-crop-secret' with 'AUTH_TOKEN'
    2. modal deploy tools/piece_image_crop_service.py

Usage (Local):
    pip install fastapi uvicorn rembg onnxruntime pillow pillow-heif
    uvicorn tools.piece_image_crop_service:fastapi_app --port 8080
"""

import io
import logging
import os

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# --- Modal Configuration ---
try:
    import modal

    image = (
        modal.Image.debian_slim()
        .pip_install(
            "fastapi",
            "uvicorn",
            "rembg",
            "onnxruntime",
            "pillow",
            "pillow-heif",
            "requests",
        )
        # Pre-download the model into the image to reduce cold start latency
        # We use the full 'u2net' model for better accuracy than the 'u2netp' lite version.
        .run_commands(
            "python -c \"from rembg import new_session; new_session('u2net')\""
        )
    )

    # We use a secret to protect the endpoint
    secret = modal.Secret.from_name("piece-image-crop-secret")

    app = modal.App("piece-image-crop-service", image=image, secrets=[secret])

    @app.function()
    @modal.asgi_app(label="crop")
    def web():
        return create_app()

except ImportError:
    app = None


def create_app():
    """Factory to create the FastAPI app with heavy imports deferred."""
    import requests
    from fastapi import FastAPI, Header, HTTPException, Request, Response
    from PIL import Image, ImageOps
    from pillow_heif import register_heif_opener
    from rembg import new_session, remove
    from requests.adapters import HTTPAdapter
    from urllib3.util import Retry

    # Register HEIF support (HEIC conversion handled here)
    register_heif_opener()

    fastapi_instance = FastAPI(title="Piece Image Crop Service")

    # Using the full u2net model for improved accuracy (higher memory but better edge detection)
    _SESSION = new_session("u2net")

    # Simple token-based auth
    EXPECTED_TOKEN = os.environ.get("AUTH_TOKEN")

    async def verify_auth(x_api_key: str):
        if EXPECTED_TOKEN and x_api_key != EXPECTED_TOKEN:
            raise HTTPException(status_code=403, detail="Invalid API Key")

    def download_with_retry(url: str, timeout: int = 30, max_retries: int = 3):
        session = requests.Session()
        retry_strategy = Retry(
            total=max_retries,
            backoff_factor=1,
            status_forcelist=[429, 500, 502, 503, 504],
            # Handle ConnectionResetError / ProtocolError
            raise_on_status=True,
        )
        adapter = HTTPAdapter(max_retries=retry_strategy)
        session.mount("https://", adapter)
        session.mount("http://", adapter)

        resp = session.get(url, timeout=timeout)
        resp.raise_for_status()
        return resp.content

    @fastapi_instance.post("/")
    async def detect_crop(request: Request, x_api_key: str = Header(None)):
        """Receive image bytes OR a URL and return a relative crop box."""
        await verify_auth(x_api_key)

        content_type = request.headers.get("Content-Type")

        try:
            if content_type == "application/json":
                # Handle URL-based request
                data = await request.json()
                url = data.get("url")
                if not url:
                    return Response(content="Missing url in JSON", status_code=400)
                logger.info(f"Downloading image from URL: {url}")
                image_bytes = download_with_retry(url)
            else:
                # Handle raw bytes
                image_bytes = await request.body()

            if not image_bytes:
                return Response(content="Empty image data", status_code=400)

            # HEIC -> JPG/RGBA conversion happens during Image.open thanks to register_heif_opener
            input_image = Image.open(io.BytesIO(image_bytes))
            input_image = ImageOps.exif_transpose(input_image)

            # Implementation Detail: Optimized resizing for ML processing.
            # We downscale to a reasonable max dimension to save memory and speed up rembg.
            MAX_DIM = 1600
            if max(input_image.size) > MAX_DIM:
                logger.info(f"Resizing from {input_image.size} to max {MAX_DIM}")
                input_image.thumbnail((MAX_DIM, MAX_DIM), Image.Resampling.LANCZOS)

            width, height = input_image.size

            # 1. Remove background
            logger.info(f"Processing image: {width}x{height}")
            output_image = remove(input_image, session=_SESSION)

            # 2. Find non-transparent bounds
            output_image = output_image.convert("RGBA")
            alpha = output_image.getchannel("A")
            bbox = alpha.getbbox()

            if not bbox:
                logger.info("No subject detected.")
                return {"x": 0, "y": 0, "width": 0, "height": 0}

            left, upper, right, lower = bbox

            # 3. Apply Padding to prevent "aggressive" cropping
            # We add 10% of the subject's dimensions as a safety margin.
            subj_w = right - left
            subj_h = lower - upper
            pad_w = int(subj_w * 0.10)
            pad_h = int(subj_h * 0.10)

            left = max(0, left - pad_w)
            upper = max(0, upper - pad_h)
            right = min(width, right + pad_w)
            lower = min(height, lower + pad_h)

            # 4. Return relative coordinates
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
        return {"status": "ok", "model": "u2net"}

    return fastapi_instance


# --- Local Entry Point ---
# NOTE: Do NOT call create_app() at module level — heavy deps (rembg, fastapi)
# may not be present in the importing process's environment.  When run via
# `bazel run //tools:piece_image_crop_service`, __main__ is the entry point.
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(create_app(), host="0.0.0.0", port=8080)
