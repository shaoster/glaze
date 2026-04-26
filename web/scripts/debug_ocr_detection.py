#!/usr/bin/env python3
"""
Debug script for the Kadane-2D OCR label detection algorithm.

Usage:
    python3 web/scripts/debug_ocr_detection.py <image_file>

Outputs a PNG showing:
  - the downsampled analysis grid
  - the detected label rectangle (green)
  - the detected text bounding box (red)
  - the bottom-third search boundary (blue dashed)
"""

import sys
from pathlib import Path
from PIL import Image, ImageDraw
import math

# ── Tuneable constants (mirror GlazeImportToolPage.tsx) ──────────────────────
ANALYSIS_SIZE = 128
LABEL_WHITE_THRESHOLD = 0.75   # phase-1: catch pink/salmon labels (~0.80 lum)
TEXT_DARK_THRESHOLD   = 0.50   # phase-2: also catches coloured text (red ~0.45)
WHITE_SCORE           = 1.0
NONWHITE_PENALTY      = -0.4
TEXT_PAD              = 3
MIN_LABEL_FRACTION    = 0.1
# ─────────────────────────────────────────────────────────────────────────────

def luminance(r, g, b):
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255.0

def run_detection(img_path: str):
    src = Image.open(img_path).convert("RGB")
    # Square-crop from centre (mirrors defaultCrop heuristic)
    w, h = src.size
    side = min(w, h)
    left = (w - side) // 2
    top  = (h - side) // 2
    src  = src.crop((left, top, left + side, top + side))

    N = ANALYSIS_SIZE
    small = src.resize((N, N), Image.LANCZOS)
    pixels = list(small.getdata())   # list of (r,g,b)

    bright = [0.0] * (N * N)
    score  = [0.0] * (N * N)
    for i, (r, g, b) in enumerate(pixels):
        lum = luminance(r, g, b)
        bright[i] = lum
        score[i]  = WHITE_SCORE if lum >= LABEL_WHITE_THRESHOLD else NONWHITE_PENALTY

    row_search_start = math.floor(N * 2 / 3)

    # Kadane 2D restricted to bottom third
    best_total = 0.0
    label_r1, label_r2 = row_search_start, N - 1
    label_c1, label_c2 = 0, N - 1
    found_label = False

    col_sum = [0.0] * N
    for r1 in range(row_search_start, N):
        col_sum = [0.0] * N
        for r2 in range(r1, N):
            row_off = r2 * N
            for c in range(N):
                col_sum[c] += score[row_off + c]

            # 1-D Kadane
            cur_total = 0.0
            cur_c1 = 0
            for c in range(N):
                if cur_total <= 0:
                    cur_total = 0.0
                    cur_c1 = c
                cur_total += col_sum[c]
                if cur_total > best_total:
                    best_total = cur_total
                    label_r1, label_r2 = r1, r2
                    label_c1, label_c2 = cur_c1, c
                    found_label = True

    print(f"Analysis grid: {N}×{N}")
    print(f"Bottom-third starts at row: {row_search_start}")
    print(f"Found label: {found_label}  score={best_total:.1f}")
    if found_label:
        print(f"  Label rect (grid px): r=[{label_r1},{label_r2}] c=[{label_c1},{label_c2}]")
        row_span = label_r2 - label_r1
        col_span = label_c2 - label_c1
        print(f"  Row span {row_span} (min {N*MIN_LABEL_FRACTION:.0f}), "
              f"col span {col_span} (min {N*MIN_LABEL_FRACTION:.0f})")
        if row_span < N * MIN_LABEL_FRACTION or col_span < N * MIN_LABEL_FRACTION:
            print("  → REJECTED (too small) → using defaultOcrRegion")
            found_label = False

    # Phase 2: text bounding box within label rect
    found_text = False
    t_min_x, t_max_x = label_c2, label_c1
    t_min_y, t_max_y = label_r2, label_r1
    if found_label:
        for y in range(label_r1, label_r2 + 1):
            for x in range(label_c1, label_c2 + 1):
                if bright[y * N + x] < TEXT_DARK_THRESHOLD:
                    t_min_x = min(t_min_x, x)
                    t_max_x = max(t_max_x, x)
                    t_min_y = min(t_min_y, y)
                    t_max_y = max(t_max_y, y)
                    found_text = True
        print(f"Found text pixels: {found_text}")
        if found_text:
            pad = TEXT_PAD
            rx_min = max(label_c1, t_min_x - pad)
            rx_max = min(label_c2, t_max_x + pad)
            ry_min = max(label_r1, t_min_y - pad)
            ry_max = min(label_r2, t_max_y + pad)
            print(f"  Text bbox (grid px): r=[{ry_min},{ry_max}] c=[{rx_min},{rx_max}]")

    # ── Visualisation ────────────────────────────────────────────────────────
    scale = 8   # blow the 128-px grid up to 1024 px for visibility
    vis_size = N * scale
    vis = small.resize((vis_size, vis_size), Image.NEAREST)
    draw = ImageDraw.Draw(vis)

    def grid_rect(r1, c1, r2, c2, colour, width=2):
        draw.rectangle(
            [c1 * scale, r1 * scale, (c2 + 1) * scale - 1, (r2 + 1) * scale - 1],
            outline=colour, width=width,
        )

    # Blue line: bottom-third boundary
    y_line = row_search_start * scale
    draw.line([(0, y_line), (vis_size, y_line)], fill=(0, 100, 255), width=2)

    if found_label:
        grid_rect(label_r1, label_c1, label_r2, label_c2, (0, 220, 0), width=3)
    if found_text:
        grid_rect(ry_min, rx_min, ry_max, rx_max, (255, 50, 50), width=2)

    # Also overlay a brightness heatmap channel (optional) — skip for clarity.

    out_path = Path(img_path).with_suffix(".debug.png")
    vis.save(out_path)
    print(f"\nVisualization saved to: {out_path}")
    print("  Blue line  = bottom-third boundary")
    print("  Green rect = detected label rectangle")
    print("  Red rect   = detected text bounding box")

    # Print luminance stats for bottom third to help tune thresholds
    bottom_lums = [bright[r * N + c]
                   for r in range(row_search_start, N)
                   for c in range(N)]
    bottom_lums.sort(reverse=True)
    n = len(bottom_lums)
    print(f"\nLuminance stats for bottom third ({n} pixels):")
    for pct in (1, 5, 10, 25, 50):
        idx = max(0, int(n * pct / 100) - 1)
        print(f"  top {pct:2d}% brightest: {bottom_lums[idx]:.3f}")
    print(f"  Current LABEL_WHITE_THRESHOLD = {LABEL_WHITE_THRESHOLD}")
    # Count pixels that would score positive
    positive = sum(1 for l in bottom_lums if l >= LABEL_WHITE_THRESHOLD)
    print(f"  Pixels scoring positive: {positive}/{n} ({100*positive/n:.1f}%)")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python3 web/scripts/debug_ocr_detection.py <image_file>")
        sys.exit(1)
    run_detection(sys.argv[1])
