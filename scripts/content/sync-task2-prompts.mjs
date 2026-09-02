#!/usr/bin/env node
/**
 * Regenerate lib/task2Prompts.js from the published Writing Task 2 prompts in
 * Supabase.
 *
 *   node scripts/content/sync-task2-prompts.mjs
 *
 * WHY A CHECKED-IN CATALOGUE RATHER THAN A BUILD-TIME QUERY: the monthly
 * roundup pages (/ielts-writing-task-2-topics/<month>) are public content whose
 * exact wording we want reviewable in a diff. Generating them from a committed
 * catalogue means a build is deterministic, the pages render identically
 * offline and in CI, and adding prompts to the bank is a visible content change
 * rather than a silent one. Re-run this after seeding new Task 2 prompts.
 *
 * The `frame` on each row is DERIVED, never hand-typed — see lib/task2Frames.js.
 * Uses the anon key: this reads only published rows, exactly what the public
 * pages show.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './_env.mjs';
import { classifyTask2Frame, TASK2_FRAME_IDS } from '../../lib/task2Frames.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = loadEnv();
if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are required.');
}

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data, error } = await supabase
  .from('passages')
  .select('slug, title, module, topic_tags, created_at, updated_at, writing_details(task, prompt_html)')
  .eq('skill', 'writing')
  .eq('status', 'published')
  .order('created_at', { ascending: false });
if (error) throw new Error(`Supabase: ${error.message}`);

const rows = data
  .map((row) => {
    const details = Array.isArray(row.writing_details)
      ? row.writing_details[0] || {}
      : row.writing_details || {};
    return { row, details };
  })
  .filter(({ details }) => Number(details.task) === 2 && details.prompt_html)
  .map(({ row, details }) => ({
    slug: row.slug,
    title: row.title,
    module: row.module === 'general' ? 'general' : 'academic',
    frame: classifyTask2Frame(details.prompt_html),
    tags: [...(row.topic_tags || [])].sort(),
    added: String(row.created_at).slice(0, 10),
    updated: String(row.updated_at).slice(0, 10),
  }))
  // Newest first, slug tie-break so re-running produces a stable file.
  .sort((a, b) => (a.added < b.added ? 1 : a.added > b.added ? -1 : a.slug.localeCompare(b.slug)));

if (!rows.length) throw new Error('No published Task 2 prompts found — refusing to write an empty catalogue.');
const unknown = rows.filter((r) => !TASK2_FRAME_IDS.includes(r.frame));
if (unknown.length) throw new Error(`Unknown frame ids: ${unknown.map((r) => r.frame).join(', ')}`);

const counts = TASK2_FRAME_IDS.map((id) => `//   ${id}: ${rows.filter((r) => r.frame === id).length}`).join('\n');

const file = `// lib/task2Prompts.js
//
// GENERATED FILE — do not edit by hand.
// Run: node scripts/content/sync-task2-prompts.mjs
//
// Every published IELTS Writing Task 2 prompt in the question bank, newest
// first. \`frame\` is derived from the prompt's own instruction wording by
// lib/task2Frames.js, and \`added\`/\`updated\` come from the database row, so the
// monthly roundup pages can never claim a prompt is newer than it is.
//
// Frame counts at generation time:
${counts}

export const TASK2_PROMPTS = ${JSON.stringify(rows, null, 2)};

export default TASK2_PROMPTS;
`;

writeFileSync(join(root, 'lib', 'task2Prompts.js'), file);
console.log(`[task2] wrote lib/task2Prompts.js with ${rows.length} prompts`);
