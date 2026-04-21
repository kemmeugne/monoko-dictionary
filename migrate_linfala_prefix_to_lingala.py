#!/usr/bin/env python3
"""
Copy Lingala audio objects from the mistaken `Linfala/` prefix to `Lingala/`
and update Supabase links accordingly.

Required env vars:
  R2_ACCOUNT_ID
  R2_ACCESS_KEY_ID
  R2_SECRET_ACCESS_KEY
  R2_BUCKET
  R2_PUBLIC_BASE_URL
  SUPABASE_URL
  SUPABASE_SERVICE_KEY
"""

from __future__ import annotations

import argparse
import csv
import os
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

import boto3
from supabase import create_client


OLD_PREFIX = "Linfala/"
NEW_PREFIX = "Lingala/"


def create_r2_client():
    return boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def list_existing_keys(client, bucket: str, prefix: str) -> set[str]:
    keys: set[str] = set()
    token = None
    while True:
        kwargs = {"Bucket": bucket, "Prefix": prefix}
        if token:
            kwargs["ContinuationToken"] = token
        response = client.list_objects_v2(**kwargs)
        for item in response.get("Contents", []):
            keys.add(item["Key"])
        if not response.get("IsTruncated"):
            break
        token = response.get("NextContinuationToken")
    return keys


def copy_one(client, bucket: str, source_key: str, target_key: str) -> None:
    client.copy(
        {"Bucket": bucket, "Key": source_key},
        bucket,
        target_key,
        ExtraArgs={"MetadataDirective": "COPY"},
    )


def rewrite_csv(input_csv: Path, output_csv: Path, public_base_url: str) -> list[dict]:
    with input_csv.open(newline="", encoding="utf-8") as handle:
        rows = list(csv.DictReader(handle))

    rewritten = []
    for row in rows:
        old_key = row["audio_key"]
        if not old_key.startswith(OLD_PREFIX):
            raise ValueError(f"Unexpected audio_key prefix: {old_key}")
        new_key = NEW_PREFIX + old_key[len(OLD_PREFIX):]
        row["old_audio_key"] = old_key
        row["old_audio_url"] = row["audio_url"]
        row["audio_key"] = new_key
        row["audio_url"] = f"{public_base_url.rstrip('/')}/{new_key}"
        rewritten.append(row)

    output_csv.parent.mkdir(parents=True, exist_ok=True)
    with output_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "target_table",
                "row_id",
                "audio_url",
                "audio_key",
                "audio_source_cell",
                "source_file",
                "old_audio_key",
                "old_audio_url",
            ],
        )
        writer.writeheader()
        writer.writerows(rewritten)
    return rewritten


def apply_supabase(rows: list[dict]) -> None:
    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_KEY"])
    for row in rows:
        (
            client.table(row["target_table"])
            .update({"audio_url": row["audio_url"], "audio_key": row["audio_key"]})
            .eq("id", row["row_id"])
            .execute()
        )


def parse_args():
    parser = argparse.ArgumentParser(description="Migrate Lingala audio prefix from Linfala/ to Lingala/")
    parser.add_argument(
        "--input-csv",
        type=Path,
        default=Path("artifacts/lingala_audio/lingala_audio_db_updates.csv"),
    )
    parser.add_argument(
        "--output-csv",
        type=Path,
        default=Path("artifacts/lingala_audio/lingala_audio_db_updates_lingala.csv"),
    )
    parser.add_argument("--workers", type=int, default=24)
    parser.add_argument("--apply-supabase", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()
    public_base_url = os.environ["R2_PUBLIC_BASE_URL"]
    bucket = os.environ["R2_BUCKET"]
    rows = rewrite_csv(args.input_csv, args.output_csv, public_base_url)

    client = create_r2_client()
    existing_new = list_existing_keys(client, bucket, NEW_PREFIX)
    pending = []
    for row in rows:
        if row["audio_key"] not in existing_new:
            pending.append((row["old_audio_key"], row["audio_key"]))

    if not args.dry_run:
        with ThreadPoolExecutor(max_workers=args.workers) as executor:
            futures = [executor.submit(copy_one, client, bucket, source_key, target_key) for source_key, target_key in pending]
            for future in as_completed(futures):
                future.result()

    if args.apply_supabase:
        apply_supabase(rows)

    print(f"Rows loaded:           {len(rows)}")
    print(f"Objects already copied:{len(rows) - len(pending)}")
    print(f"Objects copied now:    {0 if args.dry_run else len(pending)}")
    print(f"Output CSV:            {args.output_csv}")
    print(f"Supabase updates:      {'applied' if args.apply_supabase else 'not applied'}")


if __name__ == "__main__":
    main()
