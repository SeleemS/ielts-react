// src/components/question/grade.js
// Single, data-driven grading utility for EVERY IELTS question type.
//
// It consumes the STRUCTURED answer_keys shape uniformly:
//   answerKey = { accepted[], correctOptionKeys[], spellingVariants, wordLimit, normalize }
//
// The continuous global question number (1..N) is the ONLY key used for
// storage, display and grading — see `question.number` populated by
// getStructuredPassage in lib/supabase.js. This is the invariant that a prior
// numbering bug violated, so it is preserved end-to-end here.
import { listeningBand, readingBand } from '../../../lib/bandTables';

// ---------------------------------------------------------------------------
// Question-type classification. Every enum value in public.question_type maps
// to exactly one INPUT kind and one GRADE strategy.
// ---------------------------------------------------------------------------
export const TYPE_CONFIG = {
  multiple_choice: { input: 'radio', grade: 'optionKeySingle' },
  multiple_choice_multi: { input: 'checkbox', grade: 'optionKeySet' },
  true_false_notgiven: { input: 'boolean', grade: 'accepted', choices: 'tfng' },
  yes_no_notgiven: { input: 'boolean', grade: 'accepted', choices: 'ynng' },
  matching_information: { input: 'select', grade: 'optionKeySingle' },
  matching_headings: { input: 'select', grade: 'optionKeySingle' },
  matching_features: { input: 'select', grade: 'optionKeySingle' },
  matching_sentence_endings: { input: 'select', grade: 'optionKeySingle' },
  sentence_completion: { input: 'text', grade: 'accepted' },
  summary_completion: { input: 'text', grade: 'accepted' },
  note_completion: { input: 'text', grade: 'accepted' },
  table_completion: { input: 'text', grade: 'accepted' },
  flowchart_completion: { input: 'text', grade: 'accepted' },
  short_answer: { input: 'text', grade: 'accepted' },
  // Plan/map labelling supplies lettered options: pick A-H from the image.
  plan_map_diagram_label: { input: 'select', grade: 'optionKeySingle' },
  // Image-dependent completion types degrade gracefully to labelled text inputs.
  diagram_label: { input: 'visual', grade: 'accepted' },
  form_completion: { input: 'visual', grade: 'accepted' },
};

const DEFAULT_CONFIG = { input: 'text', grade: 'accepted' };

export function typeConfig(questionType) {
  return TYPE_CONFIG[questionType] || DEFAULT_CONFIG;
}

// Fixed choice sets for the boolean-style types.
export const BOOLEAN_CHOICES = {
  tfng: [
    { value: 'true', label: 'True' },
    { value: 'false', label: 'False' },
    { value: 'not given', label: 'Not Given' },
  ],
  ynng: [
    { value: 'yes', label: 'Yes' },
    { value: 'no', label: 'No' },
    { value: 'not given', label: 'Not Given' },
  ],
};

export function booleanChoices(questionType) {
  const cfg = typeConfig(questionType);
  return BOOLEAN_CHOICES[cfg.choices] || BOOLEAN_CHOICES.tfng;
}

// ---------------------------------------------------------------------------
// Text normalisation
// ---------------------------------------------------------------------------
export function normalizeText(text, policy = 'lower_trim') {
  const s = String(text ?? '');
  switch (policy) {
    case 'none':
      return s;
    case 'trim':
      return s.trim().replace(/\s+/g, ' ');
    case 'lower_trim':
    default:
      return s.trim().replace(/\s+/g, ' ').toLowerCase();
  }
}

export function countWords(text) {
  return String(text ?? '')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

// Symmetric US/UK canonicalisation. Applied to BOTH the user's answer and the
// accepted answers when answerKey.spellingVariants is true, so a UK spelling
// matches a US key and vice-versa regardless of which the author stored.
export function canonicalizeSpelling(text) {
  let s = String(text ?? '');
  s = s
    // -our -> -or (colour->color, favour->favor, neighbour->neighbor)
    .replace(/our\b/g, 'or')
    // -ise/-isation/-ising/-ised -> -ize family (organise->organize)
    .replace(/isation\b/g, 'ization')
    .replace(/ising\b/g, 'izing')
    .replace(/ised\b/g, 'ized')
    .replace(/ise\b/g, 'ize')
    // -yse -> -yze (analyse->analyze)
    .replace(/yse\b/g, 'yze')
    // -tre -> -ter (centre->center, metre->meter, theatre->theater)
    .replace(/tre\b/g, 'ter')
    // doubled-l before common suffixes (travelled->traveled, traveller->traveler)
    .replace(/lled\b/g, 'led')
    .replace(/lling\b/g, 'ling')
    .replace(/ller\b/g, 'ler')
    // defence->defense, licence->license, practise->practice(->practise handled by ise)
    .replace(/ence\b/g, 'ense')
    // grey -> gray
    .replace(/\bgrey\b/g, 'gray')
    // programme -> program, catalogue -> catalog, dialogue -> dialog
    .replace(/gramme\b/g, 'gram')
    .replace(/logue\b/g, 'log');
  return s;
}

// ---------------------------------------------------------------------------
// Option-key helpers (choice / matching types)
// ---------------------------------------------------------------------------
function optionText(group, key) {
  const opt = (group.options || []).find((o) => o.key === key);
  return opt ? opt.text : null;
}

function keysToDisplay(group, keys) {
  return (keys || [])
    .map((k) => {
      const t = optionText(group, k);
      return t ? `${k}. ${t}` : k;
    })
    .join('; ');
}

function toArray(v) {
  if (Array.isArray(v)) return v.filter((x) => x != null && x !== '');
  if (v == null || v === '') return [];
  return [v];
}

function setsEqual(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size !== sb.size) return false;
  for (const x of sa) if (!sb.has(x)) return false;
  return true;
}

