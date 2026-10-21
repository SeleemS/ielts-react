// /sitemap.xml is a SITEMAP INDEX pointing at one child sitemap per page type
// (/sitemap-guides.xml, -blog, -reading, -writing, -listening, -speaking), so
// Search Console reports indexing per type. STATIC_ROUTES below is the single
// list of hand-built pages; each is routed to its child sitemap by path
// (lib/sitemap.js sitemapSectionFor). Data-driven URLs (questions, posts,
// month roundups) come from lib/sitemapData.js.
import { READING_QUESTION_TYPE_SLUGS } from '../lib/readingQuestionTypes';
import { LISTENING_PART_SLUGS } from '../lib/listeningQuestionTypes';
import { SPEAKING_PART_SLUGS } from '../lib/speakingParts';
import { SPEAKING_FAMILY_SLUGS } from '../lib/speakingTopicFamilies';
import { SCORE_REQUIREMENT_COUNTRY_SLUGS } from '../lib/scoreRequirementsData';
import { SITEMAP_SECTIONS, latestDate, sendXml, sitemapIndexXml } from '../lib/sitemap';
import { collectAllSitemapSections } from '../lib/sitemapData';

export const STATIC_ROUTES = [
  '/',
  '/about',
  '/editorial-policy',
  '/contactus',
  '/privacypolicy',
  '/termsofservice',
  '/blog',
  '/pricing',
  '/band-calculator',
  '/band-estimator',
  '/ielts-writing-checker',
  // Task-specific checker landing pages (pages/ielts-writing-checker/[task].jsx).
  '/ielts-writing-checker/task-2',
  '/ielts-writing-checker/task-1',
  '/ielts-writing-checker/general-training-letter',
  // Whole-bank hub with live counts (pages/ielts-question-bank.js).
  '/ielts-question-bank',
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
  // Essay bank hub (pages/ielts-essay-bank/index.js); samples come from lib/sitemapData.js.
  '/ielts-essay-bank',
  '/ielts-band-descriptors',
  '/ielts-score-requirements',
  // Published accuracy of the AI Writing scorer (review item 24).
  '/ielts-writing-checker-accuracy',
  // Reading question-type hub pages (pages/reading/[type].js).
  ...READING_QUESTION_TYPE_SLUGS.map((slug) => `/reading/${slug}`),
  // Listening part hub pages (pages/listening/[type].js).
  ...LISTENING_PART_SLUGS.map((slug) => `/listening/${slug}`),
  // Speaking part hubs (pages/speaking/[part].js).
  ...SPEAKING_PART_SLUGS.map((slug) => `/speaking/${slug}`),
  // Speaking topic-family hubs (pages/speaking/topics/[family].js).
  ...SPEAKING_FAMILY_SLUGS.map((slug) => `/speaking/topics/${slug}`),
  // Seasonal hub of every Part 2 cue card (replaced /speaking/new-cue-cards).
  '/ielts-speaking-cue-cards',
  // Per-country score requirement pages (pages/ielts-score-requirements/[country].js).
  ...SCORE_REQUIREMENT_COUNTRY_SLUGS.map((slug) => `/ielts-score-requirements/${slug}`),
];

export async function getServerSideProps({ res }) {
  // Build every section so each <sitemap> carries the newest real lastmod of
  // its URLs (omitted when none of them has a known date).
  const sections = await collectAllSitemapSections({ staticRoutes: STATIC_ROUTES });
  const xml = sitemapIndexXml(
    SITEMAP_SECTIONS.map((section) => ({
      section,
      lastmod: latestDate((sections[section] || []).map((entry) => entry.lastmod)),
    }))
  );
  sendXml(res, xml);
  return { props: {} };
}

export default function Sitemap() {
  return null;
}
