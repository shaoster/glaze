# Glaze Tools

This directory contains standalone tools and utility services used by PotterDoc.

## Remote Piece Image Segment Offloading (Modal)

To maintain stability on hardware with <1GB RAM, Glaze supports offloading the heavy `rembg` background removal task to a serverless microservice.

- **Optimized Dispatch**: The system offloads the **Cloudinary URL** directly to the remote service. This ensures the production host does not have to download or process the image bytes, saving bandwidth and memory.
- **Security**: The service is secured with an API Key (`X-API-Key`) validated against a `modal.Secret`.
- **Local Fallback**: If `REMOTE_REMBG_URL` is not configured, the system falls back to a local `u2netp` model with 640px downscaling.

#### Step 1: Deploy the Microservice (Run from your LOCAL machine)
1.  **Set up Auth Token**: Create a Modal secret named `piece-image-segment-secret` with an `AUTH_TOKEN` key.
2.  **Install Modal**: `bazel run @uv//:uv -- tool install modal`
3.  **Authenticate**: `modal setup`
4.  **Deploy**: `modal deploy services/piece_image_segment_service.py`
5.  **Capture the URL**: The output will provide a permanent URL, e.g., `https://your-workspace-name--crop.modal.run`.

#### Step 2: Configure the Backend (Run on the PRODUCTION host / Droplet)
Update your production `.env` file with the following variables:

| Variable | Description |
| :--- | :--- |
| `REMOTE_REMBG_URL` | The URL of your deployed Modal service (e.g. `https://phil--crop.modal.run`). |
| `MODAL_AUTH_TOKEN` | The secure token you generated for the `piece-image-segment-secret`. |

```bash
# Example .env additions
REMOTE_REMBG_URL="https://your-workspace-name--crop.modal.run"
MODAL_AUTH_TOKEN="your-secure-random-token"
```

2.  **Restart Service**: 
    ```bash
    cd ~/glaze
    docker compose up -d
    ```

## Glaze Import Tool

The **Glaze Import Tool** at `/tools/glaze-import` is a browser-based admin workflow for seeding the public `GlazeType` and `GlazeCombination` libraries from physical test-tile photographs (JPEG, PNG, or HEIC via Cloudinary). It replaces manual admin entry for bulk imports.

> Only staff users (`is_staff = True`) can access this tool.

### The five-step flow

1. **Upload** — drag-and-drop or select source images from disk, or use the Cloudinary widget for HEIC/HEIF files (Cloudinary converts them to JPEG automatically).
2. **Crop** — draw a rotatable square crop box over each image. The box may extend beyond the image boundary; overflow becomes transparent. A live preview updates after 200 ms of inactivity.
3. **OCR** — optionally draw a rotatable OCR region box on the crop preview to focus text extraction. Click **Run OCR For All Records** — Tesseract reads each region and auto-fills the name, glaze kind, first/second glaze, runs, and food-safe fields. OCR understands structured labels (`1st Glaze: …` / `2nd Glaze: …`) and annotation lines (`CAUTION: RUNS`, `NOT FOOD SAFE`).
4. **Review** — verify and correct each record's parsed fields, then check the **Reviewed** box. Combination names are auto-computed as `<first>!<second>` and are read-only.
5. **Import** — sends all reviewed records and compressed crop images to the backend. A per-record progress list tracks each file; results show admin links to every created object.

If any records are skipped as duplicates, a **6. Reconcile** tab appears with the scraped fields and a direct link to the existing admin record.

### What the import creates

| Record kind         | Created objects                                                                                                           |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `glaze_type`        | Public `GlazeType` + a matching single-layer public `GlazeCombination`                                                    |
| `glaze_combination` | Public `GlazeCombination` with two ordered layers (both referenced `GlazeType` rows must already exist as public records) |

`runs` and `is_food_safe` parsed from OCR are written to both `GlazeType` and `GlazeCombination` on creation.
