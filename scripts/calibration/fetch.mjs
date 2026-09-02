// scripts/calibration/fetch.mjs
// Turn a licensed, human-scored essay corpus into the normalised JSONL the
// calibration runner reads, plus a committed manifest (ids + labels + hash) so
// a published accuracy number can always be traced back to the exact rows it
// came from.
//
//   node scripts/calibration/fetch.mjs --corpus dress --input <file-or-url>
//   node scripts/calibration/fetch.mjs --corpus generic --input essays.csv
//
// See README.md for which corpora are usable and why. Raw essay text is written
// to data/corpus.jsonl, which is GITIGNORED: several candidate corpora forbid
// redistribution, and we have no need to republish anyone's essays. Only the
// manifest (ids, labels, word counts, a hash of each essay) is committed.
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(HERE, 'data');
const CORPUS_PATH = join(DATA_DIR, 'corpus.jsonl');
const MANIFEST_PATH = join(DATA_DIR, 'manifest.json');

// ---------------------------------------------------------------------------
// Corpus adapters
// ---------------------------------------------------------------------------
// Every adapter must return rows of:
//   { id, task, prompt, essay, humanBand, humanCriteria? }
// `humanBand` is an IELTS band 0-9. An adapter that has to CONVERT from another
// rubric must say so in `scale` — the page prints that sentence verbatim, so a
// converted label is never presented as a native IELTS band.

// The IELTS criteria keys our scorer returns, so per-criterion MAE lines up.
const IELTS_CRITERIA = [
  { key: 'taskResponse', label: 'Task Response' },
  { key: 'coherenceCohesion', label: 'Coherence & Cohesion' },
  { key: 'lexicalResource', label: 'Lexical Resource' },
  { key: 'grammaticalRange', label: 'Grammatical Range & Accuracy' },
];

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function countWords(text) {
  return String(text || '').split(/\s+/).filter(Boolean).length;
}

// --- generic: a CSV/JSONL that already carries IELTS bands ------------------
// Columns (case-insensitive, first match wins):
//   id                                  -> id
//   task / task_type                    -> 1 or 2 (defaults to 2)
//   question / prompt / topic           -> prompt
//   essay / essay_text / text / response-> essay
//   overall / overall_band / band       -> humanBand
//   task_response / task_achievement, coherence_cohesion,
//   lexical_resource, grammatical_range / range_accuracy -> humanCriteria
const GENERIC_FIELDS = {
  id: ['id', 'essay_id'],
  task: ['task', 'task_type'],
  prompt: ['question', 'prompt', 'topic'],
  essay: ['essay', 'essay_text', 'text', 'response', 'full_text'],
  band: ['overall', 'overall_band', 'band', 'score'],
  taskResponse: ['task_response', 'task_achievement', 'task_response_band', 'task_achievement_band'],
  coherenceCohesion: ['coherence_cohesion', 'coherence_and_cohesion', 'coherence_cohesion_band'],
  lexicalResource: ['lexical_resource', 'lexical_resource_band'],
  grammaticalRange: ['grammatical_range', 'range_accuracy', 'grammatical_range_band'],
};

function pick(row, names) {
  const lower = new Map(Object.keys(row).map((k) => [k.toLowerCase(), k]));
  for (const name of names) {
    const key = lower.get(name);
    if (key !== undefined && row[key] !== undefined && row[key] !== '') return row[key];
  }
  return undefined;
}

function parseTask(value) {
  const text = String(value ?? '').toLowerCase();
  return text.includes('1') ? 1 : 2;
}

function genericAdapter(rows) {
  return rows.map((row, i) => {
    const criteria = {};
    IELTS_CRITERIA.forEach(({ key }) => {
      const value = num(pick(row, GENERIC_FIELDS[key]));
      if (value !== null) criteria[key] = value;
    });
    return {
      id: String(pick(row, GENERIC_FIELDS.id) ?? `row-${i + 1}`),
      task: parseTask(pick(row, GENERIC_FIELDS.task) ?? 2),
      prompt: String(pick(row, GENERIC_FIELDS.prompt) ?? '').trim(),
      essay: String(pick(row, GENERIC_FIELDS.essay) ?? '').trim(),
      humanBand: num(pick(row, GENERIC_FIELDS.band)),
      humanCriteria: Object.keys(criteria).length ? criteria : undefined,
    };
  });
}

