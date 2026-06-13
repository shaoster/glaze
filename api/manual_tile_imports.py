from __future__ import annotations

from collections import Counter

from django.db import transaction

from . import r2
from .models import GlazeCombination, GlazeCombinationLayer, GlazeType
from .utils import (
    image_to_dict,
    normalize_image_payload,
    sync_glaze_type_singleton_combination,
)


def _require_r2() -> None:
    if not r2.is_r2_configured():
        raise ValueError("R2 object storage is not configured.")


def _ensure_combination_layers(
    combo: GlazeCombination, glaze_types: list[GlazeType]
) -> None:
    existing = list(combo.layers.select_related("glaze_type").order_by("order"))
    expected_ids = [glaze_type.id for glaze_type in glaze_types]
    existing_ids = [layer.glaze_type_id for layer in existing]
    if existing_ids == expected_ids and [layer.order for layer in existing] == list(
        range(len(glaze_types))
    ):
        return
    combo.layers.all().delete()
    for order, glaze_type in enumerate(glaze_types):
        GlazeCombinationLayer.objects.create(
            combination=combo, glaze_type=glaze_type, order=order
        )


# Public test seam for layer-order assertions in import tests.
ensure_combination_layers = _ensure_combination_layers


def _image_url(image: dict | None) -> str | None:
    """Extract the URL string from a test_tile_image dict value."""
    return (image_to_dict(image) or {}).get("url") if image else None


def _result_payload(
    record: dict,
    *,
    status: str,
    reason: str | None = None,
    object_id: str | None = None,
    image_url: str | None = None,
) -> dict:
    parsed = record.get("parsed_fields", {}) or {}
    return {
        "client_id": record.get("client_id", ""),
        "filename": record.get("filename", ""),
        "kind": parsed.get("kind", record.get("kind", "")),
        "name": parsed.get("name", ""),
        "status": status,
        "reason": reason,
        "object_id": object_id,
        "image_url": image_url,
    }


def import_manual_tile_records(
    records: list[dict],
    uploaded_files: dict[str, str],
) -> dict:
    _require_r2()
    results: list[dict] = []

    def import_glaze_type(record: dict) -> dict:
        parsed = record.get("parsed_fields", {}) or {}
        name = (parsed.get("name") or "").strip()
        client_id = record.get("client_id", "")
        uploaded = uploaded_files.get(client_id)
        if not name:
            return _result_payload(
                record, status="error", reason="Missing parsed glaze type name."
            )
        if not uploaded:
            return _result_payload(
                record, status="error", reason="Missing cropped image upload."
            )
        existing = GlazeType.objects.filter(user=None, name=name).first()
        if existing:
            return _result_payload(
                record,
                status="skipped_duplicate",
                reason="Public glaze type already exists.",
                object_id=str(existing.pk),
                image_url=_image_url(existing.test_tile_image),
            )

        image_url = r2.public_url_for_key(uploaded)
        glaze_type = GlazeType.objects.create(
            user=None,
            name=name,
            test_tile_image=normalize_image_payload({"url": image_url}),
            runs=parsed.get("runs"),
            is_food_safe=parsed.get("is_food_safe"),
        )
        sync_glaze_type_singleton_combination(glaze_type)
        return _result_payload(
            record,
            status="created",
            object_id=str(glaze_type.pk),
            image_url=_image_url(glaze_type.test_tile_image),
        )

    def import_glaze_combination(record: dict) -> dict:
        parsed = record.get("parsed_fields", {}) or {}
        name = (parsed.get("name") or "").strip()
        first_name = (parsed.get("first_glaze") or "").strip()
        second_name = (parsed.get("second_glaze") or "").strip()
        client_id = record.get("client_id", "")
        uploaded = uploaded_files.get(client_id)
        if not name:
            if first_name and second_name:
                name = f"{first_name}!{second_name}"
            else:
                return _result_payload(
                    record,
                    status="error",
                    reason="Missing parsed glaze combination name.",
                )
        if not first_name or not second_name:
            return _result_payload(
                record,
                status="error",
                reason="Glaze combinations require first and second glaze names.",
            )
        if not uploaded:
            return _result_payload(
                record, status="error", reason="Missing cropped image upload."
            )
        existing = GlazeCombination.objects.filter(user=None, name=name).first()
        if existing:
            return _result_payload(
                record,
                status="skipped_duplicate",
                reason="Public glaze combination already exists.",
                object_id=str(existing.pk),
                image_url=_image_url(existing.test_tile_image),
            )

        first = GlazeType.objects.filter(user=None, name=first_name).first()
        second = GlazeType.objects.filter(user=None, name=second_name).first()
        if first is None or second is None:
            missing = first_name if first is None else second_name
            return _result_payload(
                record,
                status="error",
                reason=f"Missing referenced public glaze type: {missing}.",
            )

        image_url = r2.public_url_for_key(uploaded)
        combo = GlazeCombination.objects.create(
            user=None,
            name=name,
            test_tile_image=normalize_image_payload({"url": image_url}),
            runs=parsed.get("runs"),
            is_food_safe=parsed.get("is_food_safe"),
        )
        _ensure_combination_layers(combo, [first, second])
        return _result_payload(
            record,
            status="created",
            object_id=str(combo.pk),
            image_url=_image_url(combo.test_tile_image),
        )

    with transaction.atomic():
        for record in [
            r
            for r in records
            if (r.get("parsed_fields", {}) or {}).get("kind") == "glaze_type"
        ]:
            results.append(import_glaze_type(record))
        for record in [
            r
            for r in records
            if (r.get("parsed_fields", {}) or {}).get("kind") == "glaze_combination"
        ]:
            results.append(import_glaze_combination(record))

    counts = Counter(result["status"] for result in results)
    created_type_count = sum(
        1
        for result in results
        if result["status"] == "created" and result["kind"] == "glaze_type"
    )
    created_combo_count = sum(
        1
        for result in results
        if result["status"] == "created" and result["kind"] == "glaze_combination"
    )
    return {
        "results": results,
        "summary": {
            "created_glaze_types": created_type_count,
            "created_glaze_combinations": created_combo_count,
            "skipped_duplicates": counts.get("skipped_duplicate", 0),
            "errors": counts.get("error", 0),
        },
    }
