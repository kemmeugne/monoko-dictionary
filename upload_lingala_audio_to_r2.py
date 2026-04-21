#!/usr/bin/env python3
"""
Upload Lingala audio files to Cloudflare R2 from the generated manifest.

Usage:
  python3 upload_lingala_audio_to_r2.py --manifest artifacts/lingala_audio/lingala_audio_manifest.json

Required env vars:
  R2_ACCOUNT_ID
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
  R2_BUCKET
  R2_PUBLIC_BASE_URL

Optional env vars:
  SUPABASE_URL
  SUPABASE_SERVICE_KEY

The script can either:
  1. upload files and emit a CSV of DB updates
  2. upload files and apply the DB updates directly with --apply-supabase
"""

from __future__ import annotations

import argparse
import csv
import json
import mimetypes
import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Dict, Iterable, List

try:
    import boto3
except ImportError:
    boto3 = None

try:
    from supabase import create_client
except ImportError:
    create_client = None


def load_manifest(path: Path) -> List[dict]:
    rows = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(rows, list):
        raise ValueError("Manifest JSON must be a list")
    return rows


def iter_uploadable_rows(rows: Iterable[dict], require_matched: bool) -> Iterable[dict]:
    for row in rows:
        if require_matched and row.get("db_match_status") != "matched":
            continue
        yield row


def create_r2_client():
    if boto3 is None:
        raise RuntimeError("boto3 is required for R2 uploads. Install it with: pip3 install boto3")

    account_id = os.environ["R2_ACCOUNT_ID"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def list_existing_keys(client, bucket: str, prefix: str) -> set:
    existing = set()
    token = None
    while True:
        kwargs = {"Bucket": bucket, "Prefix": prefix}
        if token:
            kwargs["ContinuationToken"] = token
        response = client.list_objects_v2(**kwargs)
        for item in response.get("Contents", []):
            existing.add(item["Key"])
        if not response.get("IsTruncated"):
            break
        token = response.get("NextContinuationToken")
    return existing


def upload_one(client, bucket: str, public_base_url: str, row: dict, dry_run: bool) -> dict:
    source_path = Path(row["audio_path"])
    object_key = row["object_key"]
    content_type = mimetypes.guess_type(source_path.name)[0] or "audio/mpeg"
    public_url = f"{public_base_url}/{object_key}"

    if not dry_run:
        client.upload_file(
            str(source_path),
            bucket,
            object_key,
            ExtraArgs={"ContentType": content_type},
        )

    return {
        "target_table": row["target_table"],
        "row_id": row["db_sense_id"] if row["target_table"] == "senses" else row["db_example_id"],
        "audio_url": public_url,
        "audio_key": object_key,
        "audio_source_cell": f"{row['workbook_letter']}.{row['source_cell']}",
        "source_file": row["audio_file"],
    }


def upload_rows(rows: Iterable[dict], dry_run: bool, skip_existing: bool, workers: int) -> List[dict]:
    bucket = os.environ["R2_BUCKET"]
    public_base_url = os.environ["R2_PUBLIC_BASE_URL"].rstrip("/")
    client = None if dry_run else create_r2_client()
    prefix = "Lingala/"
    existing_keys = set()
    if skip_existing and not dry_run:
        existing_keys = list_existing_keys(client, bucket, prefix)

    pending_rows = [row for row in rows if not existing_keys or row["object_key"] not in existing_keys]
    skipped_rows = [row for row in rows if existing_keys and row["object_key"] in existing_keys]

    uploaded: List[dict] = []
    for row in skipped_rows:
        uploaded.append(
            {
                "target_table": row["target_table"],
                "row_id": row["db_sense_id"] if row["target_table"] == "senses" else row["db_example_id"],
                "audio_url": f"{public_base_url}/{row['object_key']}",
                "audio_key": row["object_key"],
                "audio_source_cell": f"{row['workbook_letter']}.{row['source_cell']}",
                "source_file": row["audio_file"],
            }
        )

    if workers <= 1 or dry_run:
        for row in pending_rows:
            uploaded.append(upload_one(client, bucket, public_base_url, row, dry_run))
        return uploaded

    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = [executor.submit(upload_one, client, bucket, public_base_url, row, dry_run) for row in pending_rows]
        for future in as_completed(futures):
            uploaded.append(future.result())

    return uploaded


def write_update_csv(rows: List[dict], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["target_table", "row_id", "audio_url", "audio_key", "audio_source_cell", "source_file"],
        )
        writer.writeheader()
        writer.writerows(rows)


def apply_supabase_updates(rows: List[dict]) -> None:
    if create_client is None:
        raise RuntimeError("supabase package is not installed")

    supabase_url = os.environ.get("SUPABASE_URL")
    service_key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not supabase_url or not service_key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_KEY are required for --apply-supabase")

    client = create_client(supabase_url, service_key)
    for row in rows:
        (
            client.table(row["target_table"])
            .update(
                {
                    "audio_url": row["audio_url"],
                    "audio_key": row["audio_key"],
                    "audio_source_cell": row["audio_source_cell"],
                }
            )
            .eq("id", row["row_id"])
            .execute()
        )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Upload Lingala audio files to Cloudflare R2")
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--output-csv", type=Path, default=Path("artifacts/lingala_audio/lingala_audio_db_updates.csv"))
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--include-unmatched", action="store_true")
    parser.add_argument("--apply-supabase", action="store_true")
    parser.add_argument("--skip-existing", action="store_true")
    parser.add_argument("--workers", type=int, default=12)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    manifest_rows = load_manifest(args.manifest)
    uploadable_rows = list(iter_uploadable_rows(manifest_rows, require_matched=not args.include_unmatched))
    uploaded_rows = upload_rows(
        uploadable_rows,
        dry_run=args.dry_run,
        skip_existing=args.skip_existing,
        workers=args.workers,
    )
    write_update_csv(uploaded_rows, args.output_csv)

    if args.apply_supabase:
        apply_supabase_updates(uploaded_rows)

    print(f"Manifest rows loaded: {len(manifest_rows)}")
    print(f"Rows prepared:        {len(uploadable_rows)}")
    print(f"Dry run:              {args.dry_run}")
    print(f"Update CSV:           {args.output_csv}")
    if args.apply_supabase:
        print("Supabase updates:     applied")


if __name__ == "__main__":
    main()
