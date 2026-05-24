#!/usr/bin/env python3
"""Validate devices/manifest.json before generators consume it."""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parent.parent
DEVICE_MANIFEST = ROOT / "devices" / "manifest.json"
COMMON_ASSETS = ROOT / "common" / "assets"
DEVICES_DIR = ROOT / "devices"

VALID_ROTATIONS = {"0", "90", "180", "270"}
REQUIRED_FONT_ROLES = (
    "icon",
    "sensor",
    "largeSensor",
    "mediaTitle",
    "volumeNumber",
    "volumeLabel",
)
FONT_ID_RE = re.compile(r"^\s+id:\s+([A-Za-z0-9_]+)\s*$", re.MULTILINE)


def rel(path: Path) -> str:
    return str(path.relative_to(ROOT))


def load_json(path: Path) -> Any:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def font_ids_from(path: Path) -> set[str]:
    if not path.exists():
        return set()
    return set(FONT_ID_RE.findall(path.read_text(encoding="utf-8")))


def common_font_ids() -> set[str]:
    ids: set[str] = set()
    for path in sorted(COMMON_ASSETS.glob("*.yaml")):
        ids.update(font_ids_from(path))
    return ids


def is_positive_int(value: Any) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value > 0


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def device_error(slug: str, message: str) -> str:
    return f"{slug}: {message}"


def require_object(slug: str, errors: list[str], value: Any, name: str) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        errors.append(device_error(slug, f"{name} must be an object"))
        return None
    return value


def validate_layout(slug: str, device: dict[str, Any], errors: list[str]) -> None:
    layout = require_object(slug, errors, device.get("layout"), "layout")
    if layout is None:
        return

    slots = device.get("slots")
    if not is_positive_int(slots):
        errors.append(device_error(slug, "slots must be a positive integer"))

    for key in ("cols", "rows"):
        if not is_positive_int(layout.get(key)):
            errors.append(device_error(slug, f"layout.{key} must be a positive integer"))

    if "portraitCols" in layout and not is_positive_int(layout.get("portraitCols")):
        errors.append(device_error(slug, "layout.portraitCols must be a positive integer when set"))

    firmware_grid = layout.get("firmwareGrid")
    if not isinstance(firmware_grid, str) or not re.fullmatch(r"[1-9]\d*x[1-9]\d*", firmware_grid):
        errors.append(device_error(slug, "layout.firmwareGrid must look like '3x5'"))

    if is_positive_int(slots) and is_positive_int(layout.get("cols")) and is_positive_int(layout.get("rows")):
        expected_slots = layout["cols"] * layout["rows"]
        if slots != expected_slots:
            errors.append(
                device_error(
                    slug,
                    f"slots must equal layout.cols * layout.rows ({slots} != {expected_slots})",
                )
            )


def validate_fonts(
    slug: str,
    device: dict[str, Any],
    shared_font_ids: set[str],
    errors: list[str],
) -> None:
    firmware = require_object(slug, errors, device.get("firmware"), "firmware")
    if firmware is None:
        return
    fonts = require_object(slug, errors, firmware.get("fonts"), "firmware.fonts")
    if fonts is None:
        return

    available_ids = set(shared_font_ids)
    available_ids.update(font_ids_from(DEVICES_DIR / slug / "device" / "fonts.yaml"))

    for role in REQUIRED_FONT_ROLES:
        value = fonts.get(role)
        if not isinstance(value, str) or not value:
            errors.append(device_error(slug, f"firmware.fonts.{role} must be a non-empty font id"))

    for role, font_id in sorted(fonts.items()):
        if not isinstance(font_id, str) or not font_id:
            errors.append(device_error(slug, f"firmware.fonts.{role} must be a non-empty font id"))
        elif font_id not in available_ids:
            errors.append(device_error(slug, f"firmware.fonts.{role} references unknown font id {font_id!r}"))