// --- dress: DREsS_New (content/organization/language, each 1-5 by 0.5) ------
// DREsS is NOT scored in IELTS bands. Its three rubrics are converted onto the
// 0-9 band scale by a linear map of the 3-15 total (band = 1.5 * total / 3),
// which is an APPROXIMATION and is labelled as one everywhere it is shown.
// A rubric-converted label can only support a "how close is the scorer to a
// human rater" claim, never a "how close is it to an IELTS examiner" claim.
const DRESS_SCALE =
  'Converted from DREsS content/organization/language ratings (each 1-5) onto the 0-9 band scale; an approximation, not a native IELTS band.';

function dressToBand(total) {
  // total 3..15 -> band 1.5..9, then snapped to the half-band grid.
  if (total === null) return null;
  const band = (total / 15) * 9;
  return Math.min(9, Math.max(0, Math.round(band * 2) / 2));
}

function dressAdapter(rows) {
  return rows.map((row, i) => {
    const content = num(pick(row, ['content']));
    const organization = num(pick(row, ['organization', 'organisation']));
    const language = num(pick(row, ['language']));
    const total =
      content !== null && organization !== null && language !== null
        ? content + organization + language
        : num(pick(row, ['total']));
    return {
      id: String(pick(row, ['id', 'essay_id']) ?? `dress-${i + 1}`),
      task: 2,
      prompt: String(pick(row, ['prompt', 'essay_prompt', 'question']) ?? '').trim(),
      essay: String(pick(row, ['essay', 'essay_text', 'text']) ?? '').trim(),
      humanBand: dressToBand(total),
      humanCriteria: undefined, // DREsS rubrics do not map 1:1 onto IELTS criteria
    };
  });
}

const ADAPTERS = {
  generic: { fn: genericAdapter, scale: 'Native IELTS band labels as published by the corpus.' },
  dress: { fn: dressAdapter, scale: DRESS_SCALE },
};

// ---------------------------------------------------------------------------
// Input parsing (CSV / JSONL / JSON). Deliberately dependency-free.
// ---------------------------------------------------------------------------
function parseCsv(text) {
  const rows = [];
  let field = '';
  let record = [];
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ',') {
      record.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      record.push(field);
      rows.push(record);
      record = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || record.length) {
    record.push(field);
    rows.push(record);
  }
  const [header, ...body] = rows.filter((r) => r.some((c) => c !== ''));
  if (!header) return [];
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ''])));
}

function parseInput(text, path) {
  const trimmed = text.trim();
  if (path.endsWith('.csv')) return parseCsv(text);
  if (path.endsWith('.jsonl') || path.endsWith('.ndjson')) {
    return trimmed.split('\n').filter(Boolean).map((line) => JSON.parse(line));
  }
  const parsed = JSON.parse(trimmed);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.rows)) return parsed.rows;
  if (Array.isArray(parsed.data)) return parsed.data;
  throw new Error('Could not find an array of rows in the JSON input.');
}

// ---------------------------------------------------------------------------
// Selection: prefer Task 2 essays spread across bands 4-8 rather than the
// corpus' natural distribution, which is usually a spike at 6.0-6.5. A scorer
// that is only ever tested at band 6 has not been tested.
// ---------------------------------------------------------------------------
const MIN_WORDS = 50; // matches the API route's floor
const TARGET_BANDS = [4, 4.5, 5, 5.5, 6, 6.5, 7, 7.5, 8];

