#!/usr/bin/env node
/**
 * import-rich.mjs
 * ----------------
 * Self-contained, idempotent importer for RICH IELTS reading question types
 * authored under scripts/content/data/rich-*.json ONLY. Owns the `rich-` file
 * prefix so it can run concurrently with the shared import-batch.mjs without
 * touching any other agent's files.
 *
 * Upserts each passage by a stable slug (children are delete+reinserted per
 * passage), then writes question_groups + group_options + questions +
 * answer_keys in EXACTLY the shape the live engine grades against
 * (src/components/question/grade.js + lib/supabase.js getStructuredPassage):
 *
 *   - matching_headings / matching_information / matching_features /
 *     matching_sentence_endings : group_options (option_key + display_text),
 *     answer_keys.correct_option_keys = [key]  (single-select grading)
 *   - multiple_choice_multi : group_options A..E, answer_keys.correct_option_keys
 *     = [key, key, ...]  (set-equality grading)
 *   - sentence_completion / summary_completion / note_completion /
 *     table_completion / short_answer : answer_keys.accepted = [variants],
 *     word_limit, spelling_variants, normalize
 *   - true_false_notgiven / yes_no_notgiven : answer_keys.accepted = [lc answer]
 *
 * NOTE: the engine renders each option as `${key}. ${display_text}`, so
 * display_text stores the RAW option text (no key prefix).
 *
 * USAGE
 *   node --import ./scripts/_wspreload.mjs scripts/content/import-rich.mjs [--dry-run]
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (from .env.local).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './_env.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, 'data');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
// Optional: --only <substring> restricts the run to matching filenames. Use
// this when adding new rich-*.json files so passages already imported (whose
// answer_keys.explanation may have been enriched in-DB after import) are not
// delete+reinserted and stripped of those explanations.
const onlyIdx = argv.indexOf('--only');
const ONLY = onlyIdx !== -1 ? argv[onlyIdx + 1] : null;
const log = (...a) => console.log('[import-rich]', ...a);

// ---- slug helpers (same algorithm as import-batch.mjs so slugs are stable) --
function slugify(str) {
  return (
    String(str || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'passage'
  );
}
function shortHash(input) {
  let h = 5381;
  const s = String(input);
  for (let i = 0; i < s.length; i += 1) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36).slice(0, 6);
}
function stableSlug(skill, module, title) {
  return `${slugify(title)}-${shortHash(`${skill}:${module}:${title}`)}`;
}

const TEXT_TYPES = new Set([
  'sentence_completion',
  'summary_completion',
  'note_completion',
  'table_completion',
  'flowchart_completion',
  'short_answer',
  // diagram_label renders as labelled text inputs and grades vs accepted[]
  // (grade.js: input 'visual', grade 'accepted').
  'diagram_label',
]);
const BOOL_TYPES = new Set(['true_false_notgiven', 'yes_no_notgiven']);
const OPTION_TYPES = new Set([
  'matching_headings',
  'matching_information',
  'matching_features',
  'matching_sentence_endings',
  'multiple_choice',
  'multiple_choice_multi',
]);

// Build one answer_keys row from an authored question, per its group type.
function buildAnswerKey(qtype, q) {
  const ak = {
    accepted: [],
    correct_option_keys: [],
    spelling_variants: false,
    word_limit: null,
    normalize: 'lower_trim',
    explanation: q.evidence || null,
  };
  if (BOOL_TYPES.has(qtype)) {
    ak.accepted = [String(q.answer).trim().toLowerCase()];
  } else if (TEXT_TYPES.has(qtype)) {
    ak.accepted = (q.accepted || []).map((s) => String(s));
    ak.word_limit = q.word_limit ?? null;
    ak.spelling_variants = q.spelling_variants ?? false;
    ak.normalize = q.normalize || 'lower_trim';
  } else if (OPTION_TYPES.has(qtype)) {
    ak.correct_option_keys = q.correct_option_keys || [];
  }
  return ak;
}

// ---- transform one authored passage into the relational shape --------------
function transformRich(item) {
  const module = item.module || 'academic';
  const slug = stableSlug('reading', module, item.title);
  const passage = {
    slug,
    skill: 'reading',
    module,
    title: item.title,
    body_html: item.body_html || null,
    difficulty: item.difficulty || 'medium',
    topic_tags: item.topic_tags || [],
    status: 'published',
    source: 'ai-authored',
  };
  const groups = [];
  let globalNumber = 0;
  (item.groups || []).forEach((g, gi) => {
    const options = (g.options || []).map((o, oi) => ({
      option_key: o.key,
      display_text: o.text,
      position: oi,
    }));
    const questions = [];
    (g.questions || []).forEach((q, qi) => {
      globalNumber += 1;
      questions.push({
        question: {
          position: qi,
          global_number: globalNumber,
          prompt_text: q.prompt_text || null,
        },
        answer_key: buildAnswerKey(g.question_type, q),
      });
    });
    groups.push({
      group: {
        position: gi,
        question_type: g.question_type,
        prompt: g.prompt || null,
        instructions_html: g.instructions_html || null,
        // Optional standalone SVG (flow-chart / diagram / plan) rendered above
        // the group by QuestionGroup.jsx via sanitizeSvg.
        image_svg: g.image_svg || null,
      },
      options,
      questions,
    });
  });
  return { passage, groups };
}

// ---- DB write --------------------------------------------------------------
async function upsertRich(supabase, t) {
  const { data: rows, error } = await supabase
    .from('passages')
    .upsert(t.passage, { onConflict: 'slug' })
    .select('id')
    .limit(1);
  if (error) throw new Error(`passages upsert (${t.passage.slug}): ${error.message}`);
  const passageId = rows[0].id;

  // Delete existing children (cascades to options/questions/answer_keys).
  const { error: delErr } = await supabase
    .from('question_groups')
    .delete()
    .eq('passage_id', passageId);
  if (delErr) throw new Error(`group delete: ${delErr.message}`);

  let pos = 0;
  for (const g of t.groups) {
    const { data: gr, error: gErr } = await supabase
      .from('question_groups')
      .insert({ passage_id: passageId, ...g.group, position: pos++ })
      .select('id')
      .limit(1);
    if (gErr) throw new Error(`group insert (${g.group.question_type}): ${gErr.message}`);
    const groupId = gr[0].id;

    if (g.options.length > 0) {
      const opts = g.options.map((o) => ({ question_group_id: groupId, ...o }));
      const { error: oErr } = await supabase.from('group_options').insert(opts);
      if (oErr) throw new Error(`options insert: ${oErr.message}`);
    }

    for (const q of g.questions) {
      const { data: qr, error: qErr } = await supabase
        .from('questions')
        .insert({ question_group_id: groupId, passage_id: passageId, ...q.question })
        .select('id')
        .limit(1);
      if (qErr) throw new Error(`question insert: ${qErr.message}`);
      const { error: akErr } = await supabase
        .from('answer_keys')
        .insert({ question_id: qr[0].id, ...q.answer_key });
      if (akErr) throw new Error(`answer_key insert: ${akErr.message}`);
    }
  }
  return passageId;
}

// ---- main ------------------------------------------------------------------
async function main() {
  const env = loadEnv();
  if (!DRY_RUN && (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.error('\nRefusing to run: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.\n');
    process.exit(1);
  }
  log(DRY_RUN ? 'DRY RUN — no writes.' : 'LIVE RUN — writing to Supabase.');

  let supabase = null;
  if (!DRY_RUN) {
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  const files = readdirSync(DATA).filter(
    (f) => f.startsWith('rich-') && f.endsWith('.json') && (!ONLY || f.includes(ONLY))
  );
  const summary = { passages: 0, questions: 0, failed: 0 };
  const byType = {};
  const slugs = [];
  const seenSlugs = new Set();

  for (const f of files) {
    const arr = JSON.parse(readFileSync(join(DATA, f), 'utf8'));
    for (const item of arr) {
      if (item.skill && item.skill !== 'reading') continue;
      const t = transformRich(item);
      if (seenSlugs.has(t.passage.slug)) {
        console.error(`  DUPLICATE SLUG ${t.passage.slug} — skipping`);
        continue;
      }
      seenSlugs.add(t.passage.slug);
      const qCount = t.groups.reduce((n, g) => n + g.questions.length, 0);
      t.groups.forEach((g) => {
        byType[g.group.question_type] = (byType[g.group.question_type] || 0) + g.questions.length;
      });
      if (DRY_RUN) {
        log(`would upsert "${item.title}" slug=${t.passage.slug} (${qCount} q)`);
      } else {
        try {
          await upsertRich(supabase, t);
          log(`"${item.title}" -> ${t.passage.slug} (${qCount} q)`);
        } catch (e) {
          console.error(`  FAILED ${item.title}: ${e.message}`);
          summary.failed++;
          continue;
        }
      }
      summary.passages++;
      summary.questions += qCount;
      slugs.push(t.passage.slug);
    }
  }
  log('DONE. Summary:', JSON.stringify(summary));
  log('questions per type:', JSON.stringify(byType));
  log('slugs:', JSON.stringify(slugs));
}

main().catch((e) => {
  console.error('[import-rich] fatal:', e);
  process.exit(1);
});
