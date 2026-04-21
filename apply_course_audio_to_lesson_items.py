#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
from pathlib import Path
from typing import Dict, List

from supabase import create_client

DEFAULT_MAP_PATH = Path("/Users/anthonykemmeugne/Desktop/dictionary-normalizer/course_audio_map.json")
DEFAULT_CONFIG_PATH = Path("/Users/anthonykemmeugne/Desktop/dictionary-normalizer/upload_courses_from_excel.py")


def load_service_credentials(config_path: Path) -> Dict[str, str]:
    text = config_path.read_text(encoding="utf-8")
    return {
        "SUPABASE_URL": re.search(r'SUPABASE_URL = "([^"]+)"', text).group(1),
        "SUPABASE_SERVICE_KEY": re.search(r'SERVICE_ROLE_KEY = "([^"]+)"', text).group(1),
    }


def load_map(path: Path) -> Dict[str, dict]:
    payload = json.loads(path.read_text(encoding="utf-8"))
    items = payload.get("items")
    if not isinstance(items, dict):
        raise ValueError("course_audio_map.json is missing an items object")
    return items


def build_updates(items: Dict[str, dict]) -> List[dict]:
    rows: List[dict] = []
    for lesson_item_id, audio in items.items():
        rows.append(
            {
                "id": int(lesson_item_id),
                "audio_url": audio.get("audio_url") or None,
                "audio_key": audio.get("audio_key") or None,
                "audio_source_cell": audio.get("audio_source_cell") or None,
                "example_audio_url": audio.get("example_audio_url") or None,
                "example_audio_key": audio.get("example_audio_key") or None,
                "example_audio_source_cell": audio.get("example_audio_source_cell") or None,
            }
        )
    return rows


def apply_updates(rows: List[dict], dry_run: bool) -> None:
    creds = load_service_credentials(DEFAULT_CONFIG_PATH)
    client = create_client(creds["SUPABASE_URL"], creds["SUPABASE_SERVICE_KEY"])

    if dry_run:
        print(f"Rows prepared: {len(rows)}")
        print("Dry run: True")
        print("Sample:", rows[:2])
        return

    for index, row in enumerate(rows, start=1):
        payload = {k: v for k, v in row.items() if k != "id"}
        client.table("lesson_items").update(payload).eq("id", row["id"]).execute()
        if index % 100 == 0:
            print(f"Updated {index}/{len(rows)} rows")

    print(f"Rows updated: {len(rows)}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Apply Lingala course audio URLs to lesson_items")
    parser.add_argument("--map", type=Path, default=DEFAULT_MAP_PATH)
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    rows = build_updates(load_map(args.map))
    apply_updates(rows, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
