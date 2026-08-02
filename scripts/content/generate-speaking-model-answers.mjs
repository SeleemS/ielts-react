#!/usr/bin/env node
/**
 * Generate and persist an original Band 8-9 model answer plus a brief examiner
 * rationale for every published Speaking item that does not already have one.
 *   Part 2 (cue card): one ~230-280 word spoken-style answer covering every
 *     cue-card bullet.
 *   Part 1 / Part 3 (question sets): 40-80 word spoken-style answers to the
 *     first up to 4 questions of the set, plus one overall rationale.
 * Stored in speaking_details.model_answer_html + model_answer_meta
 * ({ band, rationale, generatedAt, model }).
 *
 * Idempotent and resumable: rows with model_answer_html are skipped unless
 * --force is used.
 *
 * Usage:
 *   node scripts/content/generate-speaking-model-answers.mjs \
 *     [--dry-run] [--force] [--limit=10] [--only=<slug-substring>]
 */
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './_env.mjs';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const FORCE = args.has('--force');
const limitArg = [...args].find((value) => value.startsWith('--limit='));
const LIMIT = limitArg ? Math.max(1, Number(limitArg.split('=')[1]) || 1) : Infinity;
const onlyArg = [...args].find((value) => value.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.split('=').slice(1).join('=') : '';
const env = loadEnv();
const API_KEY = env.OPENAI_API_KEY;
const MODEL = env.OPENAI_CONTENT_MODEL || env.OPENAI_WRITING_MODEL || 'gpt-5.1';
const MAX_QUESTIONS = 4; // Part 1/3: answer at most the first 4 questions.

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY || !API_KEY) {
  throw new Error('SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and OPENAI_API_KEY are required.');
}

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function plain(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function words(html) {
  return plain(html).split(/\s+/).filter(Boolean).length;
}

// The set of questions the model must answer (Part 1/3), or [] for Part 2.
function questionsOf(row) {
  const source =
    row.part === 1 ? row.part1_questions?.questions : row.part === 3 ? row.part3_followups?.questions : [];
  return (Array.isArray(source) ? source : [])
    .map((q) => String(q?.text || '').trim())
    .filter(Boolean)
    .slice(0, MAX_QUESTIONS);
}

function systemPrompt(row) {
  const shared =
    'You are a senior IELTS speaking coach writing original Band 8-9 model answers for a practice site. ' +
    'Write in a natural SPOKEN register: contractions are fine, first person, conversational connectors ' +
    '("to be honest", "I suppose", "what I mean is"), but no filler transcription like "um". Include some ' +
    'less-common vocabulary and idiomatic language used precisely, and a range of complex structures that ' +
    'still sound natural when said aloud. Do not mention being an AI. ' +
    'Return safe HTML using ONLY <h3>, <p>, <ul>, <li>, <strong> and <em> tags — no attributes, no other tags. ' +
    'Also provide a brief examiner-style rationale (2-3 sentences, plain text, no HTML) explaining concretely why ' +
    'the answer reaches Band 8-9: fluency/coherence features, less-common vocabulary, grammatical range. ' +
    'Never claim an official examiner or IELTS body produced or endorsed the answer.';
  if (row.part === 2) {
    return (
      shared +
      ' TASK: write ONE continuous Part 2 (cue card) model answer of 230-280 words as 3-5 <p> paragraphs ' +
      '(no headings). It must cover EVERY bullet on the cue card and the final explain line, roughly in order, ' +
      'like a well-organised 2-minute talk with a natural opening and closing.'
    );
  }
  const partLabel = row.part === 1 ? 'Part 1' : 'Part 3';
  const style =
    row.part === 1
      ? 'friendly and personal, with everyday detail'
      : 'more abstract and analytical, developing opinions with reasons and examples';
  return (
    shared +
    ` TASK: for EACH numbered ${partLabel} question supplied, write a model answer of 40-80 words, ${style}. ` +
    'Format the HTML as, per question: <h3>the exact question text</h3> followed by one <p> with the answer. ' +
    'Provide ONE overall rationale covering the set.'
  );
}

function userPrompt(row) {
  if (row.part === 2) {
    const c = row.cue_card || {};
    const bullets = (Array.isArray(c.bullets) ? c.bullets : []).map((b) => `- ${b}`).join('\n');
    return [
      `TITLE: ${row.passages.title}`,
      `CUE CARD TOPIC: ${c.topic || row.passages.title}`,
      'You should say:',
      bullets,
      c.explainLine ? `${c.explainLine}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  }
  const topic =
    row.part === 1 ? row.part1_questions?.topic : row.part3_followups?.theme;
  const list = questionsOf(row)
    .map((text, i) => `${i + 1}. ${text}`)
    .join('\n');
  return [
    `TITLE: ${row.passages.title}`,
    `PART: ${row.part}`,
    topic ? `TOPIC: ${topic}` : '',
    'QUESTIONS:',
    list,
  ]
    .filter(Boolean)
    .join('\n');
}

async function generate(row, attempt = 1) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt(row) },
        { role: 'user', content: userPrompt(row) },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'speaking_model_answer', strict: true,
          schema: {
            type: 'object', additionalProperties: false,
            properties: { answer_html: { type: 'string' }, rationale: { type: 'string' } },
            required: ['answer_html', 'rationale'],
          },
        },
      },
    }),
  });
  if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const payload = await response.json();
  const parsed = JSON.parse(payload?.choices?.[0]?.message?.content || '{}');
  const answerWords = words(parsed.answer_html);
  // Part 2 must read like a full 2-minute talk; Part 1/3 need ~40+ words per
  // answered question. Cap check is soft (spoken style runs a little long).
  const min = row.part === 2 ? 200 : Math.max(1, questionsOf(row).length) * 35;
  const bad =
    !parsed.answer_html ||
    !parsed.rationale ||
    answerWords < min ||
    /<(script|iframe|img|a)\b/i.test(parsed.answer_html);
  if (bad && attempt < 3) return generate(row, attempt + 1);
  if (bad) throw new Error(`invalid output (${answerWords} words)`);
  return parsed;
}

const { data, error } = await supabase
  .from('speaking_details')
  .select(
    'passage_id, part, part1_questions, cue_card, part3_followups, model_answer_html, passages!inner(title, slug, status)'
  )
  .eq('passages.status', 'published')
  .order('passage_id');
if (error) throw error;

const usable = (data || []).filter((row) => {
  if (row.part !== 1 && row.part !== 2 && row.part !== 3) return false;
  if (row.part === 2) return !!row.cue_card?.topic || !!row.passages?.title;
  return questionsOf(row).length > 0;
});
const pending = usable
  .filter((row) => (FORCE || !row.model_answer_html) && (!ONLY || row.passages.slug.includes(ONLY)))
  .slice(0, LIMIT);
console.log(
  `[speaking-model-answers] ${pending.length} pending of ${usable.length} usable (${(data || []).length} total); model=${MODEL}${ONLY ? `; only~"${ONLY}"` : ''}${DRY_RUN ? '; DRY RUN' : ''}`
);

let cursor = 0;
let completed = 0;
let failed = 0;
async function worker() {
  while (cursor < pending.length) {
    const index = cursor++;
    const row = pending[index];
    const label = `${index + 1}/${pending.length} p${row.part} ${row.passages.slug}`;
    if (DRY_RUN) { console.log(`[speaking-model-answers] would generate ${label}`); continue; }
    try {
      const generated = await generate(row);
      const { error: updateError } = await supabase.from('speaking_details').update({
        model_answer_html: generated.answer_html,
        model_answer_meta: {
          band: '8-9',
          rationale: generated.rationale,
          generatedAt: new Date().toISOString(),
          model: MODEL,
        },
      }).eq('passage_id', row.passage_id);
      if (updateError) throw updateError;
      completed += 1;
      console.log(`[speaking-model-answers] saved ${label} (${words(generated.answer_html)} words)`);
    } catch (error) {
      failed += 1;
      console.error(`[speaking-model-answers] FAILED ${label}: ${error.message}`);
    }
  }
}

await Promise.all(Array.from({ length: Math.min(4, pending.length || 1) }, () => worker()));
console.log(`[speaking-model-answers] complete=${completed} failed=${failed} skipped=${usable.length - pending.length}`);
if (failed) process.exitCode = 1;
