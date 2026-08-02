#!/usr/bin/env node
// Verify speaking model answers coverage: counts speaking_details rows with a
// model_answer_html per part, flags published items still missing one, and
// prints one sample answer + meta for a spot check.
//
//   node scripts/content/verify-speaking-model-answers.mjs
import { createClient } from '@supabase/supabase-js';
import { loadEnv } from './_env.mjs';

const env = loadEnv();
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const { data, error } = await supabase
  .from('speaking_details')
  .select('part, model_answer_html, model_answer_meta, passages!inner(slug, status)')
  .eq('passages.status', 'published');
if (error) throw error;

const withAnswer = data.filter((r) => r.model_answer_html);
const byPart = {};
for (const r of withAnswer) byPart[r.part] = (byPart[r.part] || 0) + 1;
console.log(`published speaking items: ${data.length}`);
console.log(`with model_answer_html:  ${withAnswer.length}`, JSON.stringify(byPart));

const missing = data.filter((r) => !r.model_answer_html).map((r) => r.passages.slug);
if (missing.length) console.log('MISSING:', missing.join(', '));

const sample = withAnswer.find((r) => r.part === 2) || withAnswer[0];
if (sample) {
  console.log(`--- sample ${sample.passages.slug} (part ${sample.part}) ---`);
  console.log(sample.model_answer_html.slice(0, 600));
  console.log('--- meta ---');
  console.log(JSON.stringify(sample.model_answer_meta, null, 2));
}
process.exitCode = missing.length ? 1 : 0;
