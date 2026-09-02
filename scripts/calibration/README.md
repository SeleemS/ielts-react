# AI Writing scorer calibration

Measures how closely the AI Writing score agrees with **human** band labels, and
publishes the result at `/ielts-writing-checker-accuracy`. Competitors assert
"within 0.5 of a band"; this pipeline exists so our equivalent claim is a
measurement with a named corpus, a named licence, a named model and a prompt
version attached.

## Status

**Pending — no accuracy figure is published.** No openly-licensed corpus of
IELTS essays carrying *human* band labels was obtainable without a manual
consent step (survey below). The page therefore renders its
"calibration in progress" state, and the pricing page renders nothing. Both
start showing numbers automatically the moment `lib/calibrationStats.json` is
regenerated with `status: "published"`.

## Pipeline

```
fetch.mjs   corpus file/URL -> data/corpus.jsonl (gitignored) + data/manifest.json (committed)
run.mjs     data/corpus.jsonl -> results/<date>-<model>.jsonl   (calls OpenAI)
report.mjs  results/*.jsonl -> lib/calibrationStats.json + docs/CALIBRATION.md
```

`metrics.mjs` holds the maths (MAE, agreement rates, bias, per-band buckets,
confusion table, per-criterion error) and is unit-tested in `metrics.test.js`.

### Commands

```bash
# 1. Normalise a corpus into data/corpus.jsonl and write the committed manifest.
node scripts/calibration/fetch.mjs \
  --corpus generic \
  --input /path/to/corpus.csv \
  --limit 240 \
  --name "Corpus name as it should appear on the page" \
  --url "https://source.example/dataset" \
  --licence "CC BY 4.0" \
  --licence-url "https://creativecommons.org/licenses/by/4.0/"

# 2. Score them through the product's own prompt path (~$0.015/essay on the
#    paid model, so ~$3.60 for 240). Resumable: rerun the same command after an
#    interruption and it skips ids already in the output file.
node scripts/calibration/run.mjs                        # SCORING_MODEL_PAID
node scripts/calibration/run.mjs --model gpt-4.1-mini   # free-tier comparison
node scripts/calibration/run.mjs --limit 5              # cheap smoke test first

# 3. Compute the tables and regenerate the committed stats + docs/CALIBRATION.md.
node scripts/calibration/report.mjs
```

Use Node 22 (`~/.nvm/versions/node/v22.22.0/bin/node`). `run.mjs` reads
`OPENAI_API_KEY` from the environment or from `.env.local` in the repo root.

### Guard rails

`report.mjs` refuses to write `status: "published"` unless **both**:

* the corpus manifest names a licence, and
* the primary run scored at least `MIN_PUBLISHABLE_N` (100) essays.

`lib/calibrationStats.js` enforces the same floor on the read side, so a stats
file edited by hand still cannot put a number on the site.

The runner imports the prompt from `lib/writingScorePrompt.js` — the same module
`pages/api/score/writing.js` imports. The prompt text is never duplicated, so
the published figure always describes the live scorer. Each results line is
stamped with a `promptVersion` (git blob hashes of `lib/writingScorePrompt.js`,
`lib/writingCalibration.js` and `lib/writingScoreSchema.js`), so a stats file can
never silently describe an older prompt.

### What is committed

Committed: `data/manifest.json` (essay ids, human labels, word counts, SHA-256
of each essay), `lib/calibrationStats.json`, `docs/CALIBRATION.md`.

Not committed (gitignored): `data/corpus.jsonl` and `results/*.jsonl`. Several
candidate corpora restrict redistribution, and we have no reason to republish
anyone's essays; the manifest hashes are enough for a third party holding the
same corpus to verify we did not edit the text or the labels.

## Corpus survey

Checked 2 September 2026. What we needed: essays with **human** IELTS band
labels, a licence permitting **commercial** use, and a download that does not
require a person to fill in a form.

| Corpus | Licence as stated | Human labels? | Verdict |
| --- | --- | --- | --- |
| [DREsS / DREsS_New](https://haneul-yoo.github.io/dress/) | Not stated on the project page. The CC BY 4.0 on [arXiv:2402.16733](https://arxiv.org/abs/2402.16733) covers the *paper*, not the data. An MIT licence is reported for the code repository — **unverified by us**. | Yes — ~2.3K EFL undergraduate essays scored by English-education experts on content / organization / language, each 1–5 in 0.5 steps | **Blocked.** `huggingface.co/datasets/nlpai-lab/DREsS_New` returns HTTP 401 (gated); the project page routes downloads through a Google consent form. Best available option once a human completes that step — `fetch.mjs --corpus dress` is written for it. Note its rubric is not IELTS bands, so labels are converted and the page must say so. |
| [ELLIPSE corpus](https://github.com/scrosseye/ELLIPSE-Corpus) | "CC BY-NC-SA 4.0 … Attribution-NonCommercial-ShareAlike" | Yes — ~6,500 essays, trained raters, six analytic measures | **Rejected.** NonCommercial. IELTS-Bank is a commercial product. |
| [chillies/ielts-writing-task2-essays](https://huggingface.co/datasets/chillies/ielts-writing-task2-essays) | `cc-by-4.0` on the dataset card | **No.** 8,049 essays crawled from writing9.com; the accompanying fields are named `gpt_advices` / `gpt_positive_highlights`, i.e. the bands are that site's own automated scores | **Rejected.** Scoring our AI against another AI measures agreement between two models, not accuracy. Publishing it as accuracy would be dishonest. Provenance of the crawl is also not the uploader's to relicense. |
| [Kaggle: mazlumi/ielts-writing-scored-essays-dataset](https://www.kaggle.com/datasets/mazlumi/ielts-writing-scored-essays-dataset) | `Other (specified in description)` — and the description specifies no licence | Claims examiner comments and per-criterion scores for ~1,200 essays | **Rejected.** No usable licence and no stated provenance. |
| `Owenxu/LLMs-AES-IELTS-TASK2`, `nlpatunt/D_Ielts_*`, `binhng/scoring_ielts_dataset_*`, `karanzrk/ielts` and similar Hugging Face uploads | `apache-2.0` on one, none on the rest | Unknown — no dataset card, no documented provenance | **Rejected.** A licence tag on an undocumented CSV is not provenance we can cite publicly. |
| ASAP-AES / ASAP++, ICNALE, TOEFL11 | Restrictive or registration-gated; not IELTS bands | Yes | **Rejected.** Licence and/or rubric mismatch. |

### To unblock

1. Obtain DREsS via the consent form at the project page (or a Hugging Face
   token that has accepted the `nlpai-lab/DREsS_New` terms — `fetch.mjs` sends
   `HF_TOKEN` as a bearer token), **and confirm the licence text that ships with
   the download** before citing it on the page.
2. Run `fetch.mjs --corpus dress` with the real `--licence` / `--licence-url`.
3. Run `run.mjs`, then `report.mjs`.

Because the DREsS rubric is not the IELTS band scale, `fetch.mjs` records the
conversion in `manifest.corpus.scale` and the page prints that sentence
verbatim. A converted label supports "how closely does the scorer agree with a
human rater", never "how closely does it agree with an IELTS examiner".

A better long-term option is our own labelled set: essays rated by a qualified
rater against the public descriptors, held out of the prompt. That produces
native band labels we can license ourselves and extend over time.
