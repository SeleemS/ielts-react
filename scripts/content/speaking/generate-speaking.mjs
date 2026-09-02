#!/usr/bin/env node
/**
 * generate-speaking.mjs
 * ---------------------
 * Idempotent SPEAKING content pipeline for ielts-bank.
 *
 * TWO MODES
 * =========
 *
 * 1) LEGACY / hand-authored mode (unchanged)
 *    Reads every authored item under scripts/content/speaking/data/*.json and
 *    synthesises + uploads examiner audio, then upserts passages +
 *    speaking_details.
 *
 *      node scripts/content/speaking/generate-speaking.mjs [--dry-run] [--reuse-audio] [--only=<slug-substr>]
 *
 * 2) BATCH CUE-CARD mode (--from-topics) — how the bank scales past 300 cards
 *    Reads scripts/content/speaking/topics.json (the authored Part 2 topic
 *    bank: 250+ cue cards across 16 official topic families), takes ONE batch,
 *    validates it, writes the batch JSON to out/batch-<n>.json, and optionally
 *    imports it, generates model answers for it, and pings IndexNow.
 *
 *      # 1. dry run — validate + write out/batch-1.json, no network at all
 *      node scripts/content/speaking/generate-speaking.mjs --from-topics --batch 1 --size 25 --dry-run
 *
 *      # 2. real run — TTS + storage + DB upsert, then model answers, then IndexNow
 *      node scripts/content/speaking/generate-speaking.mjs \
 *        --from-topics --batch 1 --size 25 --import --model-answers --ping
 *
 *    Batches are stable slices of topics.json (batch 1 = topics 1-25 at
 *    --size 25). Topics whose passage slug already exists in the DB are skipped
 *    unless --force, so re-running a batch is safe and resumable.
 *
 * FLAGS
 *   --from-topics      batch mode over topics.json (else: legacy data/*.json)
 *   --batch <n>        1-indexed batch number          (default 1)
 *   --size <n>         cue cards per batch             (default 25)
 *   --import           actually write to Storage + DB  (implied off in --dry-run)
 *   --model-answers    chain generate-speaking-model-answers.mjs for the new slugs
 *   --ping             chain indexnow-ping.mjs with the new URLs (per-URL mode)
 *   --force            re-import topics that already exist in the DB
 *   --dry-run          no TTS, no uploads, no DB writes — validation + batch file only
 *   --reuse-audio      skip TTS when the storage object already exists
 *   --only=<substr>    filter by slug/file substring
 *
 * Requires OPENAI_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY in .env.local
 * (repo ROOT — copy it into a worktree if you work in one). --dry-run needs none
 * of them.
 *
 * See docs/CONTENT-PIPELINE-SPEAKING.md for the operating runbook.
 *
 * ---------------------------------------------------------------------------
 * AUTHORED INPUT SHAPE (data/<name>.json — single object or array of objects)
 * ---------------------------------------------------------------------------
 * Common: { part:1|2|3, title, difficulty?, topicTags?[] }
 *
 * Part 1: { part:1, topic, questions:[ "text", ... 4-5 ] }
 * Part 2: { part:2, cueCard:{ topic, bullets:[3-4], explainLine },
 *           roundOff?:[ "text", ... ] }
 * Part 3: { part:3, theme, questions:[ "text", ... 5-6 ] }
 *
 * The generator assigns audio keys deterministically:
 *   Part 1  -> q1..qN                      (one per question)
 *   Part 2  -> cue (the cue card), r1..rN  (round-off questions)
 *   Part 3  -> q1..qN
 * and stores the resulting jsonb shapes documented in
 * supabase/migrations/0010_speaking_content.sql.
 *
 * TOPIC BANK SHAPE (topics.json) — see scripts/content/speaking/topic-schema.mjs
 *   { slug, family, title:"Describe a ...", bullets:[3-4], explain:"and explain ...",
 *     difficulty, part1:[3 questions], part3:[4 questions] }
 * Cue cards generated from a topic carry their linked Part 1 / Part 3 questions
 * inside cue_card.linkedPart1 / cue_card.linkedPart3 (jsonb — no migration), and
 * their family as the FIRST entry of passages.topic_tags, which is what the
 * /speaking hubs group by.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  passageSlugFor,
  passageTitleFor,
  stableSlug,
  topicToItem,
  validateTopicBank,
  containsBannedPhrase,
} from './topic-schema.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');
const DATA = join(__dirname, 'data');
const OUT = join(__dirname, '.audio-cache');
const BATCH_OUT = join(__dirname, 'out');
const TOPICS_FILE = join(__dirname, 'topics.json');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const REUSE_AUDIO = argv.includes('--reuse-audio');
const FROM_TOPICS = argv.includes('--from-topics');
const DO_IMPORT = argv.includes('--import') && !DRY_RUN;
const DO_MODEL_ANSWERS = argv.includes('--model-answers') && !DRY_RUN;
const DO_PING = argv.includes('--ping') && !DRY_RUN;
const FORCE = argv.includes('--force');
const ONLY = (argv.find((a) => a.startsWith('--only=')) || '').split('=')[1] || '';
const log = (...a) => console.log('[gen-speaking]', ...a);

// Read `--flag value` or `--flag=value`.
function numArg(name, fallback) {
  const eq = argv.find((a) => a.startsWith(`${name}=`));
  if (eq) return Math.max(1, Number(eq.split('=')[1]) || fallback);
  const i = argv.indexOf(name);
  if (i !== -1 && argv[i + 1] && !argv[i + 1].startsWith('--')) {
    return Math.max(1, Number(argv[i + 1]) || fallback);
  }
  return fallback;
}
const BATCH = numArg('--batch', 1);
const SIZE = numArg('--size', 25);

const TTS_MODEL = 'gpt-4o-mini-tts-2025-03-20'; // ONLY the dated id is authorised for this project
const EXAMINER_VOICE = 'onyx'; // ONE calm examiner voice for ALL speaking audio, for interview realism
const BUCKET = 'listening-audio';
const SITE = 'https://www.ielts-bank.com';

// Part 2 timing defaults (seconds) — standard IELTS cue card.
const PREP_SECONDS = 60;
const SPEAK_SECONDS_MIN = 60;
const SPEAK_SECONDS_MAX = 120;

// ---- env ----
function loadEnv() {
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
  };
}

// ---- OpenAI TTS: one text -> one MP3 buffer ----
async function ttsClip(env, text) {
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: TTS_MODEL, voice: EXAMINER_VOICE, input: text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`TTS ${res.status} ${res.statusText}: ${body.slice(0, 300)}`);
  }
  return Buffer.from(await res.arrayBuffer());
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

// Every published speaking passage's slug + title (for skip/dedupe decisions).
async function fetchExistingSpeaking(env) {
  const rows = await pg(env, 'passages', {
    query: 'skill=eq.speaking&select=slug,title&limit=2000',
  });
  return {
    slugs: new Set((rows || []).map((r) => r.slug)),
    titles: (rows || []).map((r) => r.title),
  };
}

// ---- cue-card spoken script (examiner reads the whole card naturally) ----
function cueCardScript(cc) {
  const bullets = (cc.bullets || []).join('; ');
  const explain = String(cc.explainLine || '').trim();
  return `${cc.topic} You should say: ${bullets}. ${explain}`.replace(/\s+/g, ' ').trim();
}

// ---- build the per-item audio job list: [{ key, text }] ----
function audioJobs(item) {
  const jobs = [];
  if (item.part === 1) {
    (item.questions || []).forEach((t, i) => jobs.push({ key: `q${i + 1}`, text: String(t) }));
  } else if (item.part === 2) {
    jobs.push({ key: 'cue', text: cueCardScript(item.cueCard || {}) });
    (item.roundOff || []).forEach((t, i) => jobs.push({ key: `r${i + 1}`, text: String(t) }));
  } else if (item.part === 3) {
    (item.questions || []).forEach((t, i) => jobs.push({ key: `q${i + 1}`, text: String(t) }));
  }
  return jobs;
}

// ---- build the speaking_details jsonb from item + a key->audioPath map ----
function buildDetails(item, slug) {
  const ap = (key) => `speaking/${slug}/${key}.mp3`;
  if (item.part === 1) {
    return {
      part: 1,
      part1_questions: {
        topic: item.topic,
        questions: (item.questions || []).map((t, i) => ({ text: String(t), audioPath: ap(`q${i + 1}`) })),
      },
      cue_card: null,
      part3_followups: null,
    };
  }
  if (item.part === 2) {
    const cc = item.cueCard || {};
    return {
      part: 2,
      part1_questions: null,
      cue_card: {
        topic: cc.topic,
        bullets: cc.bullets || [],
        explainLine: cc.explainLine || '',
        prepSeconds: PREP_SECONDS,
        speakSecondsMin: SPEAK_SECONDS_MIN,
        speakSecondsMax: SPEAK_SECONDS_MAX,
        audioPath: ap('cue'),
        roundOff: (item.roundOff || []).map((t, i) => ({ text: String(t), audioPath: ap(`r${i + 1}`) })),
        // Batch-generated cards carry their family + linked Part 1/Part 3
        // questions so the /speaking hubs can group and list them.
        ...(cc.family ? { family: cc.family } : {}),
        ...(cc.linkedPart1 ? { linkedPart1: cc.linkedPart1 } : {}),
        ...(cc.linkedPart3 ? { linkedPart3: cc.linkedPart3 } : {}),
      },
      part3_followups: null,
    };
  }
  // part 3
  return {
    part: 3,
    part1_questions: null,
    cue_card: null,
    part3_followups: {
      theme: item.theme,
      questions: (item.questions || []).map((t, i) => ({ text: String(t), audioPath: ap(`q${i + 1}`) })),
    },
  };
}

async function upsertPassage(env, item, slug, details) {
  const passageRow = {
    slug,
    skill: 'speaking',
    module: null, // Speaking is single-module
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
  // passages.created_at (default now(), untouched by later upserts) is the
  // "published/added" timestamp /speaking/new-cue-cards sorts and dates by.
  const createdAt = rows[0].created_at || null;

  await pg(env, 'speaking_details', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=minimal',
    query: 'on_conflict=passage_id',
    body: {
      passage_id: passageId,
      part: details.part,
      part1_questions: details.part1_questions,
      cue_card: details.cue_card,
      part3_followups: details.part3_followups,
    },
  });
  return { passageId, createdAt };
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

// Validate a BUILT item (post topic -> item conversion): the spoken cue script
// must stay short enough to read naturally, and nothing may claim official
// provenance.
function validateBuiltItem(item) {
  const errors = [];
  const script = cueCardScript(item.cueCard || {});
  const scriptWords = script.split(/\s+/).filter(Boolean).length;
  if (scriptWords > 70) errors.push(`${item.title}: cue script is ${scriptWords} words (max 70)`);
  if (scriptWords < 15) errors.push(`${item.title}: cue script is only ${scriptWords} words`);
  const banned = containsBannedPhrase(`${item.title} ${script}`);
  if (banned) errors.push(`${item.title}: banned phrase "${banned}"`);
  if (!item.title.startsWith('IELTS Speaking Cue Card: ')) errors.push(`${item.title}: unexpected title prefix`);
  return errors;
}

// ---------------------------------------------------------------------------
// BATCH MODE (--from-topics)
// ---------------------------------------------------------------------------
async function runFromTopics() {
  const topics = JSON.parse(readFileSync(TOPICS_FILE, 'utf8'));
  const env = loadEnv();

  // 1. Validate the whole bank up front. A bad topic anywhere is a content bug.
  const { errors, nearDuplicates } = validateTopicBank(topics);
  if (errors.length) {
    console.error(`\nRefusing to run: topics.json has ${errors.length} validation error(s):`);
    errors.slice(0, 25).forEach((e) => console.error('  -', e));
    process.exit(1);
  }
  const internalDupes = nearDuplicates.filter((d) => !d.existing);
  if (internalDupes.length) {
    console.error(`\nRefusing to run: ${internalDupes.length} near-duplicate cue-card title(s) inside topics.json:`);
    internalDupes.slice(0, 10).forEach((d) => console.error(`  - "${d.a}" ~ "${d.b}" (${d.score.toFixed(2)})`));
    process.exit(1);
  }
  log(`topics.json OK — ${topics.length} cue-card topics, ${new Set(topics.map((t) => t.family)).size} families`);

  // 2. Slice the batch.
  const start = (BATCH - 1) * SIZE;
  let batch = topics.slice(start, start + SIZE);
  if (ONLY) batch = batch.filter((t) => t.slug.includes(ONLY));
  if (!batch.length) {
    log(`batch ${BATCH} (size ${SIZE}) is empty — topics.json has ${topics.length} topics.`);
    return;
  }

  // 3. Skip anything already in the DB (idempotent re-runs), and fuzzy-check the
  //    batch against titles that already exist.
  let existing = { slugs: new Set(), titles: [] };
  const canReachDb = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  if (canReachDb) {
    try {
      existing = await fetchExistingSpeaking(env);
    } catch (e) {
      if (DO_IMPORT) throw e;
      log(`(could not read existing slugs: ${e.message} — continuing, dry run)`);
    }
  }
  if (existing.titles.length) {
    const { nearDuplicates: vsDb } = validateTopicBank(batch, { existingTitles: existing.titles });
    vsDb
      .filter((d) => d.existing)
      .forEach((d) => log(`NOTE near-duplicate of an existing item: "${d.a}" ~ "${d.b}" (${d.score.toFixed(2)})`));
  }

  const planned = [];
  let skipped = 0;
  for (const topic of batch) {
    const item = topicToItem(topic);
    const slug = passageSlugFor(topic);
    if (existing.slugs.has(slug) && !FORCE) {
      skipped += 1;
      continue;
    }
    planned.push({ topic, item, slug });
  }

  // 4. Validate the built items.
  const itemErrors = planned.flatMap(({ item }) => validateBuiltItem(item));
  if (itemErrors.length) {
    console.error(`\nRefusing to run: ${itemErrors.length} generated item(s) failed validation:`);
    itemErrors.slice(0, 20).forEach((e) => console.error('  -', e));
    process.exit(1);
  }

  log(
    `batch ${BATCH}: ${batch.length} topics -> ${planned.length} to generate, ${skipped} already imported` +
      `${DRY_RUN ? ' (DRY RUN — no TTS, no writes)' : ''}`
  );

  // 5. Write the batch file (the reviewable artefact) BEFORE any network work.
  try {
    mkdirSync(BATCH_OUT, { recursive: true });
  } catch {
    /* noop */
  }
  const batchFile = join(BATCH_OUT, `batch-${BATCH}.json`);
  writeFileSync(
    batchFile,
    JSON.stringify(
      {
        batch: BATCH,
        size: SIZE,
        generatedAt: new Date().toISOString(),
        source: 'ai-authored',
        skippedAlreadyImported: skipped,
        items: planned.map(({ topic, item, slug }) => ({
          topicSlug: topic.slug,
          family: topic.family,
          slug,
          title: item.title,
          url: `${SITE}/speakingquestion/${slug}`,
          difficulty: item.difficulty,
          cueCard: item.cueCard,
          cueScript: cueCardScript(item.cueCard),
        })),
      },
      null,
      2
    ) + '\n'
  );
  log('batch file ->', batchFile);

  if (!DO_IMPORT) {
    log(
      DRY_RUN
        ? 'DRY RUN complete. Re-run with --import (and optionally --model-answers --ping) to publish.'
        : 'No --import flag: nothing was written to Storage or the DB.'
    );
    return;
  }

  if (!env.OPENAI_API_KEY || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('\nRefusing to import: OPENAI_API_KEY, SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must all be set.\n');
    process.exit(1);
  }

  // 6. Import: TTS -> Storage -> passages + speaking_details.
  const imported = [];
  const failed = [];
  for (const { item, slug } of planned) {
    try {
      const jobs = audioJobs(item);
      for (const job of jobs) {
        const path = `speaking/${slug}/${job.key}.mp3`;
        if (REUSE_AUDIO && (await objectExists(env, path))) continue;
        const buf = await ttsClip(env, job.text);
        try {
          mkdirSync(join(OUT, slug), { recursive: true });
        } catch {
          /* noop */
        }
        writeFileSync(join(OUT, slug, `${job.key}.mp3`), buf);
        await uploadObject(env, path, buf);
      }
      const details = buildDetails(item, slug);
      const { createdAt } = await upsertPassage(env, item, slug, details);
      imported.push({ slug, title: item.title, family: item.__family, createdAt });
      log(`[${slug}] imported (${jobs.length} clip(s))`);
    } catch (e) {
      failed.push({ slug, error: e.message });
      console.error(`  FAILED ${slug}: ${e.message}`);
    }
  }
  log(`import complete: ${imported.length} imported, ${failed.length} failed, ${skipped} skipped`);

  // 7. Model answers for exactly the new slugs (band 8-9 teaser + premium).
  if (DO_MODEL_ANSWERS && imported.length) {
    log(`generating model answers for ${imported.length} new cue card(s)…`);
    for (const row of imported) {
      const res = spawnSync(
        process.execPath,
        [join(ROOT, 'scripts', 'content', 'generate-speaking-model-answers.mjs'), `--only=${row.slug}`],
        { stdio: 'inherit', cwd: ROOT }
      );
      if (res.status !== 0) console.error(`  model answer FAILED for ${row.slug}`);
    }
  }

  // 8. IndexNow: submit the new cue-card URLs plus the hubs they changed.
  if (DO_PING && imported.length) {
    const families = [...new Set(imported.map((r) => r.family).filter(Boolean))];
    const paths = [
      ...imported.map((r) => `/speakingquestion/${r.slug}`),
      '/speaking/new-cue-cards',
      '/speaking/part-2',
      '/speakingquestion',
      ...families.map((f) => `/speaking/topics/${f}`),
    ];
    log(`pinging IndexNow with ${paths.length} URL(s)…`);
    const res = spawnSync(process.execPath, [join(ROOT, 'scripts', 'indexnow-ping.mjs'), ...paths], {
      stdio: 'inherit',
      cwd: ROOT,
    });
    if (res.status !== 0) console.error('  IndexNow ping failed');
  }

  writeFileSync(
    join(BATCH_OUT, `batch-${BATCH}.result.json`),
    JSON.stringify({ batch: BATCH, importedAt: new Date().toISOString(), imported, failed, skipped }, null, 2) + '\n'
  );
  if (failed.length) process.exitCode = 1;
}

