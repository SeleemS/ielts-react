# Speaking cue-card pipeline (batch mode)

How the Part 2 bank scales from 80 items to 300+ without hand-authoring each card.

## Pieces

| File | Role |
| --- | --- |
| `scripts/content/speaking/topics.json` | The authored topic bank: 256 Part 2 cue cards across 16 topic families, each with bullets, an "and explain…" closer, 3 linked Part 1 questions and 4 linked Part 3 questions. |
| `scripts/content/speaking/topic-schema.mjs` | Pure contract + validator (schema, word limits, banned phrases, fuzzy title dedupe, slug/title helpers). No env, no network — covered by `tests/speaking-topic-bank.test.js`. |
| `scripts/content/speaking/generate-speaking.mjs` | The pipeline. `--from-topics` = batch cue-card mode; without it, the original `data/*.json` mode is unchanged. |
| `scripts/content/generate-speaking-model-answers.mjs` | Band 8–9 model answers (teaser + premium). Chained by `--model-answers`. |
| `scripts/indexnow-ping.mjs` | Per-URL IndexNow submission. Chained by `--ping`. |
| `scripts/content/speaking/out/batch-<n>.json` | Reviewable artefact for a batch (written before any network call). `batch-<n>.result.json` records what was actually imported. |

Content policy: everything in `topics.json` is original and AI-authored. The validator
rejects any card containing "past paper", "real/actual test question", "official IELTS",
"leaked", etc. Reading/Listening stay free; cue cards are free, only the full model
answer is gated.

## Run a batch

```bash
# 0. from a worktree: secrets live in the main checkout
cp /path/to/ielts-react/.env.local .env.local

# 1. validate + write the batch file. No TTS, no DB, no OpenAI.
node scripts/content/speaking/generate-speaking.mjs --from-topics --batch 1 --size 25 --dry-run

# 2. publish it: TTS -> storage -> passages + speaking_details,
#    then model answers for exactly the new slugs, then IndexNow.
node scripts/content/speaking/generate-speaking.mjs \
  --from-topics --batch 1 --size 25 --import --model-answers --ping
```

`--batch N` is a stable slice of `topics.json` (`--batch 2 --size 25` = topics 26–50).
Topics whose passage slug already exists are skipped, so re-running a batch is safe;
`--force` re-imports them. 256 topics = 11 batches of 25 (or run `--size 50` for 6).

Other flags: `--reuse-audio` (skip TTS when the storage object exists), `--only=<substr>`,
`--force`.

## What a generated card looks like in the DB

* `passages`: `skill='speaking'`, `module=null`, `status='published'`, `source='ai-authored'`,
  `title = "IELTS Speaking Cue Card: <Title Case>"`, `topic_tags = [<family>, 'cue-card', 'part2']`
  (the **first tag is the family** — the `/speaking/topics/<family>` hubs group by it),
  `created_at` = when it was first imported. That timestamp is the freshness signal
  `/speaking/new-cue-cards` sorts by and prints as "Updated <Month YYYY>"; PostgREST
  upserts use `merge-duplicates`, which never rewrites `created_at`.
* `speaking_details`: `part=2`, `cue_card = { topic, bullets, explainLine, prepSeconds,
  speakSecondsMin/Max, audioPath, roundOff: [], family, linkedPart1[], linkedPart3[] }`.
  The linked question sets ride inside the existing jsonb column, so **no migration is
  needed** — `/speaking/part-1` and `/speaking/part-3` read them from there.
* `speaking_details.model_answer_html` / `model_answer_meta`: filled by the chained
  model-answer step (migration `20260802210000_speaking_model_answers.sql`).

Audio: exactly **one** TTS clip per card (the examiner reading the whole card) at
`speaking/<slug>/cue.mp3` in the public `listening-audio` bucket. Round-off questions are
left empty for batch cards to keep the per-card TTS cost at one clip.

## Cost / pacing

One clip per card, `gpt-4o-mini-tts-2025-03-20`, ~45 words each. A 25-card batch is
25 TTS calls + 25 chat completions (model answers). Publish a batch at a time so
`/speaking/new-cue-cards` has a genuine drip of freshness rather than one dump.
