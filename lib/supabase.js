// lib/supabase.js
// New Supabase data-access layer. Mirrors the shape of lib/passages.js so that,
// at cutover, the [id].js pages and DataTable can swap imports with minimal
// churn. ADDITIVE for now: nothing imports this yet. See supabase/MIGRATION_PLAN.md
// for the exact cutover swap list.
//
// Env vars (public, browser-safe; NOT the service role):
//   NEXT_PUBLIC_SUPABASE_URL
//   NEXT_PUBLIC_SUPABASE_ANON_KEY
//
// The anon key only ever sees data allowed by RLS (published content + the
// signed-in user's own rows), so it is safe to expose to the client.

import { createClient } from '@supabase/supabase-js';
import { resolveAverageUserBand } from './averageUserBand';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Section -> skill enum, replacing lib/passages.js COLLECTIONS.
export const SKILLS = {
  reading: 'reading',
  writing: 'writing',
  listening: 'listening',
  speaking: 'speaking',
};

// Public listening-audio bucket, matching supabase/migrations/0007.
const LISTENING_BUCKET = 'listening-audio';

let _client = null;

// Lazily instantiate a singleton. Throwing here (rather than at import time)
// keeps the module importable during builds where env vars may be absent.
export function getSupabase() {
  if (_client) return _client;
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY. ' +
        'Set them in .env.local (local) and Vercel env (deploy).'
    );
  }
  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return _client;
}

// Resolve a listening-audio storage PATH -> a public URL. Used by
// getStaticProps so the built page ships a stable public URL instead of a
// Firebase token URL. Returns null when there is no path.
export function audioPublicUrl(audioPath) {
  if (!audioPath) return null;
  const supabase = getSupabase();
  const { data } = supabase.storage.from(LISTENING_BUCKET).getPublicUrl(audioPath);
  return data?.publicUrl || null;
}

