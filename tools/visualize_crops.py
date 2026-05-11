"""
Visualize crop bounding boxes for a set of images.

Usage:
    # Test the 20 most recent DB images:
    bazel run //tools:visualize_crops

    # Test specific URLs directly (no DB needed):
    bazel run //tools:visualize_crops -- https://res.cloudinary.com/.../image.jpg https://...

    # Test against production Modal instead of local service:
    CROP_SERVICE_URL=https://shaoster--piece-image-crop-service-crop.modal.run \\
        bazel run //tools:visualize_crops -- https://...
"""

import argparse
import io
import os
import sys

import requests
from PIL import Image, ImageDraw

# Add the project root to the Python path (only used for DB mode)
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

CROP_SERVICE_URL = os.environ.get("CROP_SERVICE_URL", "http://localhost:8080")
AUTH_TOKEN = os.environ.get("MODAL_AUTH_TOKEN", "")


def process_url(url: str, output_dir: str, label: str) -> None:
    """Send one URL to the crop service, draw the bbox, and save the result."""
    print(f"\nProcessing {label} ...")

    try:
        resp = requests.post(
            CROP_SERVICE_URL,
            headers={"x-api-key": AUTH_TOKEN, "Content-Type": "application/json"},
            json={"url": url},
            timeout=60,
        )

        if resp.status_code != 200:
            print(f"  Failed: {resp.status_code} - {resp.text}")
            return

        bbox = resp.json()

        if bbox["width"] == 0 or bbox["height"] == 0:
            print("  No subject detected (empty crop).")
            return

        # Download the original image
        img_resp = requests.get(url, timeout=30)
        img = Image.open(io.BytesIO(img_resp.content))

        # Convert relative → absolute pixel coordinates
        w, h = img.size
        left = bbox["x"] * w
        top = bbox["y"] * h
        right = left + bbox["width"] * w
        bottom = top + bbox["height"] * h

        # Draw a thick red bounding box
        draw = ImageDraw.Draw(img)
        draw.rectangle([left, top, right, bottom], outline="red", width=5)

        output_path = os.path.join(output_dir, f"{label}_crop.jpg")
        img.save(output_path)
        print(f"  Saved → {output_path}")

    except Exception as e:
        print(f"  Error: {e}")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Visualize crop bounding boxes returned by the crop service."
    )
    parser.add_argument(
        "urls",
        nargs="*",
        metavar="URL",
        help="One or more raw image URLs to test. Omit to pull 20 recent images from the DB.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=20,
        help="Number of DB images to test when no URLs are provided (default: 20).",
    )
    args = parser.parse_args()

    output_dir = os.path.join(os.path.dirname(__file__), "crop_tests")
    os.makedirs(output_dir, exist_ok=True)

    print(f"Crop service: {CROP_SERVICE_URL}")

    if args.urls:
        # --- Direct URL mode: no DB needed ---
        print(f"Testing {len(args.urls)} URL(s) ...")
        for i, url in enumerate(args.urls):
            label = f"url_{i:03d}"
            process_url(url, output_dir, label)
    else:
        # --- DB mode: pull recent images ---
        os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")
        import django
        django.setup()
        from api.models import Image as ApiImage  # noqa: PLC0415

        images = ApiImage.objects.exclude(url="").order_by("-created")[: args.limit]
        if not images:
            print("No images found in the database.")
            return

        print(f"Testing {len(images)} DB image(s) ...")
        for pi in images:
            process_url(pi.url, output_dir, str(pi.id))


if __name__ == "__main__":
    main()
