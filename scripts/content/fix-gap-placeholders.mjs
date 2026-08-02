#!/usr/bin/env node
/**
 * fix-gap-placeholders.mjs
 * ------------------------
 * Replace placeholder question prompt_text values ("Gap 7") with the real
 * sentence containing that gap, extracted from the owning group's
 * instructions_html/prompt (audit 2026-08-01, content fix #10 part 2).
 *
 * For each question whose prompt_text is "Gap N", the group HTML contains a
 * marker like "(N)&nbsp;______" inside a <li>, <td> row or sentence. We take
 * the innermost fragment containing the marker, strip tags, turn every gap
 * marker into a plain blank, and store the result as the question's
 * prompt_text (used for display labels and accessibility).
 *
 * Usage:
 *   node scripts/content/fix-gap-placeholders.mjs [--dry-run]
 */
import { loadEnv } from './_env.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const env = loadEnv();
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const HEADERS = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  'Content-Type': 'application/json',
};

async function rest(path, init = {}) {
  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...HEADERS, ...(init.headers || {}) },
  });
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.status === 204 ? null : response.json();
}

function stripTags(html) {
  return String(html)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&ndash;/g, '–')
    .replace(/\s+/g, ' ')
    .trim();
}

// The marker for gap N, tolerant of &nbsp; vs space and underscore runs.
function markerRe(n) {
  return new RegExp(`\\(${n}\\)(?:&nbsp;|\\s)*_{3,}`);
}

// Find the innermost <li>/<td>/<th> fragment containing the marker; fall back
// to the sentence around it inside the flattened text.
function extractStem(html, n) {
  const re = markerRe(n);
  for (const tag of ['li', 'td', 'th']) {
    const fragments = html.match(new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, 'g')) || [];
    for (const fragment of fragments) {
      if (re.test(fragment)) return cleanup(fragment, n);
    }
  }
  const text = stripTags(html.replace(/(&nbsp;|\s)*_{3,}/g, ' ______'));
  const plainRe = new RegExp(`\\(${n}\\) ?______`);
  if (!plainRe.test(text)) return null;
  // Sentence boundaries: split on '. ' but keep the piece with our marker.
  const sentences = text.split(/(?<=[.!?])\s+/);
  const hit = sentences.find((s) => plainRe.test(s));
  return hit ? cleanup(hit, n) : null;
}

function cleanup(fragment, n) {
  let text = stripTags(String(fragment).replace(/(&nbsp;|\s)*_{3,}/g, ' ______'));
  // Our gap becomes a plain blank; other gaps in the same fragment too.
  text = text.replace(/\(\d+\) ?______/g, '______').replace(/\s+/g, ' ').trim();
  if (!text.includes('______')) return null;
  return text;
}

async function main() {
  const questions = await rest(
    'questions?select=id,prompt_text,global_number,question_group_id&prompt_text=like.Gap*&order=question_group_id,global_number'
  );
  const targets = questions.filter((q) => /^Gap \d+$/.test(q.prompt_text));
  const groupIds = [...new Set(targets.map((q) => q.question_group_id))];
  const groups = new Map();
  for (let i = 0; i < groupIds.length; i += 30) {
    const batch = groupIds.slice(i, i + 30);
    const rows = await rest(
      `question_groups?select=id,prompt,instructions_html&id=in.(${batch.join(',')})`
    );
    for (const row of rows) groups.set(row.id, row);
  }

  let fixed = 0;
  let missed = 0;
  for (const q of targets) {
    const gapNumber = Number(q.prompt_text.replace('Gap ', ''));
    const group = groups.get(q.question_group_id);
    const html = `${group?.instructions_html || ''}\n${group?.prompt || ''}`;
    const stem = extractStem(html, gapNumber);
    if (!stem) {
      console.warn(`  MISS q=${q.id} gap=${gapNumber} group=${q.question_group_id}`);
      missed += 1;
      continue;
    }
    if (DRY_RUN) {
      console.log(`would set ${q.prompt_text} -> "${stem}"`);
    } else {
      await rest(`questions?id=eq.${q.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ prompt_text: stem }),
      });
    }
    fixed += 1;
  }
  console.log(`[fix-gaps] ${DRY_RUN ? 'would fix' : 'fixed'}=${fixed} missed=${missed} of ${targets.length}`);
}

main().catch((error) => {
  console.error('[fix-gaps] fatal:', error);
  process.exit(1);
});
