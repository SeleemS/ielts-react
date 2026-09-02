// src/lib/writingDraft.js
// One-shot handoff of an essay drafted OUTSIDE the writing checker (currently
// the homepage hero paste box) into /ielts-writing-checker, which pre-fills the
// form and immediately continues into the normal flow: sign-in gate → free
// lifetime sample → report (or the Pro gate when the sample is spent).
//
// Storage: sessionStorage, keyed in the same `ielts-attempt:<skill>:<slug>`
// namespace QuestionEngine uses for reading/listening attempts, so every
// in-flight piece of practice work lives under one recognisable prefix. It is
// a HANDOFF, not a durable draft: the checker consumes (reads + deletes) it on
// mount and its own `ielts-writing-checker-draft` localStorage record takes
// over from there. Session scope also means a stale essay never resurfaces in
// a new tab days later.

export const WRITING_DRAFT_KEY = 'ielts-attempt:writing:hero-draft';

// Task types accepted by the checker's <Select>. The hero only offers the two
// top-level choices; General Training Task 1 is picked on the checker itself.
const TASK_TYPES = new Set(['task1-academic', 'task1-general', 'task2']);
const DEFAULT_TASK_TYPE = 'task2';

// Guardrail matching the checker's own MAX_CHARS ceiling — a draft larger than
// the API would ever accept is not worth carrying across the navigation.
const MAX_ESSAY_CHARS = 25000;
const MAX_PROMPT_CHARS = 2000;

function normalizeTaskType(value) {
  return typeof value === 'string' && TASK_TYPES.has(value) ? value : DEFAULT_TASK_TYPE;
}

function normalizeText(value, max) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

// Serialize a hero draft to the string stored in sessionStorage. Versioned so
// a future shape change can be ignored rather than mis-parsed.
export function serializeWritingDraft({ taskType, prompt, essay, autoSubmit = true } = {}) {
  return JSON.stringify({
    v: 1,
    taskType: normalizeTaskType(taskType),
    prompt: normalizeText(prompt, MAX_PROMPT_CHARS),
    essay: normalizeText(essay, MAX_ESSAY_CHARS),
    autoSubmit: autoSubmit !== false,
    createdAt: new Date().toISOString(),
  });
}

// Parse a stored draft back into a normalized object, or null when the record
// is missing, malformed, from another version, or carries no essay text.
export function parseWritingDraft(raw) {
  if (typeof raw !== 'string' || !raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (parsed.v !== 1) return null;
  const essay = normalizeText(parsed.essay, MAX_ESSAY_CHARS);
  if (!essay.trim()) return null;
  return {
    taskType: normalizeTaskType(parsed.taskType),
    prompt: normalizeText(parsed.prompt, MAX_PROMPT_CHARS),
    essay,
    autoSubmit: parsed.autoSubmit !== false,
    createdAt: typeof parsed.createdAt === 'string' ? parsed.createdAt : null,
  };
}

// Write the handoff. Returns false when storage is unavailable (private mode,
// quota) so the caller can still navigate — the checker then simply opens empty.
export function saveWritingDraft(draft) {
  if (typeof window === 'undefined') return false;
  try {
    window.sessionStorage.setItem(WRITING_DRAFT_KEY, serializeWritingDraft(draft));
    return true;
  } catch {
    return false;
  }
}

// Read AND remove the handoff: it must fire exactly once, so a refresh of the
// checker does not silently re-score the same essay.
export function consumeWritingDraft() {
  if (typeof window === 'undefined') return null;
  let raw = null;
  try {
    raw = window.sessionStorage.getItem(WRITING_DRAFT_KEY);
    window.sessionStorage.removeItem(WRITING_DRAFT_KEY);
  } catch {
    return null;
  }
  return parseWritingDraft(raw);
}
