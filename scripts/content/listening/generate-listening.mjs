#!/usr/bin/env node
/**
 * generate-listening.mjs
 * ----------------------
 * Reusable, idempotent LISTENING content pipeline for ielts-bank.
 *
 * For every authored passage JSON under scripts/content/listening/data/*.json it:
 *   1. Synthesises each speaker turn with OpenAI TTS (that speaker's own voice),
 *      then Buffer.concat's the turn MP3s into ONE continuous 24kHz mono MP3
 *      (all turns share identical encoder settings, so a raw concat is a valid
 *      single file — verified; no ffmpeg required).
 *   2. Uploads that MP3 to the public `listening-audio` bucket at
 *      `listening/<slug>.mp3` (upsert) via the Storage REST API + service role.
 *   3. Upserts the passage row + listening_details(audio_path=that path,
 *      transcript_html, voices) + question_groups/group_options/questions/
 *      answer_keys, in EXACTLY the shape the live engine grades against
 *      (src/components/question/grade.js + lib/supabase.js getStructuredPassage).
 *      Children are delete+reinserted per passage (like the reading importers),
 *      so re-runs are idempotent.
 *
 * Everything goes through the Storage + PostgREST HTTP APIs with fetch, so there
 * is no @supabase/supabase-js / WebSocket dependency for the write path.
 *
 * AUTHORED INPUT SHAPE (scripts/content/listening/data/<name>.json), either a
 * single object or an array of objects:
 * {
 *   "title": "...", "module": "general"|"academic", "difficulty": "easy|medium|hard",
 *   "topicTags": ["..."],
 *   "partStyle": "Part 1",                         // free-text label, for reporting only
 *   "speakers": [{ "name": "Receptionist", "role": "Sports centre staff", "voice": "nova" }],
 *   "sections": [
 *     { "part": "Part 1", "turns": [ { "speaker": "Receptionist", "voice": "nova", "text": "..." } ] }
 *   ],
 *   "questionGroups": [
 *     { "question_type": "note_completion", "prompt": "...", "instructions_html": "...",
 *       "options": [{ "key": "A", "text": "..." }],
 *       "questions": [
 *         { "prompt_text": "...", "accepted": ["..."], "word_limit": 2, "spelling_variants": true },
 *         { "prompt_text": "...", "correct_option_keys": ["B"] },
 *         { "prompt_text": "...", "answer": "true" }       // tf/yn types
 *       ] }
 *   ]
 * }
 *
 * USAGE
 *   node scripts/content/listening/generate-listening.mjs [--dry-run] [--reuse-audio] [--only=<slug-substr>]
 * Requires OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA = join(__dirname, 'data');
const OUT = join(__dirname, '.audio-cache'); // local copy of generated MP3s (for `file`/size checks)

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const REUSE_AUDIO = argv.includes('--reuse-audio');
const ONLY = (argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
const log = (...a) => console.log('[gen-listening]', ...a);

const TTS_MODEL = 'gpt-4o-mini-tts-2025-03-20'; // ONLY the dated id is authorised for this project
const BUCKET = 'listening-audio';

// ---- env (self-contained; also surfaces OPENAI_API_KEY, which _env.mjs omits) ----
function loadEnv() {
  const ROOT = join(__dirname, '..', '..', '..');
  let raw = '';
  try {
    raw = readFileSync(join(ROOT, '.env.local'), 'utf8');
  } catch {
    /* fall through to process.env */
  }
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    env[m[1]] = v;
  }
  const pick = (k) => process.env[k] || env[k];
  return {
    OPENAI_API_KEY: pick('OPENAI_API_KEY'),
    SUPABASE_URL: pick('SUPABASE_URL'),
    SUPABASE_SERVICE_ROLE_KEY: pick('SUPABASE_SERVICE_ROLE_KEY'),
    NEXT_PUBLIC_SUPABASE_URL: pick('NEXT_PUBLIC_SUPABASE_URL'),
  };
}

// ---- slug (same algorithm as the reading importers so slugs are stable) ----
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

