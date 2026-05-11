"""
Standalone piece image crop service for remote offloading.
Can be deployed to Modal.com or run locally.

Deployment (Modal):
    1. Set up a secret named 'piece-image-crop-secret' with 'AUTH_TOKEN'
    2. modal deploy tools/piece_image_crop_service.py

Usage (Local):
    pip install fastapi uvicorn rembg onnxruntime pillow
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
        .pip_install("fastapi", "uvicorn", "rembg", "onnxruntime", "pillow", "requests")
        # Pre-download the model into the image to reduce cold start latency
        .run_commands("python -c \"from rembg import new_session; new_session('u2netp')\"")
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
    from fastapi import FastAPI, Request, Response, Header, HTTPException
    from PIL import Image
    from rembg import new_session, remove
    import requests

    fastapi_instance = FastAPI(title="Piece Image Crop Service")
    _SESSION = new_session("u2netp")
    
    # Simple token-based auth
    EXPECTED_TOKEN = os.environ.get("AUTH_TOKEN")

    async def verify_auth(x_api_key: str):
        if EXPECTED_TOKEN and x_api_key != EXPECTED_TOKEN:
            raise HTTPException(status_code=403, detail="Invalid API Key")

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
                resp = requests.get(url, timeout=20)
                resp.raise_for_status()
                image_bytes = resp.content
            else:
                # Handle raw bytes
                image_bytes = await request.body()
                
            if not image_bytes:
                return Response(content="Empty image data", status_code=400)

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
try:
    fastapi_app = create_app()
except ImportError:
    fastapi_app = None

if __name__ == "__main__":
    import uvicorn
    if fastapi_app:
        uvicorn.run(fastapi_app, host="0.0.0.0", port=8080)
    else:
        print("Required packages (fastapi, rembg, pillow) not installed locally.")
