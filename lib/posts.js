// lib/posts.js
// Blog post loader. Posts live one-per-file in content/posts/<slug>.md with a
// YAML frontmatter header; this module reads them at build time and exposes the
// same `posts` array the codebase has always imported.
//
// WHY THE FILES MOVED: the post objects used to be inlined in this module,
// which grew past 4,000 lines and became unreviewable — a one-line typo fix in
// an article showed up as a diff against a monolith, and the generator script
// had to string-splice new posts into source code. One file per post makes each
// article independently diffable and lets the generator just write a file.
//
// CONSUMERS (all server-side): pages/blog/index.js, pages/blog/[slug].js,
// pages/sitemap.xml.js, pages/api/cron/lifecycle-emails.js. The two blog pages
// reference `posts` ONLY inside getStaticProps/getStaticPaths, so Next strips
// this module (and `fs`) from the client bundle. sitemap.xml and the lifecycle
// cron read it at REQUEST time on Vercel, which is why next.config.js adds
// content/posts to those routes' output file tracing.
//
// FRONTMATTER FIELDS
//   title    (required) — H1 + <title> + OG title
//   date     (required) — human-readable, e.g. "August 31, 2026"
//   excerpt  (required) — meta description + blog index card copy
//   updated  (optional) — set ONLY when the article was genuinely revised; it
//                         drives the visible "Updated …" line and JSON-LD
//                         dateModified, so it must never be back-filled falsely
//   answer   (optional) — 2–3 sentence "Quick answer" capsule rendered directly
//                         under the H1, before the body
//   faq      (optional) — array of {q, a} objects, rendered as a visible FAQ
//                         section AND as FAQPage JSON-LD from the same array,
//                         so structured data can never describe questions the
//                         reader cannot see
//   tags     (optional) — array of strings, for future grouping
// The slug is the filename; it is never duplicated inside the file.

import fs from 'node:fs';
import path from 'node:path';
import { parseFrontmatter } from './frontmatter.mjs';

export const POSTS_DIR = path.join(process.cwd(), 'content', 'posts');

const REQUIRED = ['title', 'date', 'excerpt'];

function readPost(file) {
  const slug = file.replace(/\.md$/, '');
  const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf8');
  const { data, content } = parseFrontmatter(raw, { source: `content/posts/${file}` });

  REQUIRED.forEach((key) => {
    if (typeof data[key] !== 'string' || !data[key].trim()) {
      throw new Error(`content/posts/${file}: frontmatter "${key}" is required.`);
    }
  });
  if (Number.isNaN(new Date(data.date).getTime())) {
    throw new Error(`content/posts/${file}: frontmatter "date" is not a parseable date.`);
  }
  if (!content.trim()) {
    throw new Error(`content/posts/${file}: the post body is empty.`);
  }

  // Body is kept VERBATIM (no trim): pages/blog/[slug].js renders it through
  // lib/sanitize.js and any whitespace change would be an unreviewed content
  // edit. Optional keys are only attached when actually present so a post
  // without them is shaped exactly like the pre-migration object.
  const post = { slug, title: data.title, date: data.date, excerpt: data.excerpt, content };
  if (data.updated) post.updated = data.updated;
  if (data.answer) post.answer = data.answer;
  if (Array.isArray(data.faq) && data.faq.length) {
    data.faq.forEach((item, i) => {
      if (!item || typeof item.q !== 'string' || typeof item.a !== 'string') {
        throw new Error(`content/posts/${file}: faq[${i}] needs both a "q" and an "a" string.`);
      }
    });
    post.faq = data.faq;
  }
  if (Array.isArray(data.tags) && data.tags.length) post.tags = data.tags;
  return post;
}

function loadPosts() {
  const files = fs
    .readdirSync(POSTS_DIR)
    .filter((file) => file.endsWith('.md'))
    .sort();

  const loaded = files.map(readPost);

  // Newest first. pages/api/cron/lifecycle-emails.js takes posts[0] as "the
  // latest article", so the order is load-bearing, not cosmetic. Same-day posts
  // tie-break on slug purely so the build output is deterministic.
  return loaded.sort(
    (a, b) => new Date(b.date) - new Date(a.date) || a.slug.localeCompare(b.slug)
  );
}

export const posts = loadPosts();

export function getPostBySlug(slug) {
  return posts.find((post) => post.slug === slug) || null;
}

export const postSlugs = posts.map((post) => post.slug);

// "August 2, 2026" -> "August 2026". The visible freshness line under the H1
// shows month precision on purpose: a day-level "Updated" stamp invites the
// reader to expect daily revision, which is not what `updated` means here.
export function formatMonthYear(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// ISO-8601 for <time dateTime> and JSON-LD. Returns null for an unparseable
// value so callers can omit the attribute rather than emit garbage.
export function toIsoDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
