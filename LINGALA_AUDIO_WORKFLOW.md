# Lingala Audio Workflow

This workflow maps the final Lingala audio files back to the exact normalized
dictionary rows already uploaded to Monoko, uploads the files to Cloudflare R2,
and then links the uploaded object URLs to `senses` and `examples`.

## 1. Generate the manifest

```bash
python3 lingala_audio_manifest.py
```

This produces:

- `artifacts/lingala_audio/lingala_audio_manifest.json`
- `artifacts/lingala_audio/lingala_audio_manifest.csv`
- `artifacts/lingala_audio/lingala_audio_summary.json`

To validate against the live Lingala records in Supabase:

```bash
export SUPABASE_URL="..."
export SUPABASE_SERVICE_KEY="..."
python3 lingala_audio_manifest.py --validate-supabase
```

## 2. Add DB columns

Run this once in Supabase SQL Editor:

```sql
alter table senses
  add column if not exists audio_url text,
  add column if not exists audio_key text,
  add column if not exists audio_source_cell text;

alter table examples
  add column if not exists audio_url text,
  add column if not exists audio_key text,
  add column if not exists audio_source_cell text;
```

## 3. Upload to Cloudflare R2

The scripts now use the corrected R2 object prefix `Lingala/...` by default.

```bash
export R2_ACCOUNT_ID="..."
export R2_ACCESS_KEY_ID="..."
export R2_SECRET_ACCESS_KEY="..."
export R2_BUCKET="audios"
export R2_PUBLIC_BASE_URL="https://pub-78d23bf07fce46b3adc19df91148ffb8.r2.dev"

python3 upload_lingala_audio_to_r2.py \
  --manifest artifacts/lingala_audio/lingala_audio_manifest.json \
  --dry-run
```

Then run the real upload:

```bash
python3 upload_lingala_audio_to_r2.py \
  --manifest artifacts/lingala_audio/lingala_audio_manifest.json
```

This writes:

- `artifacts/lingala_audio/lingala_audio_db_updates.csv`

## 4. Apply DB updates

To upload and patch Supabase in one run:

```bash
export SUPABASE_URL="..."
export SUPABASE_SERVICE_KEY="..."

python3 upload_lingala_audio_to_r2.py \
  --manifest artifacts/lingala_audio/lingala_audio_manifest.json \
  --apply-supabase
```

## 5. Frontend follow-up

After the links are present in Supabase:

- read `audio_url` on `senses`
- read `audio_url` on `examples`
- render a play button only when the URL exists
