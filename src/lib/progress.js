// src/lib/progress.js
// Progress persistence helpers: mirror locally-stored practice attempts into
// Supabase for signed-in users, and provide a one-shot migration that backfills
// any attempts a user accumulated while logged out (localStorage) into the
// `attempts` table.
//
// RLS (0005) lets the owner INSERT + SELECT their own `attempts` rows and they
// are immutable after insert. We therefore never UPDATE — we only insert new
// rows and use a localStorage marker to stay idempotent (never double-insert
// the same local attempt).
//
// Everything here FAILS SOFT: a DB / network / storage error must never break
// the results UI. Callers get a small result object but can ignore it.

import { getSupabase } from '../../lib/supabase';

// localStorage keys written by QuestionEngine's persistAttempt():
//   ielts-attempt:<skill>:<slug>  ->  { skill, slug, answers, score, total, timestamp, ... }
const ATTEMPT_PREFIX = 'ielts-attempt:';

// Idempotency marker: a JSON map of { [attemptStorageKey]: lastSyncedTimestamp }.
// We compare the stored timestamp against the attempt payload's timestamp so a
// re-submission of the same passage (which overwrites the attempt key in place)
// is re-synced, while an unchanged attempt is skipped.
const SYNCED_MARKER_KEY = 'ielts-attempts-synced';

function readSyncedMarker() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(SYNCED_MARKER_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeSyncedMarker(marker) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SYNCED_MARKER_KEY, JSON.stringify(marker));
  } catch {
    /* storage full / unavailable — non-fatal */
  }
}

// Mark a single local attempt (by its storage key) as synced for a given
// payload timestamp. Exported so QuestionEngine can mark a live submission it
// just persisted to Supabase, preventing syncLocalAttempts from re-inserting it.
export function markAttemptSynced(storageKey, timestamp) {
  if (!storageKey) return;
  const marker = readSyncedMarker();
  marker[storageKey] = timestamp || true;
  writeSyncedMarker(marker);
}

// Resolve a passage slug (or legacy Firestore id) to its passage UUID.
// Returns null when it cannot be resolved (unknown slug, offline, RLS, etc.).
export async function resolvePassageId(slugOrLegacyId, skill) {
  if (!slugOrLegacyId) return null;
  try {
    const supabase = getSupabase();
    let query = supabase.from('passages').select('id').eq('slug', slugOrLegacyId);
    if (skill) query = query.eq('skill', skill);
    const { data, error } = await query.maybeSingle();
    if (!error && data && data.id) return data.id;

    // Fallback: the storage key may be a legacy Firestore id, not a slug.
    const res = await supabase
      .from('passages')
      .select('id')
      .eq('legacy_firestore_id', slugOrLegacyId)
      .maybeSingle();
    if (!res.error && res.data && res.data.id) return res.data.id;
    return null;
  } catch {
    return null;
  }
}

// The attempts_free_practice_cap trigger rejects a free account's next new
// Reading/Listening passage with SQLSTATE PT402 (HTTP 402 via PostgREST).
export function isPracticeLimitError(error) {
  return error?.code === 'PT402' || error?.message === 'free_practice_limit';
}

// Insert one attempt row for a signed-in user. Columns match 0004's `attempts`:
//   user_id, passage_id (nullable), skill, responses (jsonb), raw_score, band,
//   submitted_at, total and per_question.
// Returns { ok: true } or { ok: false, error }. Never throws.
export async function saveAttemptToSupabase({
  userId,
  passageId,
  mockTestId,
  skill,
  responses,
  rawScore,
  total,
  perQuestion,
  band,
  startedAt,
  submittedAt,
}) {
  if (!userId || !skill) return { ok: false, error: 'missing-user-or-skill' };
  try {
    const supabase = getSupabase();
    const row = {
      user_id: userId,
      passage_id: passageId ?? null,
      mock_test_id: mockTestId ?? null,
      skill,
      responses: responses ?? {},
      raw_score: typeof rawScore === 'number' ? rawScore : null,
      total: typeof total === 'number' ? total : null,
      per_question: perQuestion && typeof perQuestion === 'object' ? perQuestion : null,
      band: typeof band === 'number' ? band : null,
      started_at: startedAt || null,
      submitted_at: submittedAt || new Date().toISOString(),
    };
    const { error } = await supabase.from('attempts').insert(row);
    if (error) return { ok: false, error, practiceLimit: isPracticeLimitError(error) };
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

function collectLocalAttempts() {
  if (typeof window === 'undefined') return [];
  const out = [];
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(ATTEMPT_PREFIX)) continue;
      try {
        const payload = JSON.parse(window.localStorage.getItem(key));
        if (payload && typeof payload === 'object') out.push({ key, payload });
      } catch {
        /* corrupt entry — skip */
      }
    }
  } catch {
    /* localStorage unavailable */
  }
  return out;
}

// One-shot migration: push any locally-stored practice attempts for this user
// into Supabase. Idempotent via the synced marker (safe to call repeatedly, and
// on every login). Unresolvable passages (unknown slug) are skipped gracefully.
// Returns a small summary; callers may ignore it.
export async function syncLocalAttempts(userId) {
  const summary = { synced: 0, skipped: 0, failed: 0 };
  if (!userId || typeof window === 'undefined') return summary;

  const attempts = collectLocalAttempts();
  if (attempts.length === 0) return summary;

  const marker = readSyncedMarker();

  for (const { key, payload } of attempts) {
    const timestamp = payload.timestamp || '';
    // Already synced at this timestamp -> nothing to do.
    if (marker[key] && marker[key] === timestamp) {
      summary.skipped += 1;
      continue;
    }

    const skill = payload.skill;
    const slug = payload.slug || key.split(':').slice(2).join(':');
    if (!skill || !slug) {
      summary.skipped += 1;
      continue;
    }

    // Local attempts reference passages by slug; resolve to the UUID FK.
    const passageId = await resolvePassageId(slug, skill);
    if (!passageId) {
      // Cannot map to a real passage row — skip gracefully (do NOT mark synced,
      // so a later attempt with content available can still succeed).
      summary.skipped += 1;
      continue;
    }

    const band =
      typeof payload.band === 'number' ? payload.band : null;

    const res = await saveAttemptToSupabase({
      userId,
      passageId,
      skill,
      responses: payload.answers || {},
      rawScore: typeof payload.score === 'number' ? payload.score : null,
      total: typeof payload.total === 'number' ? payload.total : null,
      perQuestion: payload.perQuestion || null,
      band,
      startedAt: payload.startedAt || null,
      submittedAt: timestamp || undefined,
    });

    if (res.ok) {
      marker[key] = timestamp || true;
      summary.synced += 1;
    } else {
      summary.failed += 1;
    }
  }

  writeSyncedMarker(marker);
  return summary;
}