// ---------------------------------------------------------------------------
// LEGACY MODE (data/*.json)
// ---------------------------------------------------------------------------
async function runLegacy() {
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
  const summary = { total: 0, part1: 0, part2: 0, part3: 0, failed: 0, ttsClips: 0, ttsChars: 0, reusedClips: 0 };

  for (const item of items) {
    const slug = stableSlug(item.title);
    if (ONLY && !slug.includes(ONLY) && !item.__file.includes(ONLY)) continue;

    try {
      const jobs = audioJobs(item);
      let clipsSynth = 0;
      let clipsReused = 0;
      let chars = 0;
      for (const job of jobs) {
        const path = `speaking/${slug}/${job.key}.mp3`;
        const already = REUSE_AUDIO ? await objectExists(env, path) : false;
        if (already) {
          clipsReused += 1;
          continue;
        }
        const buf = await ttsClip(env, job.text);
        chars += job.text.length;
        clipsSynth += 1;
        try {
          mkdirSync(join(OUT, slug), { recursive: true });
        } catch {
          /* noop */
        }
        writeFileSync(join(OUT, slug, `${job.key}.mp3`), buf);
        if (!DRY_RUN) await uploadObject(env, path, buf);
      }
      summary.ttsClips += clipsSynth;
      summary.ttsChars += chars;
      summary.reusedClips += clipsReused;

      const details = buildDetails(item, slug);
      if (!DRY_RUN) await upsertPassage(env, item, slug, details);

      summary.total += 1;
      summary[`part${item.part}`] += 1;
      log(
        `[${slug}] part${item.part} — ${clipsSynth} synth, ${clipsReused} reused, ${chars} chars${
          DRY_RUN ? ' (dry-run, no writes)' : ' -> uploaded + upserted'
        }`
      );
      report.push({
        title: item.title,
        slug,
        part: item.part,
        clips: jobs.length,
        clipsSynth,
        clipsReused,
        ttsChars: chars,
        audioPaths: jobs.map((j) => `speaking/${slug}/${j.key}.mp3`),
        samplePublicUrl: `${env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/speaking/${slug}/${jobs[0]?.key}.mp3`,
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

async function main() {
  if (FROM_TOPICS) return runFromTopics();
  return runLegacy();
}

main().catch((e) => {
  console.error('[gen-speaking] fatal:', e);
  process.exit(1);
});
