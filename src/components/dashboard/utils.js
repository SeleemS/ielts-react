// src/components/dashboard/utils.js
// Pure data-shaping helpers for the progress dashboard. No network / React here
// so the transforms stay easy to reason about and reuse across dashboard parts.

import { BookOpen, Headphones, PenLine, Mic } from 'lucide-react';
import { computeStreak } from '../../lib/streak';

// Skill -> display + routing metadata. Reading/Listening come from `attempts`,
// Writing/Speaking from `scores`.
export const SKILL_META = {
  reading: { key: 'reading', label: 'Reading', href: '/readingquestion', icon: BookOpen },
  listening: { key: 'listening', label: 'Listening', href: '/listeningquestion', icon: Headphones },
  writing: { key: 'writing', label: 'Writing', href: '/writingquestion', icon: PenLine },
  speaking: { key: 'speaking', label: 'Speaking', href: '/speakingquestion', icon: Mic },
};

export const SKILL_ORDER = ['reading', 'listening', 'writing', 'speaking'];

// Coerce a Postgres numeric (which may arrive as a string) into a finite
// number, or null when absent/unparseable.
function toBand(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Build the href for a passage/prompt row from an embedded passages record.
// Routing is /<skill>question/<slug> (see DataTable). Falls back to null so the
// row renders as plain text when the passage was deleted (set null on delete).
export function passageHref(passage) {
  if (!passage || !passage.slug || !passage.skill) return null;
  return `/${passage.skill}question/${passage.slug}`;
}

// Format an ISO timestamp as e.g. "9 Jul 2026". Guards against bad input.
export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

// One band number -> a one-decimal display string ("6.5", "7.0").
export function formatBand(band) {
  const n = toBand(band);
  return n === null ? '—' : n.toFixed(1);
}

// Normalize a reading/listening `attempts` row into a common activity item.
// Mock-test attempts carry mock_tests instead of a passage.
function attemptToItem(row) {
  const passage = Array.isArray(row.passages) ? row.passages[0] : row.passages;
  const mock = Array.isArray(row.mock_tests) ? row.mock_tests[0] : row.mock_tests;
  const band = toBand(row.band);
  const raw = row.raw_score === null || row.raw_score === undefined ? null : Number(row.raw_score);
  return {
    id: `attempt-${row.id}`,
    skill: row.skill,
    band,
    date: row.submitted_at || row.created_at,
    title: mock?.title || passage?.title || 'Practice passage',
    href: mock?.slug ? `/mock/${mock.slug}` : passageHref(passage),
    // Reading/Listening are auto-scored: surface the correct-answer count.
    detail: raw === null ? null : `${raw} correct`,
    perQuestion: row.per_question || {},
    total: row.total == null ? null : Number(row.total),
  };
}

// Normalize an AI `scores` row (writing or speaking, with nested attempt ->
// passage) into the same activity item shape.
function scoreToItem(row) {
  const attempt = Array.isArray(row.attempts) ? row.attempts[0] : row.attempts;
  const passage = attempt
    ? Array.isArray(attempt.passages)
      ? attempt.passages[0]
      : attempt.passages
    : null;
  const skill = row.skill === 'speaking' ? 'speaking' : 'writing';
  return {
    id: `score-${row.id}`,
    skill,
    band: toBand(row.overall_band),
    date: row.created_at,
    title: passage?.title || (skill === 'speaking' ? 'Speaking task' : 'Writing task'),
    href: passageHref(passage),
    detail: 'AI-scored',
    criteria: row.criteria || {},
    startedAt: attempt?.started_at || null,
    submittedAt: attempt?.submitted_at || row.created_at,
  };
}

function avg(nums) {
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function minutesBetween(start, end) {
  const from = validDate(start);
  const to = validDate(end);
  if (!from || !to || to <= from) return 0;
  // Cap malformed or abandoned sessions so one row cannot distort the KPI.
  return Math.min(180, Math.max(1, Math.round((to - from) / 60000)));
}

function localDateKey(value) {
  const date = value instanceof Date ? value : validDate(value);
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function bandDescriptor(band) {
  const value = toBand(band);
  if (value === null) return 'Start practising';
  if (value >= 8) return 'Expert';
  if (value >= 7) return 'Good';
  if (value >= 6) return 'Competent';
  if (value >= 5) return 'Developing';
  return 'Building foundations';
}

export function getInitials(name, email = '') {
  const source = String(name || email.split('@')[0] || 'IELTS learner').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (!parts.length) return 'IL';
  return parts.slice(0, 2).map((part) => part[0]).join('').toUpperCase();
}

export function prettyQuestionType(value) {
  return String(value || 'other')
    .replaceAll('_', ' ')
    .replaceAll('-', ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

// Merge raw attempts + scores into everything the dashboard renders:
//   { items, totalPractised, hasData, skills: { <skill>: {count, avg, best, series} } }
// `series` is a chronological (oldest->newest) array of band numbers for the
// trend sparkline. Rows without a resolved band are excluded from stats/series
// but still appear in the activity feed.
export function buildDashboardData(attempts = [], scores = []) {
  const items = [
    ...attempts.map((row) => ({
      ...attemptToItem(row),
      startedAt: row.started_at || null,
      submittedAt: row.submitted_at || row.created_at,
    })),
    ...scores.map(scoreToItem),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const skills = {};
  for (const key of SKILL_ORDER) {
    const forSkill = items.filter((it) => it.skill === key);
    // Oldest -> newest for the trend line.
    const chrono = forSkill
      .slice()
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const bands = chrono.map((it) => it.band).filter((b) => b !== null);
    skills[key] = {
      count: forSkill.length,
      avg: avg(bands),
      best: bands.length ? Math.max(...bands) : null,
      series: bands,
      latest: bands.length ? bands.at(-1) : null,
      previous: bands.length > 1 ? bands.at(-2) : null,
      delta: bands.length > 1 ? bands.at(-1) - bands.at(-2) : null,
    };
  }

  const questionTypes = {};
  const mistakes = [];
  for (const attempt of attempts) {
    const passage = Array.isArray(attempt.passages) ? attempt.passages[0] : attempt.passages;
    let wrong = 0;
    for (const item of Object.values(attempt.per_question || {})) {
      const type = item?.questionType || 'other';
      questionTypes[type] ||= { correct: 0, total: 0 };
      questionTypes[type].total += 1;
      if (item?.correct) questionTypes[type].correct += 1;
      else wrong += 1;
    }
    if (wrong > 0) {
      mistakes.push({
        id: attempt.id,
        skill: attempt.skill,
        title: passage?.title || 'Practice passage',
        href: passageHref(passage),
        wrong,
        date: attempt.submitted_at || attempt.created_at,
      });
    }
  }
  mistakes.sort((a, b) => new Date(a.date) - new Date(b.date));

  const typeAccuracy = Object.entries(questionTypes)
    .map(([type, value]) => ({
      type,
      ...value,
      percentage: value.total ? Math.round((value.correct / value.total) * 100) : 0,
    }))
    .sort((a, b) => a.percentage - b.percentage);

  const practiceDays = new Set(items.map((item) => localDateKey(item.date)).filter(Boolean));
  const { streak } = computeStreak(items.map((item) => item.date));

  const criteria = {};
  for (const score of scores.slice().reverse()) {
    for (const [key, value] of Object.entries(score.criteria || {})) {
      const band = toBand(value?.band ?? value);
      if (band == null) continue;
      criteria[key] ||= [];
      criteria[key].push(band);
    }
  }

  const latestBands = SKILL_ORDER.map((key) => skills[key].latest).filter((band) => band !== null);
  const overallBand = avg(latestBands);
  const rankedSkills = SKILL_ORDER
    .filter((key) => skills[key].avg !== null)
    .sort((a, b) => skills[b].avg - skills[a].avg);
  const missingSkill = SKILL_ORDER.find((key) => skills[key].count === 0);
  const recommendedSkill = missingSkill || rankedSkills.at(-1) || 'reading';

  const totalMinutes = items.reduce(
    (sum, item) => sum + minutesBetween(item.startedAt, item.submittedAt),
    0
  );

  const activity = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let offset = 27; offset >= 0; offset -= 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);
    const key = localDateKey(date);
    activity.push({
      key,
      date,
      count: items.filter((item) => localDateKey(item.date) === key).length,
    });
  }

  const weekStart = new Date(today);
  const day = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - ((day + 6) % 7));
  const weeklyCount = items.filter((item) => {
    const date = validDate(item.date);
    return date && date >= weekStart;
  }).length;

  return {
    items,
    totalPractised: items.length,
    hasData: items.length > 0,
    skills,
    mistakes: mistakes.slice(0, 8),
    typeAccuracy,
    streak,
    criteria,
    overallBand,
    strongestSkill: rankedSkills[0] || null,
    recommendedSkill,
    totalMinutes,
    activity,
    activeDays: practiceDays.size,
    weeklyCount,
  };
}