// Reassemble the nested passage shape the existing page components expect:
//   { passageTitle, passageText, passageDifficulty, audioUrl?, questionGroups:[
//       { prompt, questionType, options:[], questions:[{ text, answer }] } ] }
// from the normalized relational rows. This adapter means the React components
// (ReadingQuestion/ListeningQuestion/WritingQuestion) need little-to-no change
// at cutover.
function toLegacyPassageShape(row) {
  const groups = (row.question_groups || [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((g) => {
      const options = (g.group_options || [])
        .slice()
        .sort((a, b) => a.position - b.position);
      const optionText = options.map((o) => o.display_text);
      const optionTextByKey = new Map(options.map((o) => [o.option_key, o.display_text]));

      const questions = (g.questions || [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((q) => {
          const ak = Array.isArray(q.answer_keys) ? q.answer_keys[0] : q.answer_keys;
          let answer = '';
          if (ak) {
            if (ak.correct_option_keys && ak.correct_option_keys.length > 0) {
              // Map the correct option key(s) back to display text for the
              // legacy MCQ/matching UI (which compares against option strings).
              answer = ak.correct_option_keys
                .map((k) => optionTextByKey.get(k) || k)
                .join(', ');
            } else if (ak.accepted && ak.accepted.length > 0) {
              answer = ak.accepted[0];
            }
          }
          return { text: q.prompt_text || '', answer };
        });

      return {
        prompt: g.prompt || '',
        questionType: legacyTypeLabel(g.question_type),
        options: optionText,
        questions,
      };
    });

  const shaped = {
    passageTitle: row.title || 'Untitled',
    passageText:
      row.skill === 'writing'
        ? row.writing_details?.[0]?.prompt_html || row.writing_details?.prompt_html || ''
        : row.body_html || '',
    passageDifficulty: row.difficulty || null,
    questionGroups: groups,
  };

  if (row.skill === 'listening') {
    const details = Array.isArray(row.listening_details)
      ? row.listening_details[0]
      : row.listening_details;
    const path = details?.audio_path || null;
    shaped.audioUrl = audioPublicUrl(path) || details?.legacy_audio_url || '';
    shaped.listeningPart = details?.part ?? null;
  }

  return shaped;
}

// New enum value -> the label string the current UI switches on.
function legacyTypeLabel(qType) {
  switch (qType) {
    case 'true_false_notgiven':
      return 'True or False';
    case 'yes_no_notgiven':
      return 'Yes or No';
    case 'short_answer':
      return 'Short Answer';
    case 'multiple_choice':
    case 'multiple_choice_multi':
    case 'matching_information':
    case 'matching_headings':
    case 'matching_features':
    case 'matching_sentence_endings':
      return 'Match';
    default:
      return 'Short Answer';
  }
}

const PASSAGE_SELECT = `
  id, slug, legacy_firestore_id, skill, module, title, body_html, difficulty, status,
  writing_details ( task, prompt_html, chart_image_path, word_limit_min, model_answer_html, model_answer_rationale_html ),
  listening_details ( audio_path, legacy_audio_url, transcript_html, part ),
  question_groups (
    id, position, question_type, prompt, instructions_html, image_svg,
    group_options ( option_key, display_text, position ),
    questions (
      id, position, global_number, prompt_text,
      answer_keys ( accepted, correct_option_keys, spelling_variants, word_limit, normalize, explanation )
    )
  )
`;

// Strip HTML tags and collapse whitespace, then truncate for meta descriptions.
// Mirrors the helper previously provided by lib/passages.js so pages no longer
// need to import the (Firestore-backed) passages module.
export function toMetaDescription(html, max = 150) {
  if (!html) return '';
  const text = String(html)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  return text.slice(0, max).trim() + '...';
}

// ---- Public API (mirrors lib/passages.js) --------------------------------

// getStaticPaths helper: all published slugs for a skill.
export async function getPassageSlugs(skill) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('passages')
    .select('slug')
    .eq('skill', skill)
    .eq('status', 'published');
  if (error) throw error;
  return (data || []).map((r) => r.slug);
}

export async function countQuestions() {
  const supabase = getSupabase();
  const { count, error } = await supabase
    .from('questions')
    .select('id', { count: 'exact', head: true });
  if (error) throw error;
  return count || 0;
}

// Aggregate-only public trust signal. The RPC is intentionally the only
// client-visible path to the private activity_events table.
export async function getPublicTrustStats() {
  const { data, error } = await getSupabase().rpc('get_public_trust_stats');
  if (error) throw error;
  return {
    questionsAnswered: Number(data?.questionsAnswered || 0),
  };
}

// Also expose legacy ids so cutover can build redirect maps (old SSG URLs).
export async function getLegacyIdSlugMap(skill) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('passages')
    .select('slug, legacy_firestore_id')
    .eq('skill', skill)
    .eq('status', 'published');
  if (error) throw error;
  return (data || []).reduce((acc, r) => {
    if (r.legacy_firestore_id) acc[r.legacy_firestore_id] = r.slug;
    return acc;
  }, {});
}

// Fetch a single passage by slug; returns the legacy-shaped object or null.
// Accepts a legacy Firestore id too (for redirect / backward-compat lookups).
export async function getPassageBySlug(skill, slugOrLegacyId) {
  const supabase = getSupabase();
  let { data, error } = await supabase
    .from('passages')
    .select(PASSAGE_SELECT)
    .eq('skill', skill)
    .eq('slug', slugOrLegacyId)
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    // Fall back to legacy id lookup so old URLs still resolve.
    const res = await supabase
      .from('passages')
      .select(PASSAGE_SELECT)
      .eq('skill', skill)
      .eq('legacy_firestore_id', slugOrLegacyId)
      .maybeSingle();
    if (res.error) throw res.error;
    data = res.data;
  }

  if (!data) return null;
  return JSON.parse(JSON.stringify(toLegacyPassageShape(data)));
}

// ---- Structured fetch (question-taking engine) ---------------------------
// Unlike getPassageBySlug (which FLATTENS to the legacy shape), this returns
// the FULL structured passage so the data-driven QuestionRenderer/grader can
// handle every IELTS question type. ADDITIVE: existing exports are untouched.
//
//   getStructuredPassage(skill, slugOrLegacyId) -> {
//     id, slug, legacyId, skill, module, title, difficulty, bodyHtml,
//     audioUrl?, transcriptHtml?,                       // listening
//     writing?: { task, promptHtml, chartImagePath, wordLimitMin },
//     groups: [{
//       id, position, questionType, prompt, instructionsHtml,
//       options: [{ key, text, position }],
//       questions: [{
//         id, position, globalNumber, number, promptText,
//         answerKey: { accepted[], correctOptionKeys[], spellingVariants,
//                      wordLimit, normalize }
//       }]
//     }]
//   }
//
// `number` is the continuous 1..N question number used as the SINGLE key for
// storage, display and grading (prefers the stored global_number; falls back
// to a running counter so numbering is always continuous and correct).
// True when the app can actually mark this question. Type-agnostic so it also
// protects against future half-ingested data: completion/short-answer/boolean
// types grade off `accepted`; choice/matching types grade off option keys and
// need the group's option bank present to be answerable at all.
export function questionIsGradeable(group, question) {
  const ak = question.answerKey || {};
  const hasAccepted = Array.isArray(ak.accepted) && ak.accepted.length > 0;
  const hasKeyedOptions =
    Array.isArray(ak.correctOptionKeys) &&
    ak.correctOptionKeys.length > 0 &&
    Array.isArray(group.options) &&
    group.options.length > 0;
  return hasAccepted || hasKeyedOptions;
}

export function toStructuredPassageShape(row) {
  const groups = (row.question_groups || [])
    .slice()
    .sort((a, b) => a.position - b.position)
    .map((g) => {
      const options = (g.group_options || [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((o) => ({ key: o.option_key, text: o.display_text, position: o.position }));

      const questions = (g.questions || [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((q) => {
          const ak = Array.isArray(q.answer_keys) ? q.answer_keys[0] : q.answer_keys;
          return {
            id: q.id,
            position: q.position,
            globalNumber: q.global_number,
            promptText: q.prompt_text || '',
            answerKey: ak
              ? {
                  accepted: ak.accepted || [],
                  correctOptionKeys: ak.correct_option_keys || [],
                  spellingVariants: !!ak.spelling_variants,
                  wordLimit: ak.word_limit ?? null,
                  normalize: ak.normalize || 'lower_trim',
                  explanation: ak.explanation || '',
                }
              : {
                  accepted: [],
                  correctOptionKeys: [],
                  spellingVariants: false,
                  wordLimit: null,
                  normalize: 'lower_trim',
                  explanation: '',
                },
          };
        });

      return {
        id: g.id,
        position: g.position,
        questionType: g.question_type,
        prompt: g.prompt || '',
        instructionsHtml: g.instructions_html || '',
        imageSvg: g.image_svg || null,
        options,
        questions,
      };
    });

  // Defensive integrity guard: never surface a question the app cannot mark.
  // A question is gradeable only if it has accepted text answers, OR it has
  // correct option key(s) AND its group actually carries the option bank to
  // choose from. Half-ingested items (empty answer keys, or matching/MC groups
  // with no options) are otherwise rendered unanswerable and always-wrong, so
  // we drop them here — at the single read path every renderer shares — and
  // drop any group left with no gradeable questions. See grade.js for the
  // matching contract this mirrors.
  const gradeableGroups = groups
    .map((g) => ({ ...g, questions: g.questions.filter((q) => questionIsGradeable(g, q)) }))
    .filter((g) => g.questions.length > 0);

  // Continuous global numbering (1..N) over the SURVIVING questions, so the
  // navigator, storage and grading always agree even after a drop. A running
  // counter is authoritative here (a stored global_number would leave gaps
  // once anything is filtered).
  let counter = 0;
  gradeableGroups.forEach((g) =>
    g.questions.forEach((q) => {
      counter += 1;
      q.number = counter;
    })
  );

  const shaped = {
    id: row.id,
    slug: row.slug,
    legacyId: row.legacy_firestore_id || null,
    skill: row.skill,
    module: row.module || null,
    title: row.title || 'Untitled',
    difficulty: row.difficulty || null,
    bodyHtml: row.body_html || '',
    groups: gradeableGroups,
  };

  if (row.skill === 'writing') {
    const wd = Array.isArray(row.writing_details)
      ? row.writing_details[0]
      : row.writing_details;
    shaped.writing = wd
      ? {
          task: wd.task ?? 2,
          promptHtml: wd.prompt_html || '',
          chartImagePath: wd.chart_image_path || null,
          wordLimitMin: wd.word_limit_min ?? 250,
          modelAnswerHtml: wd.model_answer_html || '',
          modelAnswerRationaleHtml: wd.model_answer_rationale_html || '',
        }
      : null;
    // Writing keeps its prompt in the detail table; surface it as bodyHtml too
    // so meta-description helpers work uniformly.
    if (shaped.writing?.promptHtml) shaped.bodyHtml = shaped.writing.promptHtml;
  }

  if (row.skill === 'listening') {
    const ld = Array.isArray(row.listening_details)
      ? row.listening_details[0]
      : row.listening_details;
    shaped.audioUrl = ld ? audioPublicUrl(ld.audio_path) || ld.legacy_audio_url || '' : '';
    shaped.transcriptHtml = ld?.transcript_html || '';
    shaped.listeningPart = ld?.part ?? null;
  }

  return shaped;
}

// Fetch a single passage in FULL structured form (groups/options/questions/
// answer_keys). Accepts a slug or a legacy Firestore id. Returns null if absent.
export async function getStructuredPassage(skill, slugOrLegacyId) {
  const supabase = getSupabase();
  let { data, error } = await supabase
    .from('passages')
    .select(PASSAGE_SELECT)
    .eq('skill', skill)
    .eq('slug', slugOrLegacyId)
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    const res = await supabase
      .from('passages')
      .select(PASSAGE_SELECT)
      .eq('skill', skill)
      .eq('legacy_firestore_id', slugOrLegacyId)
      .maybeSingle();
    if (res.error) throw res.error;
    data = res.data;
  }

  if (!data) return null;
  return JSON.parse(JSON.stringify(toStructuredPassageShape(data)));
}

// ---- Speaking (Part 1 / 2 / 3) -------------------------------------------
// Speaking is single-module (passages.module = null). Per the 0010 migration,
// speaking_details holds one populated jsonb column selected by `part`:
//   part 1 -> part1_questions { topic, questions:[{text, audioPath}] }
//   part 2 -> cue_card        { topic, bullets[], explainLine, prepSeconds,
//                               speakSecondsMin, speakSecondsMax, audioPath,
//                               roundOff:[{text, audioPath}] }
//   part 3 -> part3_followups { theme, questions:[{text, audioPath}] }
// audioPath is a STORAGE PATH in the PUBLIC listening-audio bucket (examiner
// voice); we resolve it to a public URL here so pages ship stable URLs.

const SPEAKING_SELECT = `
  id, slug, legacy_firestore_id, title, difficulty, topic_tags,
  speaking_details ( part, part1_questions, cue_card, part3_followups )
`;

// One speaking_details row per passage (embedded as array or object).
function speakingDetailOf(row) {
  return Array.isArray(row.speaking_details)
    ? row.speaking_details[0]
    : row.speaking_details;
}

// Human-readable topic/theme for a speaking item, by part.
function speakingTopicOf(detail) {
  if (!detail) return null;
  if (detail.part === 1) return detail.part1_questions?.topic || null;
  if (detail.part === 2) return detail.cue_card?.topic || null;
  if (detail.part === 3) return detail.part3_followups?.theme || null;
  return null;
}

// Resolve a { text, audioPath } examiner question to include a public audioUrl.
function resolveExaminerQuestion(q) {
  return {
    text: q?.text || '',
    audioPath: q?.audioPath || null,
    audioUrl: audioPublicUrl(q?.audioPath) || null,
  };
}

// Browse list of published speaking items (for the /speakingquestion index),
// each carrying enough to group/filter by Part. Returns:
//   [{ id: slug, slug, legacyId, title, difficulty, topicTags[], part, topic }]
export async function listSpeakingItems() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('passages')
    .select(SPEAKING_SELECT)
    .eq('skill', 'speaking')
    .eq('status', 'published')
    .order('title', { ascending: true });
  if (error) throw error;
  return (data || [])
    .map((r) => {
      const d = speakingDetailOf(r);
      return {
        id: r.slug, // route param going forward is the slug
        slug: r.slug,
        legacyId: r.legacy_firestore_id || null,
        title: r.title || 'Untitled',
        difficulty: r.difficulty || null,
        topicTags: Array.isArray(r.topic_tags) ? r.topic_tags : [],
        part: d?.part ?? null,
        topic: speakingTopicOf(d),
      };
    })
    // Only items with a resolvable part are practiseable.
    .filter((it) => it.part === 1 || it.part === 2 || it.part === 3);
}

// Fetch a single speaking item (by slug or legacy id) shaped for the practice
// page, with examiner-audio public URLs resolved for every question/cue.
// Returns null when absent. Shape:
//   { id, slug, legacyId, title, difficulty, topicTags[], part, topic,
//     part1?: { topic, questions:[{text, audioPath, audioUrl}] },
//     cueCard?: { topic, bullets[], explainLine, prepSeconds, speakSecondsMin,
//                 speakSecondsMax, audioPath, audioUrl, roundOff:[...] },
//     part3?: { theme, questions:[{text, audioPath, audioUrl}] } }
export async function getSpeakingItem(slugOrLegacyId) {
  const supabase = getSupabase();
  let { data, error } = await supabase
    .from('passages')
    .select(SPEAKING_SELECT)
    .eq('skill', 'speaking')
    .eq('slug', slugOrLegacyId)
    .maybeSingle();
  if (error) throw error;

  if (!data) {
    const res = await supabase
      .from('passages')
      .select(SPEAKING_SELECT)
      .eq('skill', 'speaking')
      .eq('legacy_firestore_id', slugOrLegacyId)
      .maybeSingle();
    if (res.error) throw res.error;
    data = res.data;
  }

  if (!data) return null;
  const d = speakingDetailOf(data);
  if (!d || (d.part !== 1 && d.part !== 2 && d.part !== 3)) return null;

  const shaped = {
    id: data.id,
    slug: data.slug,
    legacyId: data.legacy_firestore_id || null,
    title: data.title || 'Untitled',
    difficulty: data.difficulty || null,
    topicTags: Array.isArray(data.topic_tags) ? data.topic_tags : [],
    part: d.part,
    topic: speakingTopicOf(d),
  };

  if (d.part === 1) {
    const p1 = d.part1_questions || {};
    shaped.part1 = {
      topic: p1.topic || null,
      questions: (p1.questions || []).map(resolveExaminerQuestion),
    };
  } else if (d.part === 2) {
    const c = d.cue_card || {};
    shaped.cueCard = {
      topic: c.topic || null,
      bullets: Array.isArray(c.bullets) ? c.bullets : [],
      explainLine: c.explainLine || null,
      prepSeconds: Number.isFinite(c.prepSeconds) ? c.prepSeconds : 60,
      speakSecondsMin: Number.isFinite(c.speakSecondsMin) ? c.speakSecondsMin : 60,
      speakSecondsMax: Number.isFinite(c.speakSecondsMax) ? c.speakSecondsMax : 120,
      audioPath: c.audioPath || null,
      audioUrl: audioPublicUrl(c.audioPath) || null,
      roundOff: (c.roundOff || []).map(resolveExaminerQuestion),
    };
  } else if (d.part === 3) {
    const p3 = d.part3_followups || {};
    shaped.part3 = {
      theme: p3.theme || null,
      questions: (p3.questions || []).map(resolveExaminerQuestion),
    };
  }

  return JSON.parse(JSON.stringify(shaped));
}

// List published passages for a skill that contain at least one question group
// of the given question_type. Uses Supabase's inner-join filter syntax
// (question_groups!inner) so only passages with a matching group come back, then
// dedupes because a passage with several matching groups yields several rows.
// Returns the same projection as listPassages: [{ id: slug, legacyId, title, difficulty }].
// questionGroups: false (omit) | 'inner' (filter passages to a type) |
// 'all' (embed every group's type so the list can filter client-side).
function passageListSelect(includeBandStats, questionGroups) {
  return [
    'slug',
    'legacy_firestore_id',
    'title',
    'difficulty',
    ...(includeBandStats ? ['average_user_band', 'band_submission_count'] : []),
    ...(questionGroups === 'inner' ? ['question_groups!inner(question_type)'] : []),
    ...(questionGroups === 'all' ? ['question_groups(question_type)'] : []),
  ].join(', ');
}

function missingBandStatsColumn(error) {
  const detail = `${error?.code || ''} ${error?.message || ''} ${error?.details || ''}`;
  return (
    error?.code === '42703' ||
    error?.code === 'PGRST204' ||
    /average_user_band|band_submission_count/i.test(detail)
  );
}

async function fetchPassageListRows(skill, questionType = null, { withQuestionTypes = false } = {}) {
  const questionGroups = questionType ? 'inner' : withQuestionTypes ? 'all' : false;
  const run = (includeBandStats) => {
    let query = getSupabase()
      .from('passages')
      .select(passageListSelect(includeBandStats, questionGroups))
      .eq('skill', skill)
      .eq('status', 'published');
    if (questionType) query = query.eq('question_groups.question_type', questionType);
    return query.order('title', { ascending: true });
  };

  let response = await run(true);
  // Keeps the index pages deployable while the reviewed migration is being
  // applied. Only a missing-column/schema-cache response gets the old query;
  // network, auth, and other database errors still surface normally.
  if (response.error && missingBandStatsColumn(response.error)) {
    response = await run(false);
  }
  return response;
}

function toPassageListItem(row) {
  const average = resolveAverageUserBand({
    id: row.slug,
    difficulty: row.difficulty,
    averageUserBand: row.average_user_band,
    submissionCount: row.band_submission_count,
  });
  const item = {
    id: row.slug,
    legacyId: row.legacy_firestore_id,
    title: row.title || 'Untitled',
    difficulty: row.difficulty || null,
    averageUserBand: average.value,
    averageUserBandIsEstimated: average.isEstimated,
    bandSubmissionCount: average.submissionCount,
  };
  // Present only when the list was fetched with embedded question groups; the
  // deduped set of question types drives the Reading list's type filter.
  if (Array.isArray(row.question_groups)) {
    item.questionTypes = [
      ...new Set(row.question_groups.map((g) => g && g.question_type).filter(Boolean)),
    ];
  }
  return item;
}

export async function listPassagesByQuestionType(skill, questionType) {
  const { data, error } = await fetchPassageListRows(skill, questionType);
  if (error) throw error;

  const seen = new Set();
  const out = [];
  for (const r of data || []) {
    if (seen.has(r.slug)) continue; // dedupe: one row per passage
    seen.add(r.slug);
    out.push(toPassageListItem(r));
  }
  return out;
}

// Section landing list (mirrors lib/passages.js listPassages projection).
// Pass { withQuestionTypes: true } to embed each passage's question types
// (used by the Reading list's question-type filter).
export async function listPassages(skill, { withQuestionTypes = false } = {}) {
  const { data, error } = await fetchPassageListRows(skill, null, { withQuestionTypes });
  if (error) throw error;
  return (data || []).map(toPassageListItem);
}

export async function getRelatedPractice(skill, currentSlug, preferred = null, limit = 3) {
  let preferredItems = [];
  if (skill === SKILLS.speaking) {
    preferredItems = (await listSpeakingItems()).filter(
      (item) => preferred == null || item.part === preferred
    );
  } else if (preferred) {
    preferredItems = await listPassagesByQuestionType(skill, preferred);
  }

  const fallbackItems =
    skill === SKILLS.speaking ? await listSpeakingItems() : await listPassages(skill);
  const seen = new Set();
  return [...preferredItems, ...fallbackItems]
    .filter((item) => {
      if (!item?.id || item.id === currentSlug || seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    })
    .slice(0, limit);
}

export async function listMockTests() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('mock_tests')
    .select('id, slug, title, module, description, mock_test_sections(id, skill, position)')
    .eq('status', 'published')
    .order('title', { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => {
    const sections = (row.mock_test_sections || []).slice();
    return {
      id: row.id,
      slug: row.slug,
      title: row.title,
      module: row.module || null,
      description: row.description || '',
      skill: sections[0]?.skill || null,
      sectionCount: sections.length,
    };
  });
}

export async function getMockTest(slug) {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('mock_tests')
    .select(`
      id, slug, title, module, description,
      mock_test_sections (
        id, skill, position, time_limit_seconds,
        passages ( slug )
      )
    `)
    .eq('slug', slug)
    .eq('status', 'published')
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const rawSections = (data.mock_test_sections || [])
    .slice()
    .sort((a, b) => a.position - b.position);
  const sections = [];
  for (const section of rawSections) {
    const passageSlug = Array.isArray(section.passages)
      ? section.passages[0]?.slug
      : section.passages?.slug;
    if (!passageSlug) continue;
    const passage = await getStructuredPassage(section.skill, passageSlug);
    if (!passage) continue;
    sections.push({
      id: section.id,
      skill: section.skill,
      position: section.position,
      timeLimitSeconds: section.time_limit_seconds,
      passage,
    });
  }

  return JSON.parse(
    JSON.stringify({
      id: data.id,
      slug: data.slug,
      title: data.title,
      module: data.module || null,
      description: data.description || '',
      skill: sections[0]?.skill || null,
      durationSeconds: sections.reduce((sum, section) => sum + section.timeLimitSeconds, 0),
      sections,
    })
  );
}
