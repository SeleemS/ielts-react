#!/usr/bin/env node
/**
 * Generate one gap-cluster blog post and write it to content/posts/<slug>.md.
 *
 * This used to string-splice a JS object into lib/posts.js. Posts are now one
 * markdown file each, so the script writes a file and touches nothing else —
 * no source mutation, no risk of corrupting 78 other articles with a bad
 * template-literal escape.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadEnv } from './_env.mjs';
import { stringifyFrontmatter } from '../../lib/frontmatter.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const postsDir = join(root, 'content', 'posts');
mkdirSync(postsDir, { recursive: true });

const topics = JSON.parse(
  readFileSync(join(root, 'scripts', 'content', 'blog-gap-topics.json'), 'utf8')
);
const existingSlugs = readdirSync(postsDir)
  .filter((file) => file.endsWith('.md'))
  .map((file) => file.replace(/\.md$/, ''));

const env = loadEnv();
if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required.');
const model = env.OPENAI_CONTENT_MODEL || env.OPENAI_WRITING_MODEL || 'gpt-5.1';

const day = new Date().toISOString().slice(0, 10);
const offset = [...day].reduce((sum, char) => sum + char.charCodeAt(0), 0) % topics.length;
const topic = topics.find((_, index) => !existingSlugs.some((slug) => slug.includes(String((index + offset) % topics.length)))) || topics[offset];
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENAI_API_KEY}` },
  body: JSON.stringify({
    model,
    messages: [
      { role: 'system', content: 'Write a trustworthy, specific IELTS preparation article for IELTS-Bank. It must be 1,200-1,600 words, original, current, practical and accurate. Use semantic HTML limited to p, h2, h3, ul, ol, li, strong, em and internal a links. Include worked examples and a concrete practice routine. Do not claim affiliation with IELTS owners, real leaked tests, guaranteed bands, official examiner status or unverifiable current test trends. Never call a paid feature free. The Writing Checker offers one free sample score after signup, while the full report and continued scoring are Premium; link to /pricing when describing Premium. Link naturally to relevant /readingquestion, /listeningquestion, /writingquestion, /speakingquestion, /ielts-writing-checker, /band-calculator, /band-estimator or /mock-test pages. Return a timeless title without a year. Also return "answer": a 2-3 sentence direct answer to the question the title implies, written as plain text with no markup — it is rendered as a "Quick answer" capsule above the article, so it must be accurate and self-contained rather than a teaser.' },
      { role: 'user', content: `Topic: ${topic}\nExisting slugs to avoid duplicating: ${existingSlugs.join(', ')}` },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'blog_post', strict: true, schema: { type: 'object', additionalProperties: false, properties: { slug: { type: 'string' }, title: { type: 'string' }, excerpt: { type: 'string' }, answer: { type: 'string' }, content_html: { type: 'string' } }, required: ['slug', 'title', 'excerpt', 'answer', 'content_html'] } } },
  }),
});
if (!response.ok) throw new Error(`OpenAI ${response.status}: ${(await response.text()).slice(0, 300)}`);
const payload = await response.json();
const post = JSON.parse(payload?.choices?.[0]?.message?.content || '{}');
if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(post.slug) || existingSlugs.includes(post.slug)) throw new Error('Generated slug is invalid or duplicated.');
if ((post.content_html.match(/\b\w+\b/g) || []).length < 1000) throw new Error('Generated article is too short.');
if (/<script|<style|javascript:|on\w+=/i.test(post.content_html)) throw new Error('Generated article contains unsafe markup.');
if (/<[a-z]/i.test(post.answer) || post.answer.trim().length < 80) throw new Error('Generated Quick answer is markup or too short.');

const date = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const file = join(postsDir, `${post.slug}.md`);
if (existsSync(file)) throw new Error(`content/posts/${post.slug}.md already exists.`);

// The body is stored verbatim; lib/posts.js does not trim it and
// pages/blog/[slug].js sanitises it at render time.
writeFileSync(
  file,
  stringifyFrontmatter(
    { title: post.title, date, excerpt: post.excerpt, answer: post.answer.trim() },
    `\n${post.content_html}\n`,
    { order: ['title', 'date', 'updated', 'excerpt', 'answer', 'tags'] }
  )
);
console.log(`[blog] generated content/posts/${post.slug}.md for topic: ${topic}`);