def validate_rotation(slug: str, device: dict[str, Any], errors: list[str]) -> None:
    if "rotation" not in device:
        return

    rotation = require_object(slug, errors, device.get("rotation"), "rotation")
    if rotation is None:
        return

    if not isinstance(rotation.get("enabled"), bool):
        errors.append(device_error(slug, "rotation.enabled must be true or false"))

    options = rotation.get("options")
    if not isinstance(options, list) or not options:
        errors.append(device_error(slug, "rotation.options must be a non-empty list"))
    else:
        seen: set[str] = set()
        for option in options:
            if not isinstance(option, str) or option not in VALID_ROTATIONS:
                errors.append(
                    device_error(
                        slug,
                        "rotation.options may only contain '0', '90', '180', and '270'",
                    )
                )
            elif option in seen:
                errors.append(device_error(slug, f"rotation.options contains duplicate value {option!r}"))
            seen.add(option)

    if "displayOffset" in rotation and not is_number(rotation["displayOffset"]):
        errors.append(device_error(slug, "rotation.displayOffset must be a number when set"))


def validate_internal_relays(slug: str, device: dict[str, Any], errors: list[str]) -> None:
    if "internalRelays" not in device:
        return

    relays = device.get("internalRelays")
    if not isinstance(relays, list):
        errors.append(device_error(slug, "internalRelays must be a list"))
        return

    keys: set[str] = set()
    for index, relay in enumerate(relays, start=1):
        prefix = f"internalRelays[{index}]"
        if not isinstance(relay, dict):
            errors.append(device_error(slug, f"{prefix} must be an object"))
            continue
        key = relay.get("key")
        label = relay.get("label")
        if not isinstance(key, str) or not key:
            errors.append(device_error(slug, f"{prefix}.key must be a non-empty string"))
        elif key in keys:
            errors.append(device_error(slug, f"internalRelays contains duplicate key {key!r}"))
        else:
            keys.add(key)
        if not isinstance(label, str) or not label:
            errors.append(device_error(slug, f"{prefix}.label must be a non-empty string"))


def validate_package(slug: str, device: dict[str, Any], errors: list[str]) -> None:
    firmware = device.get("firmware")
    if not isinstance(firmware, dict):
        return

    package = require_object(slug, errors, firmware.get("package"), "firmware.package")
    if package is None:
        return

    substitutions = package.get("substitutions")
    if not isinstance(substitutions, dict) or not substitutions:
        errors.append(device_error(slug, "firmware.package.substitutions must be a non-empty object"))
    else:
        for key, value in sorted(substitutions.items()):
            if not isinstance(key, str) or not key:
                errors.append(device_error(slug, "firmware.package.substitutions keys must be non-empty strings"))
            if not isinstance(value, str) or not value:
                errors.append(device_error(slug, f"firmware.package.substitutions.{key} must be a non-empty string"))

    if package.get("ethernetSelectable"):
        frequencies = require_object(
            slug,
            errors,
            package.get("backlightPwmFrequency"),
            "firmware.package.backlightPwmFrequency",
        )
        if frequencies is not None:
            for key in ("wifi", "ethernet"):
                if not isinstance(frequencies.get(key), str) or not frequencies.get(key):
                    errors.append(
                        device_error(
                            slug,
                            f"firmware.package.backlightPwmFrequency.{key} must be a non-empty string",
                        )
                    )


def validate_manifest(data: Any, shared_font_ids: set[str]) -> list[str]:
    errors: list[str] = []
    if not isinstance(data, dict):
        return [f"{rel(DEVICE_MANIFEST)} must contain a JSON object"]

    devices = data.get("devices")
    if not isinstance(devices, dict) or not devices:
        return [f"{rel(DEVICE_MANIFEST)} must contain a non-empty devices object"]

    for slug, device in sorted(devices.items()):
        if not isinstance(slug, str) or not slug:
            errors.append("device keys must be non-empty strings")
            continue
        if not isinstance(device, dict):
            errors.append(device_error(slug, "device entry must be an object"))
            continue
        validate_layout(slug, device, errors)
        validate_fonts(slug, device, shared_font_ids, errors)
        validate_rotation(slug, device, errors)
        validate_internal_relays(slug, device, errors)
        validate_package(slug, device, errors)

    return errors


def main() -> int:
    try:
        data = load_json(DEVICE_MANIFEST)
    except json.JSONDecodeError as exc:
        print(f"ERROR: {rel(DEVICE_MANIFEST)} is not valid JSON: {exc}")
        return 1

    errors = validate_manifest(data, common_font_ids())
    if errors:
        print(f"ERROR: {rel(DEVICE_MANIFEST)} failed validation:")
        for error in errors:
            print(f"  - {error}")
        return 1

    print(f"{rel(DEVICE_MANIFEST)} passed validation.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