// ---- answer-key builder (identical semantics to import-rich.mjs) ----
const TEXT_TYPES = new Set([
  'sentence_completion',
  'summary_completion',
  'note_completion',
  'table_completion',
  'flowchart_completion',
  'short_answer',
  'diagram_label',
  'plan_map_diagram_label',
  'form_completion',
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
function buildAnswerKey(qtype, q) {
  const ak = {
    accepted: [],
    correct_option_keys: [],
    spelling_variants: false,
    word_limit: null,
    normalize: 'lower_trim',
  };
  if (BOOL_TYPES.has(qtype)) {
    ak.accepted = [String(q.answer).trim().toLowerCase()];
  } else if (OPTION_TYPES.has(qtype)) {
    ak.correct_option_keys = q.correct_option_keys || [];
  } else if (TEXT_TYPES.has(qtype) || true) {
    // default to text grading for any completion / short-answer style type
    ak.accepted = (q.accepted || []).map((s) => String(s));
    ak.word_limit = q.word_limit ?? null;
    ak.spelling_variants = q.spelling_variants ?? false;
    ak.normalize = q.normalize || 'lower_trim';
  }
  return ak;
}

// ---- transcript + voices from authored sections ----
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function buildTranscriptHtml(item) {
  const parts = [];
  for (const sec of item.sections || []) {
    if (sec.part) parts.push(`<h3>${esc(sec.part)}</h3>`);
    for (const t of sec.turns || []) {
      const isMono = (sec.turns || []).every((x) => x.speaker === sec.turns[0].speaker);
      parts.push(
        isMono
          ? `<p>${esc(t.text)}</p>`
          : `<p><strong>${esc(t.speaker)}:</strong> ${esc(t.text)}</p>`
      );
    }
  }
  return parts.join('\n');
}
function buildVoices(item) {
  if (Array.isArray(item.speakers) && item.speakers.length) {
    return item.speakers.map((s) => ({ name: s.name, role: s.role || s.name, voice: s.voice }));
  }
  const seen = new Map();
  for (const sec of item.sections || [])
    for (const t of sec.turns || [])
      if (!seen.has(t.speaker)) seen.set(t.speaker, { name: t.speaker, role: t.speaker, voice: t.voice });
  return [...seen.values()];
}

// ---- OpenAI TTS: one turn -> one MP3 buffer ----
async function ttsTurn(env, voice, text) {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: TTS_MODEL, voice, input: text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`TTS ${res.status} ${res.statusText} (voice=${voice}): ${body.slice(0, 300)}`);
  }
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

// Synthesise every turn and concat into ONE MP3. Returns { buffer, chars, turns }.
async function synthesizePassage(env, item) {
  const segs = [];
  let chars = 0;
  let turns = 0;
  for (const sec of item.sections || []) {
    for (const t of sec.turns || []) {
      const text = String(t.text || '').trim();
      if (!text) continue;
      const buf = await ttsTurn(env, t.voice, text);
      segs.push(buf);
      chars += text.length;
      turns += 1;
    }
  }
  if (!segs.length) throw new Error('no turns to synthesise');
  return { buffer: Buffer.concat(segs), chars, turns };
}

// ---- Storage REST ----
function storageHeaders(env, extra = {}) {
  return {
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    ...extra,
  };
}
async function objectExists(env, path) {
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'HEAD',
    headers: storageHeaders(env),
  });
  return res.ok;
}
async function uploadObject(env, path, buffer) {
  const res = await fetch(`${env.SUPABASE_URL}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: storageHeaders(env, { 'Content-Type': 'audio/mpeg', 'x-upsert': 'true' }),
    body: buffer,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`storage upload ${res.status}: ${body.slice(0, 300)}`);
  }
  return true;
}

// ---- PostgREST helpers ----
function pgHeaders(env, extra = {}) {
  return {
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    'Content-Type': 'application/json',
    ...extra,
  };
}
async function pg(env, path, { method = 'GET', body, prefer, query } = {}) {
  const qs = query ? `?${query}` : '';
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}${qs}`, {
    method,
    headers: pgHeaders(env, prefer ? { Prefer: prefer } : {}),
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${text.slice(0, 400)}`);
  return text ? JSON.parse(text) : null;
}

async function upsertPassage(env, item, slug, audioPath) {
  const module = item.module || 'academic';
  const passageRow = {
    slug,
    skill: 'listening',
    module,
    title: item.title,
    body_html: null,
    difficulty: item.difficulty || 'medium',
    topic_tags: item.topicTags || [],
    status: 'published',
    source: 'ai-authored',
  };
  const rows = await pg(env, 'passages', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    query: 'on_conflict=slug',
    body: passageRow,
  });
  const passageId = rows[0].id;

  // listening_details (PK = passage_id) upsert.
  await pg(env, 'listening_details', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    query: 'on_conflict=passage_id',
    body: {
      passage_id: passageId,
      audio_path: audioPath,
      transcript_html: buildTranscriptHtml(item),
      voices: buildVoices(item),
      // IELTS part 1-4; accepts item.part = 2 or partStyle strings like "Part 2".
      part: Number(item.part) || Number(String(item.partStyle || '').match(/[1-4]/)?.[0]) || null,
    },
  });

  // Delete existing question groups (cascades options/questions/answer_keys).
  await pg(env, 'question_groups', {
    method: 'DELETE',
    prefer: 'return=minimal',
    query: `passage_id=eq.${passageId}`,
  });

  let gpos = 0;
  let globalNumber = 0;
  for (const g of item.questionGroups || []) {
    const gr = await pg(env, 'question_groups', {
      method: 'POST',
      prefer: 'return=representation',
      body: {
        passage_id: passageId,
        position: gpos++,
        question_type: g.question_type,
        prompt: g.prompt || null,
        instructions_html: g.instructions_html || null,
      },
    });
    const groupId = gr[0].id;

    if ((g.options || []).length) {
      await pg(env, 'group_options', {
        method: 'POST',
        prefer: 'return=minimal',
        body: g.options.map((o, oi) => ({
          question_group_id: groupId,
          option_key: o.key,
          display_text: o.text,
          position: oi,
        })),
      });
    }

    let qpos = 0;
    for (const q of g.questions || []) {
      globalNumber += 1;
      const qr = await pg(env, 'questions', {
        method: 'POST',
        prefer: 'return=representation',
        body: {
          question_group_id: groupId,
          passage_id: passageId,
          position: qpos++,
          global_number: globalNumber,
          prompt_text: q.prompt_text || null,
        },
      });
      const questionId = qr[0].id;
      await pg(env, 'answer_keys', {
        method: 'POST',
        prefer: 'return=minimal',
        body: { question_id: questionId, ...buildAnswerKey(g.question_type, q) },
      });
    }
  }
  return { passageId, questionCount: globalNumber };
}

// ---- main ----
function loadItems() {
  const files = readdirSync(DATA).filter((f) => f.endsWith('.json'));
  const items = [];
  for (const f of files) {
    const parsed = JSON.parse(readFileSync(join(DATA, f), 'utf8'));
    const arr = Array.isArray(parsed) ? parsed : [parsed];
    for (const it of arr) items.push({ ...it, __file: f });
  }
  return items;
}

async function main() {
  const env = loadEnv();
  if (!env.OPENAI_API_KEY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      '\nRefusing to run: OPENAI_API_KEY, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must all be set in .env.local.\n'
    );
    process.exit(1);
  }
  try {
    mkdirSync(OUT, { recursive: true });
  } catch {
    /* noop */
  }

  log(DRY_RUN ? 'DRY RUN — synth + no DB/Storage writes.' : 'LIVE RUN.', REUSE_AUDIO ? '(reuse-audio)' : '');
  const items = loadItems();
  const report = [];
  const summary = { passages: 0, questions: 0, failed: 0, ttsChars: 0 };

  for (const item of items) {
    const module = item.module || 'academic';
    const slug = stableSlug('listening', module, item.title);
    if (ONLY && !slug.includes(ONLY) && !item.__file.includes(ONLY)) continue;
    const audioPath = `listening/${slug}.mp3`;
    const publicUrl = `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${audioPath}`;

    try {
      // 1. Audio
      let bytes = null;
      let chars = 0;
      let turns = 0;
      const already = REUSE_AUDIO ? await objectExists(env, audioPath) : false;
      if (already) {
        log(`[${slug}] reusing existing audio object`);
      } else {
        const synth = await synthesizePassage(env, item);
        bytes = synth.buffer.length;
        chars = synth.chars;
        turns = synth.turns;
        summary.ttsChars += chars;
        writeFileSync(join(OUT, `${slug}.mp3`), synth.buffer); // local copy for `file`/size checks
        if (!DRY_RUN) await uploadObject(env, audioPath, synth.buffer);
        log(`[${slug}] synth ${turns} turns, ${chars} chars, ${bytes} bytes${DRY_RUN ? ' (not uploaded)' : ' -> uploaded'}`);
      }

      // 2. DB
      let questionCount = (item.questionGroups || []).reduce((n, g) => n + (g.questions || []).length, 0);
      if (!DRY_RUN) {
        const r = await upsertPassage(env, item, slug, audioPath);
        questionCount = r.questionCount;
        log(`[${slug}] upserted passage + ${questionCount} questions`);
      }

      summary.passages += 1;
      summary.questions += questionCount;
      report.push({
        title: item.title,
        slug,
        partStyle: item.partStyle || (item.sections?.[0]?.part ?? ''),
        module,
        audioPath,
        publicUrl,
        bytes,
        ttsChars: chars,
        turns,
        questionCount,
        questionTypes: [...new Set((item.questionGroups || []).map((g) => g.question_type))],
      });
    } catch (e) {
      summary.failed += 1;
      console.error(`  FAILED "${item.title}" (${slug}): ${e.message}`);
      report.push({ title: item.title, slug, error: e.message });
    }
  }

  log('DONE. Summary:', JSON.stringify(summary));
  writeFileSync(join(OUT, '_report.json'), JSON.stringify({ summary, report }, null, 2));
  log('report ->', join(OUT, '_report.json'));
}

main().catch((e) => {
  console.error('[gen-listening] fatal:', e);
  process.exit(1);
});