function stratify(rows, limit, perBandCap) {
  const buckets = new Map();
  rows.forEach((row) => {
    const band = Math.round(row.humanBand * 2) / 2;
    if (!TARGET_BANDS.includes(band)) return;
    if (!buckets.has(band)) buckets.set(band, []);
    buckets.get(band).push(row);
  });
  const cap = perBandCap || Math.ceil(limit / TARGET_BANDS.length);
  const picked = [];
  // Round-robin across bands so an under-populated band does not starve.
  for (let round = 0; round < cap && picked.length < limit; round += 1) {
    for (const band of TARGET_BANDS) {
      const bucket = buckets.get(band);
      if (bucket && bucket[round] && picked.length < limit) picked.push(bucket[round]);
    }
  }
  return picked;
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith('--')) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      i += 1;
    } else args[key] = true;
  }
  return args;
}

async function readInput(input) {
  if (/^https?:\/\//.test(input)) {
    const headers = {};
    if (process.env.HF_TOKEN) headers.Authorization = `Bearer ${process.env.HF_TOKEN}`;
    const response = await fetch(input, { headers });
    if (!response.ok) {
      throw new Error(
        `Download failed: ${response.status} ${response.statusText}. ` +
          'Gated corpora (DREsS_New included) need HF_TOKEN set to a token that has accepted the terms.'
      );
    }
    return response.text();
  }
  return readFileSync(input, 'utf8');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const corpus = String(args.corpus || 'generic');
  const adapter = ADAPTERS[corpus];
  if (!adapter) {
    console.error(`Unknown --corpus "${corpus}". Known: ${Object.keys(ADAPTERS).join(', ')}`);
    process.exit(1);
  }
  if (!args.input) {
    console.error(
      'Usage: node scripts/calibration/fetch.mjs --corpus <generic|dress> --input <file|url> ' +
        '[--limit 240] [--name "Corpus name"] [--url <source url>] [--licence "MIT"] [--licence-url <url>]'
    );
    process.exit(1);
  }

  const limit = Number(args.limit || 240);
  const raw = await readInput(String(args.input));
  const parsed = parseInput(raw, String(args.input));
  const normalised = adapter
    .fn(parsed)
    .filter((r) => r.essay && r.humanBand !== null && countWords(r.essay) >= MIN_WORDS);

  const selected = stratify(normalised, limit, Number(args.perBand || 0));
  if (!selected.length) {
    console.error('No usable rows: check the column names and that bands are 4-8.');
    process.exit(1);
  }

  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(CORPUS_PATH, `${selected.map((r) => JSON.stringify(r)).join('\n')}\n`, 'utf8');

  const manifest = {
    corpus: {
      key: corpus,
      name: args.name || null,
      url: args.url || (/^https?:\/\//.test(String(args.input)) ? String(args.input) : null),
      licence: args.licence || null,
      licenceUrl: args['licence-url'] || null,
      scale: adapter.scale,
      retrievedAt: new Date().toISOString().slice(0, 10),
    },
    counts: {
      parsed: parsed.length,
      usable: normalised.length,
      selected: selected.length,
    },
    // Committed so anyone can verify the labels and confirm the essay text used
    // was never edited, without us redistributing the essays themselves.
    essays: selected.map((r) => ({
      id: r.id,
      task: r.task,
      humanBand: r.humanBand,
      humanCriteria: r.humanCriteria || null,
      words: countWords(r.essay),
      sha256: sha256(r.essay),
    })),
  };
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const dist = {};
  selected.forEach((r) => {
    const b = Math.round(r.humanBand * 2) / 2;
    dist[b] = (dist[b] || 0) + 1;
  });
  console.log(`Parsed ${parsed.length} rows, ${normalised.length} usable, selected ${selected.length}.`);
  console.log('Band distribution:', dist);
  console.log(`Wrote ${CORPUS_PATH} (gitignored) and ${MANIFEST_PATH} (committed).`);
  if (!manifest.corpus.licence) {
    console.warn('WARNING: no --licence given. report.mjs refuses to publish stats without one.');
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
