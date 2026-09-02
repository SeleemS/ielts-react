// scripts/calibration/run.mjs
// Score every essay in data/corpus.jsonl through the SAME prompt, schema and
// model path the product uses, and append one JSON line per essay to
// results/<date>-<model>.jsonl.
//
//   node scripts/calibration/run.mjs                 # paid model (SCORING_MODEL_PAID)
//   node scripts/calibration/run.mjs --model gpt-4.1-mini   # free-tier comparison
//   node scripts/calibration/run.mjs --limit 10      # smoke test
//
// Resumable: ids already present in the output file are skipped, so an
// interrupted or rate-limited run is restarted with the same command and never
// pays twice for the same essay.
//
// Reads OPENAI_API_KEY from the environment or from .env.local in the repo root.
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

import { buildWritingSystemPrompt, buildWritingUserContent, PROMPT_VERSION_FILES } from '../../lib/writingScorePrompt.js';
import { buildWritingScoreSchema } from '../../lib/writingScoreSchema.js';
import { overallBand } from '../../lib/bandTables.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const CORPUS_PATH = join(HERE, 'data', 'corpus.jsonl');
const RESULTS_DIR = join(HERE, 'results');

const CONCURRENCY = 4; // keep well under the OpenAI rate limit; this is a batch job
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';
const TIMEOUT_MS = 90000;
const MAX_ATTEMPTS = 3;

// Load .env.local the way the Next.js dev server would, so the runner works
// from a checkout without exporting anything by hand.
function loadEnvLocal() {
  const path = join(ROOT, '.env.local');
  if (!existsSync(path)) return;
  readFileSync(path, 'utf8')
    .split('\n')
    .forEach((line) => {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i.exec(line);
      if (!match) return;
      const [, key, rawValue] = match;
      if (process.env[key] !== undefined) return;
      process.env[key] = rawValue.trim().replace(/^["']|["']$/g, '');
    });
}

// Git blob hashes of the files that define the prompt. Stamped into every
// results line so a stats file can never silently describe an older prompt.
function promptVersion() {
  try {
    const out = execFileSync('git', ['hash-object', ...PROMPT_VERSION_FILES], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    const combined = out.trim().split('\n').join('');
    return combined.slice(0, 12);
  } catch {
    return 'unknown';
  }
}

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

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function countWords(text) {
  return String(text || '').split(/\s+/).filter(Boolean).length;
}

async function scoreOnce({ essay, model }) {
  const words = countWords(essay.essay);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(OPENAI_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: buildWritingSystemPrompt(essay.task) },
          {
            role: 'user',
            content: buildWritingUserContent({
              task: essay.task,
              prompt: essay.prompt,
              essay: essay.essay,
              wordCount: words,
            }),
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: buildWritingScoreSchema(essay.task, { includeRewrite: true }),
        },
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return { ok: false, retryable: response.status === 429 || response.status >= 500, detail: detail.slice(0, 300) };
    }
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) return { ok: false, retryable: true, detail: 'empty content' };
    const result = JSON.parse(content);
    const criteria = result?.criteria || {};
    const first = essay.task === 1 ? criteria.taskAchievement : criteria.taskResponse;
    // Recompute the overall band from the four criteria exactly as the API
    // route does, rather than trusting the model's own arithmetic.
    const band = overallBand([
      first?.band,
      criteria.coherenceCohesion?.band,
      criteria.lexicalResource?.band,
      criteria.grammaticalRange?.band,
    ]);
    if (band === null) return { ok: false, retryable: false, detail: 'invalid criterion bands' };
    return {
      ok: true,
      aiBand: band,
      aiCriteria: {
        taskResponse: first?.band ?? null,
        coherenceCohesion: criteria.coherenceCohesion?.band ?? null,
        lexicalResource: criteria.lexicalResource?.band ?? null,
        grammaticalRange: criteria.grammaticalRange?.band ?? null,
      },
      usage: payload?.usage || null,
    };
  } catch (error) {
    return { ok: false, retryable: error.name === 'AbortError', detail: error.message };
  } finally {
    clearTimeout(timer);
  }
}

async function scoreWithRetries(essay, model) {
  let last = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    last = await scoreOnce({ essay, model });
    if (last.ok || !last.retryable) return last;
    await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
  }
  return last;
}

async function main() {
  loadEnvLocal();
  const args = parseArgs(process.argv.slice(2));

  if (!existsSync(CORPUS_PATH)) {
    console.error(
      `No corpus at ${CORPUS_PATH}. Run scripts/calibration/fetch.mjs first (see README.md).`
    );
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set (export it, or put .env.local in the repo root).');
    process.exit(1);
  }

  const model =
    String(args.model || '') ||
    process.env.SCORING_MODEL_PAID ||
    process.env.OPENAI_WRITING_MODEL ||
    'gpt-5.1';

  const corpus = readJsonl(CORPUS_PATH);
  const limit = args.limit ? Number(args.limit) : corpus.length;

  mkdirSync(RESULTS_DIR, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const outPath = join(RESULTS_DIR, `${date}-${model.replace(/[^\w.-]/g, '_')}.jsonl`);

  const done = new Set(readJsonl(outPath).map((r) => r.id));
  const todo = corpus.filter((e) => !done.has(e.id)).slice(0, Math.max(0, limit - done.size));

  const version = promptVersion();
  console.log(
    `Model ${model} | prompt ${version} | corpus ${corpus.length} | already done ${done.size} | to score ${todo.length}`
  );
  if (!todo.length) {
    console.log('Nothing to do. Run report.mjs next.');
    return;
  }

  let completed = 0;
  let failed = 0;
  const queue = [...todo];
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    for (;;) {
      const essay = queue.shift();
      if (!essay) return;
      const scored = await scoreWithRetries(essay, model);
      const line = {
        id: essay.id,
        task: essay.task,
        model,
        promptVersion: version,
        scoredAt: new Date().toISOString(),
        humanBand: essay.humanBand,
        humanCriteria: essay.humanCriteria || null,
        ...(scored.ok
          ? { aiBand: scored.aiBand, aiCriteria: scored.aiCriteria, usage: scored.usage }
          : { aiBand: null, error: scored.detail }),
      };
      // Append per essay: an interrupted run keeps everything already paid for.
      appendFileSync(outPath, `${JSON.stringify(line)}\n`, 'utf8');
      if (scored.ok) completed += 1;
      else {
        failed += 1;
        console.warn(`  ! ${essay.id}: ${scored.detail}`);
      }
      if ((completed + failed) % 20 === 0) {
        console.log(`  ...${completed + failed}/${todo.length} (${failed} failed)`);
      }
    }
  });
  await Promise.all(workers);

  console.log(`Done: ${completed} scored, ${failed} failed. Wrote ${outPath}`);
  console.log('Next: node scripts/calibration/report.mjs');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
