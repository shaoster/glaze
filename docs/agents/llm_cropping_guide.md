# LLM Image Cropping Guide

This guide explains how to translate natural-language crop instructions into valid
`PATCH /api/images/{image_id}/crop/` calls for PotterDoc.

## Coordinate System

Crop coordinates are **normalized floats** in the range `[0.0, 1.0]`:

- `(0.0, 0.0)` is the **top-left** corner of the image.
- `(1.0, 1.0)` is the **bottom-right** corner.
- The Y axis increases **downward**.

The crop field has four components:

```json
{
  "x": 0.1,
  "y": 0.05,
  "width": 0.8,
  "height": 0.9
}
```

| Field    | Meaning                              |
|----------|--------------------------------------|
| `x`      | Left edge of the crop box            |
| `y`      | Top edge of the crop box             |
| `width`  | Horizontal extent of the crop box    |
| `height` | Vertical extent of the crop box      |

### Boundary Rules (enforced server-side)

- All four fields must be in `[0.0, 1.0]`.
- `width` and `height` must be `> 0`.
- `x + width <= 1.0`
- `y + height <= 1.0`

## Reading the Current Crop and Image Dimensions

Call `GET /api/pieces/{piece_id}/current_state/` and inspect the `images` array:

```json
{
  "images": [
    {
      "image_id": "...",
      "width": 3024,
      "height": 4032,
      "crop": { "x": 0.1, "y": 0.05, "width": 0.8, "height": 0.9 },
      "cropped_url": "..."
    }
  ]
}
```

`width` and `height` are the raw pixel dimensions of the original image. Use them to
compute the aspect ratio when needed. The `crop` field is the current bounding box.

If `crop` is `null`, the full image is used: `{"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0}`.

## Standard Transform Recipes

Let `cx`, `cy`, `cw`, `ch` be the current crop values.

### Shift Up ("crop closer to the top", "move up")

Reduce `y` by a step (e.g. `0.05`), keep everything else unchanged.

```
y_new = max(0.0, cy - step)
```

```json
{ "x": cx, "y": y_new, "width": cw, "height": ch }
```

### Shift Down ("pan down", "show more of the bottom")

```
y_new = min(1.0 - ch, cy + step)
```

### Shift Left ("pan left")

```
x_new = max(0.0, cx - step)
```

### Shift Right ("pan right")

```
x_new = min(1.0 - cw, cx + step)
```

### Zoom In ("zoom in", "get closer", "crop tighter")

Reduce `width` and `height` by a factor (e.g. 15%), then recompute `x` and `y`
to keep the **center point** fixed:

```
w_new = cw * (1 - factor)     # e.g. factor = 0.15
h_new = ch * (1 - factor)
x_new = cx + (cw - w_new) / 2
y_new = cy + (ch - h_new) / 2
```

Clamp all values to `[0.0, 1.0]` and ensure `w_new > 0`, `h_new > 0`.

### Zoom Out ("zoom out", "show more", "pull back")

Increase `width` and `height` by a factor (e.g. 15%), then recompute `x` and `y`
to preserve the center, capping at image boundaries:

```
w_new = min(1.0, cw * (1 + factor))
h_new = min(1.0, ch * (1 + factor))
x_new = max(0.0, min(1.0 - w_new, cx - (w_new - cw) / 2))
y_new = max(0.0, min(1.0 - h_new, cy - (h_new - ch) / 2))
```

## Concrete Examples

### Example 1: Shift Up

Current crop: `{"x": 0.1, "y": 0.3, "width": 0.8, "height": 0.6}`
Instruction: "crop a little higher"
Step: `0.08`

```
y_new = max(0.0, 0.3 - 0.08) = 0.22
```

Result:
```json
{ "x": 0.1, "y": 0.22, "width": 0.8, "height": 0.6 }
```

### Example 2: Zoom In

Current crop: `{"x": 0.05, "y": 0.1, "width": 0.9, "height": 0.8}`
Instruction: "zoom in on the rim"
Factor: `0.20`

```
w_new = 0.9 * 0.8 = 0.72
h_new = 0.8 * 0.8 = 0.64
x_new = 0.05 + (0.9 - 0.72) / 2 = 0.05 + 0.09 = 0.14
y_new = 0.1  + (0.8 - 0.64) / 2 = 0.1  + 0.08 = 0.18
```

Result:
```json
{ "x": 0.14, "y": 0.18, "width": 0.72, "height": 0.64 }
```

### Example 3: Zoom Out from a tight crop

Current crop: `{"x": 0.3, "y": 0.3, "width": 0.4, "height": 0.4}`
Instruction: "show more of the piece"
Factor: `0.25`

```
w_new = min(1.0, 0.4 * 1.25) = 0.5
h_new = min(1.0, 0.4 * 1.25) = 0.5
x_new = max(0.0, min(0.5, 0.3 - (0.5 - 0.4) / 2)) = max(0.0, min(0.5, 0.25)) = 0.25
y_new = max(0.0, min(0.5, 0.3 - (0.5 - 0.4) / 2)) = 0.25
```

Result:
```json
{ "x": 0.25, "y": 0.25, "width": 0.5, "height": 0.5 }
```

## Applying the Crop

```
PATCH /api/images/{image_id}/crop/
Authorization: Bearer pdagent_<token>
Content-Type: application/json

{ "x": 0.14, "y": 0.18, "width": 0.72, "height": 0.64 }
```

The response is the full piece detail (`200 OK`) with the updated crop and a
background task queued to generate the cropped derivative. The `cropped_url` field
will be populated once the task completes.

## Choosing a Step Size

| Instruction magnitude  | Suggested step / factor |
|------------------------|-------------------------|
| "a little", "slightly" | `0.05` / `0.10`         |
| (no qualifier)         | `0.10` / `0.15`         |
| "a lot", "much more"   | `0.20` / `0.25`         |
