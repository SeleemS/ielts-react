import { posts } from '../lib/posts';
import { SKILLS, listMockTests, listPassages } from '../lib/supabase';
import { READING_QUESTION_TYPE_SLUGS } from '../lib/readingQuestionTypes';
import { LISTENING_PART_SLUGS } from '../lib/listeningQuestionTypes';
import { SPEAKING_PART_SLUGS } from '../lib/speakingParts';
import { SPEAKING_FAMILY_SLUGS } from '../lib/speakingTopicFamilies';
import { listRoundupMonths } from '../lib/task2Roundup';
import { SCORE_REQUIREMENT_COUNTRY_SLUGS } from '../lib/scoreRequirementsData';

import { SITE_URL } from '../lib/site';

export const STATIC_ROUTES = [
  '/',
  '/about',
  '/contactus',
  '/privacypolicy',
  '/termsofservice',
  '/blog',
  '/pricing',
  '/band-calculator',
  '/band-estimator',
  '/ielts-writing-checker',
  '/speaking-examiner',
  '/readingquestion',
  '/writingquestion',
  '/listeningquestion',
  '/speakingquestion',
  '/mock-test',
  // AI-citation-optimized content pages (LLM-visibility plan, Aug 2026).
  '/ielts-test-format',
  '/ielts-vs-toefl-pte-duolingo',
  '/ielts-writing-task-2-topics',
  '/ielts-band-descriptors',
  '/ielts-score-requirements',
  // Reading question-type hub pages (pages/reading/[type].js).
  ...READING_QUESTION_TYPE_SLUGS.map((slug) => `/reading/${slug}`),
  // Listening part hub pages (pages/listening/[type].js).
  ...LISTENING_PART_SLUGS.map((slug) => `/listening/${slug}`),
  // Speaking part hubs (pages/speaking/[part].js).
  ...SPEAKING_PART_SLUGS.map((slug) => `/speaking/${slug}`),
  // Speaking topic-family hubs (pages/speaking/topics/[family].js).
  ...SPEAKING_FAMILY_SLUGS.map((slug) => `/speaking/topics/${slug}`),
  // Freshness hub for newly published cue cards.
  '/speaking/new-cue-cards',
  // Per-country score requirement pages (pages/ielts-score-requirements/[country].js).
  ...SCORE_REQUIREMENT_COUNTRY_SLUGS.map((slug) => `/ielts-score-requirements/${slug}`),
];

// Build an ISO date (YYYY-MM-DD) or null. Accepts human-readable strings like
// "July 9, 2026" (blog post dates) as well as Date objects.
function isoDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function urlEntry(loc, lastmod) {
  const parts = [`<loc>${loc}</loc>`];
  if (lastmod) parts.push(`<lastmod>${lastmod}</lastmod>`);
  return `  <url>${parts.join('')}</url>`;
}

export async function getServerSideProps({ res }) {
  const entries = [];
  const today = isoDate(new Date());

  STATIC_ROUTES.forEach((route) =>
    entries.push({ loc: `${SITE_URL}${route}`, lastmod: today })
  );

  // Monthly Task 2 roundups (pages/ielts-writing-task-2-topics/[month].js).
  // Resolved per REQUEST rather than at module load, so the sitemap starts
  // listing the new month the day the calendar turns over — matching the
  // route's own daily revalidate window.
  listRoundupMonths(new Date(), 6).forEach((month) =>
    entries.push({ loc: `${SITE_URL}/ielts-writing-task-2-topics/${month}`, lastmod: today })
  );

  posts.forEach((post) =>
    entries.push({
      loc: `${SITE_URL}/blog/${post.slug}`,
      lastmod: isoDate(post.date),
    })
  );

  const sections = [
    { path: 'readingquestion', skill: SKILLS.reading },
    { path: 'writingquestion', skill: SKILLS.writing },
    { path: 'listeningquestion', skill: SKILLS.listening },
    { path: 'speakingquestion', skill: SKILLS.speaking },
  ];

  await Promise.all(
    sections.map(async ({ path, skill }) => {
      try {
        // Enumerate EVERY published passage for the skill. listPassages returns
        // { id: slug, legacyId, title, difficulty }. Prefer the legacy-id URL
        // when a legacy Firestore id exists (those URLs are already indexed);
        // otherwise use the slug URL. This includes the newer AI-authored
        // passages that have a slug but no legacy id, which the old
        // getLegacyIdSlugMap() enumeration missed entirely.
        const passages = await listPassages(skill);
        passages.forEach((p) => {
          const routeId = p.legacyId || p.id; // p.id is the slug
          if (!routeId) return;
          entries.push({
            loc: `${SITE_URL}/${path}/${encodeURIComponent(routeId)}`,
          });
        });
      } catch (err) {
        // If Supabase is unreachable, still emit the static + blog URLs.
        console.error(`Sitemap: failed to enumerate ${skill}`, err);
      }
    })
  );

  try {
    const mocks = await listMockTests();
    mocks.forEach((mock) => entries.push({ loc: `${SITE_URL}/mock/${mock.slug}`, lastmod: today }));
  } catch (err) {
    console.error('Sitemap: failed to enumerate mock tests', err);
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => urlEntry(e.loc, e.lastmod)).join('\n')}
</urlset>`;

  res.setHeader('Content-Type', 'application/xml');
  res.write(xml);
  res.end();

  return { props: {} };
}

export default function Sitemap() {
  return null;
}
