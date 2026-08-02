-- 20260802210000_speaking_model_answers.sql
-- Speaking model answers: extend speaking_details with an original Band 8-9
-- model answer (spoken-register HTML) plus generation metadata. Speaking cue
-- cards are the site's top SEO landers and "show me a model answer" is the top
-- user demand — mirrors writing_details.model_answer_html shipped Jul 2026.
--
-- model_answer_html: simple <h3>/<p>/<ul> markup, sanitized at render time by
--   lib/sanitize.js (same profile as every other DB-sourced HTML column).
--   Part 2 -> one ~230-280 word cue-card answer; Part 1/3 -> per-question
--   answers (first up to 4 questions of the set).
-- model_answer_meta: { band, rationale, generatedAt, model } — brief examiner
--   rationale plus provenance of the generation run.
--
-- Backward-compatible: only ADDs nullable columns. Readable by anon through
-- the existing published-passage RLS policy (0005), which is intended — the
-- teaser is deliberately crawlable; the free/premium split is a display gate.

alter table public.speaking_details
  add column if not exists model_answer_html text,
  add column if not exists model_answer_meta jsonb;

comment on column public.speaking_details.model_answer_html is
  'Original Band 8-9 model answer (spoken register, simple <h3>/<p>/<ul> HTML). Part 2: one full cue-card answer; Part 1/3: answers to the first up to 4 questions.';
comment on column public.speaking_details.model_answer_meta is
  'Generation metadata: { band, rationale, generatedAt, model }. rationale = brief examiner-style note on why the answer reaches Band 8-9.';
