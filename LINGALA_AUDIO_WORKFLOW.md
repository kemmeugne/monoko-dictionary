# Lingala Audio Workflow

This workflow covers both Lingala dictionary audio and Lingala course audio. It
maps the final audio files back to the exact normalized rows already uploaded to
Monoko, uploads the files to Cloudflare R2 where needed, and then links the
audio metadata to `senses`, `examples`, and `lesson_items`.

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

alter table lesson_items
  add column if not exists audio_url text,
  add column if not exists audio_key text,
  add column if not exists audio_source_cell text,
  add column if not exists example_audio_url text,
  add column if not exists example_audio_key text,
  add column if not exists example_audio_source_cell text;
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

## 6. Build the course-audio mapping

Generate the Lingala course-audio mapping from the workbook references and the
four `cours` audio folders:

```bash
python3 course_audio_mapper.py
```

Current result:

- `1,251` matched course audio files
- mapping prepared for direct `lesson_items` updates

## 7. Apply course-audio DB updates

Write the matched course audio directly to Supabase:

```bash
python3 apply_course_audio_to_lesson_items.py
```

Current result:

- `830` `lesson_items` rows updated
- main lesson audio stored in `lesson_items.audio_url`
- example lesson audio stored in `lesson_items.example_audio_url`

## 8. Course frontend follow-up

After the course links are present in Supabase:

- read `audio_url` on `lesson_items`
- read `example_audio_url` on `lesson_items`
- render course lesson play buttons only when the URL exists
- no static `course_audio_map.json` fallback is needed anymore