function titleCase(s) {
  return String(s || '')
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// ---------------------------------------------------------------------------
// Grade a single question. Returns a uniform result object regardless of type.
//   { correct, answered, correctDisplay, userDisplay }
// ---------------------------------------------------------------------------
export function gradeQuestion(group, question, userAnswer) {
  const cfg = typeConfig(group.questionType);
  const ak = question.answerKey || {
    accepted: [],
    correctOptionKeys: [],
    spellingVariants: false,
    wordLimit: null,
    normalize: 'lower_trim',
  };

  // --- multiple_choice_multi: selected set must EQUAL correct set ----------
  if (cfg.grade === 'optionKeySet') {
    const userSet = toArray(userAnswer);
    const correctSet = ak.correctOptionKeys || [];
    return {
      answered: userSet.length > 0,
      correct: userSet.length > 0 && setsEqual(userSet, correctSet),
      correctDisplay: keysToDisplay(group, correctSet),
      userDisplay: keysToDisplay(group, userSet),
    };
  }

  // --- single-option choice: multiple_choice + all matching_* --------------
  if (cfg.grade === 'optionKeySingle') {
    const key = Array.isArray(userAnswer) ? userAnswer[0] : userAnswer;
    const correctKeys = ak.correctOptionKeys || [];
    const answered = key != null && key !== '';
    return {
      answered,
      correct: answered && correctKeys.includes(key),
      correctDisplay: keysToDisplay(group, correctKeys),
      userDisplay: answered
        ? optionText(group, key)
          ? `${key}. ${optionText(group, key)}`
          : String(key)
        : '',
    };
  }

  // --- boolean (TFNG / YNNG): compare against accepted[] case-insensitively -
  if (cfg.input === 'boolean') {
    const u = normalizeText(userAnswer, 'lower_trim');
    const accepted = (ak.accepted || []).map((a) => normalizeText(a, 'lower_trim'));
    const answered = u !== '';
    return {
      answered,
      correct: answered && accepted.includes(u),
      correctDisplay: titleCase(ak.accepted && ak.accepted[0] ? ak.accepted[0] : ''),
      userDisplay: answered ? titleCase(u) : '',
    };
  }

  // --- text (completion + short_answer + visual fallback) ------------------
  const raw = String(userAnswer ?? '');
  const answered = raw.trim() !== '';
  const policy = ak.normalize || 'lower_trim';
  const norm = normalizeText(raw, policy);

  let correct = false;
  const overLimit = ak.wordLimit ? countWords(raw) > ak.wordLimit : false;
  if (answered && !overLimit) {
    const acceptedNorm = (ak.accepted || []).map((a) => normalizeText(a, policy));
    correct = acceptedNorm.includes(norm);
    if (!correct && ak.spellingVariants) {
      const cu = canonicalizeSpelling(norm);
      correct = (ak.accepted || [])
        .map((a) => canonicalizeSpelling(normalizeText(a, policy)))
        .includes(cu);
    }
  }

  return {
    answered,
    correct,
    correctDisplay: (ak.accepted || []).join(' / '),
    userDisplay: raw,
    overLimit,
  };
}

// ---------------------------------------------------------------------------
// Grade the whole passage. Keys are the continuous global number (1..N).
// ---------------------------------------------------------------------------
export function gradeAll(groups, answers) {
  const byNumber = {};
  let total = 0;
  let score = 0;
  (groups || []).forEach((group) => {
    (group.questions || []).forEach((question) => {
      total += 1;
      const res = gradeQuestion(group, question, answers[question.number]);
      if (res.correct) score += 1;
      byNumber[question.number] = res;
    });
  });
  return { total, score, byNumber };
}

// ---------------------------------------------------------------------------
// Optional band estimate (Academic Reading / Listening raw->band, scaled to
// the number of questions present). Clearly an ESTIMATE for short practice sets.
// ---------------------------------------------------------------------------
export function estimateBand(score, total, skill = 'reading', module = 'academic') {
  if (!total) return null;
  const scaledRaw = Math.round((Number(score) / Number(total)) * 40);
  return skill === 'listening'
    ? listeningBand(scaledRaw)
    : readingBand(scaledRaw, module);
}

// ---------------------------------------------------------------------------
// Display helpers (shared by QuestionGroup / QuestionItem).
// ---------------------------------------------------------------------------

// Some imported option texts already start with their own key ("A) It suits a
// small space…"), which doubles up with the "A." the UI renders. Strip a
// leading "A)", "A.", "(A)", "A:" or "A -" ONLY when it matches this option's
// key, so texts that legitimately start with a letter are untouched.
export function stripOptionKeyPrefix(key, text) {
  if (!key || !text) return text;
  const esc = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`^\\s*(?:\\(${esc}\\)|${esc}\\s*[).:\\-])\\s*`, 'i');
  const stripped = String(text).replace(re, '');
  return stripped.trim() ? stripped : text;
}

// Group prompts imported as "Question 7: Choose the correct letter…" repeat
// the "QUESTION 7" range eyebrow the UI already renders above them. Drop the
// redundant "Question(s) N(–M):" lead-in (also after a mock's "Section 1 · "
// prefix) but keep the rest of the prompt.
export function cleanGroupPrompt(prompt) {
  if (!prompt) return prompt;
  const cleaned = String(prompt).replace(
    /(^|·\s*)questions?\s+\d+\s*(?:[-–—]\s*\d+)?\s*[:.]\s*/i,
    '$1'
  );
  return cleaned.trim() ? cleaned.trim() : prompt;
}
