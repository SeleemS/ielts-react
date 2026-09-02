// lib/speakingHubs.js
// Data access for the /speaking hub pages (part hubs, topic-family hubs and the
// /speaking/new-cue-cards freshness hub).
//
// Deliberately separate from lib/supabase.js: the hubs need columns the
// practice pages do not (created_at for freshness, the raw cue_card jsonb for
// linked Part 1/Part 3 questions), and keeping them here avoids widening the
// shared SPEAKING_SELECT used by every question page.
//
// All reads go through the anon key + RLS (published passages only), so these
// run fine inside getStaticProps at build time.

import { getSupabase } from './supabase';
import { classifySpeakingFamily } from './speakingTopicFamilies';

const HUB_SELECT = `
  slug, legacy_firestore_id, title, difficulty, topic_tags, created_at,
  speaking_details ( part, part1_questions, cue_card, part3_followups )
`;

function detailOf(row) {
  return Array.isArray(row.speaking_details) ? row.speaking_details[0] : row.speaking_details;
}

function topicOf(detail) {
  if (!detail) return null;
  if (detail.part === 1) return detail.part1_questions?.topic || null;
  if (detail.part === 2) return detail.cue_card?.topic || null;
  if (detail.part === 3) return detail.part3_followups?.theme || null;
  return null;
}

// Every published speaking item, shaped for the hubs.
//   { slug, routeId, href, title, topic, part, difficulty, topicTags[], family,
//     createdAt, bullets[], explainLine, linkedPart1[], linkedPart3[] }
export async function listSpeakingHubItems() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('passages')
    .select(HUB_SELECT)
    .eq('skill', 'speaking')
    .eq('status', 'published')
    .order('created_at', { ascending: false });
  if (error) throw error;

  return (data || [])
    .map((row) => {
      const detail = detailOf(row);
      if (!detail || ![1, 2, 3].includes(detail.part)) return null;
      const topic = topicOf(detail);
      const cue = detail.cue_card || {};
      const routeId = row.legacy_firestore_id || row.slug;
      return {
        slug: row.slug,
        routeId,
        href: `/speakingquestion/${encodeURIComponent(routeId)}`,
        title: row.title || 'Untitled',
        topic,
        part: detail.part,
        difficulty: row.difficulty || null,
        topicTags: Array.isArray(row.topic_tags) ? row.topic_tags : [],
        createdAt: row.created_at || null,
        family:
          cue.family ||
          classifySpeakingFamily({
            title: row.title,
            topic,
            topicTags: row.topic_tags,
          }),
        bullets: Array.isArray(cue.bullets) ? cue.bullets : [],
        explainLine: cue.explainLine || '',
        // Batch-generated cue cards carry their linked question sets inside the
        // cue_card jsonb; legacy Part 1/Part 3 items carry real question rows.
        linkedPart1: Array.isArray(cue.linkedPart1) ? cue.linkedPart1 : [],
        linkedPart3: Array.isArray(cue.linkedPart3) ? cue.linkedPart3 : [],
        questions: (detail.part === 1
          ? detail.part1_questions?.questions
          : detail.part === 3
            ? detail.part3_followups?.questions
            : []
        )
          ?.map((q) => String(q?.text || '').trim())
          .filter(Boolean) || [],
      };
    })
    .filter(Boolean);
}

// Part hub payload. Part 2 lists cue cards; Part 1 and Part 3 list the linked
// question sets grouped by topic family (every question links to the item you
// can practise it on).
export async function getSpeakingPartHubData(part) {
  const items = await listSpeakingHubItems();
  if (part === 2) {
    return {
      cueCards: items.filter((item) => item.part === 2),
      questionGroups: [],
      updatedAt: newestCreatedAt(items.filter((item) => item.part === 2)),
    };
  }

  const groups = new Map();
  for (const item of items) {
    // A Part 1/Part 3 practice set contributes its own questions; a cue card
    // contributes the linked questions authored alongside it.
    const questions =
      item.part === part ? item.questions : part === 1 ? item.linkedPart1 : item.linkedPart3;
    if (!questions?.length) continue;
    const family = item.family || 'experiences';
    if (!groups.has(family)) groups.set(family, []);
    groups.get(family).push({
      slug: item.slug,
      href: item.href,
      title: item.title,
      topic: item.topic,
      questions: questions.slice(0, 4),
    });
  }

  return {
    cueCards: [],
    questionGroups: [...groups.entries()].map(([family, sets]) => ({ family, sets })),
    updatedAt: newestCreatedAt(items),
  };
}

export function newestCreatedAt(items = []) {
  const stamps = items.map((item) => item.createdAt).filter(Boolean).sort();
  return stamps.length ? stamps[stamps.length - 1] : null;
}

// Cue cards for one topic family, newest first.
export async function getSpeakingFamilyHubData(family) {
  const items = await listSpeakingHubItems();
  const cueCards = items.filter((item) => item.part === 2 && item.family === family);
  const related = items.filter((item) => item.part !== 2 && item.family === family).slice(0, 6);
  return { cueCards, related, updatedAt: newestCreatedAt(cueCards) };
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// "2026-09-02T…" -> { key: '2026-09', label: 'September 2026' }
export function monthBucket(iso) {
  const date = iso ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return { key: 'unknown', label: 'Earlier' };
  return {
    key: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
    label: `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`,
  };
}

// Cue cards grouped by the month they were added, newest month first.
// This is the payload for /speaking/new-cue-cards.
export function groupByMonthAdded(items = []) {
  const buckets = new Map();
  for (const item of items) {
    const { key, label } = monthBucket(item.createdAt);
    if (!buckets.has(key)) buckets.set(key, { key, label, items: [] });
    buckets.get(key).items.push(item);
  }
  return [...buckets.values()]
    .sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : 0))
    .map((bucket) => ({
      ...bucket,
      items: bucket.items.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))),
    }));
}

export async function getNewCueCardsData() {
  const items = await listSpeakingHubItems();
  const cueCards = items.filter((item) => item.part === 2);
  return {
    months: groupByMonthAdded(cueCards),
    total: cueCards.length,
    updatedAt: newestCreatedAt(cueCards),
  };
}
