// pages/api/score/speaking.js
// Server-side IELTS Speaking scoring. Mirrors pages/api/score/writing.js but for
// audio: the client uploads a recording to the OWNER-ONLY `speaking-uploads`
// bucket, then POSTs the storage path here. This route (Node runtime, needs the
// secret OPENAI_API_KEY + Supabase service role):
//   * REQUIRES sign-in; entitlement via consume_ai_score v8 — Premium plans
//     get fair-use caps, free accounts get ONE lifetime sampled score whose
//     response is reduced server-side to band + first criterion (2026-08-02);
//   * enforces per-user ownership of the audio path (the bucket is per-uid);
//   * rate-limits per user AND enforces a daily global circuit breaker via the
//     SAME Supabase check_rate_limit() RPC used by writing (service role);
//   * downloads the audio with the service role, caps its size;
//   * TRANSCRIBES with OpenAI Whisper (whisper-1);
//   * SCORES the transcript against the official IELTS Speaking band descriptors
//     on THREE transcript-assessable criteria only (Fluency & Coherence, Lexical
//     Resource, Grammatical Range & Accuracy) using Structured Outputs (strict
//     JSON schema). Pronunciation is deliberately NOT band-scored — a transcript
//     cannot assess phonemes/stress/intonation;
//   * persists a `scores` row (skill='speaking') exactly like writing so it shows
//     on the dashboard;
//   * never leaks the OpenAI key: upstream failures surface as generic 502s.
//
// pages/api/* run on the Node.js runtime by default, which is what we need
// (Whisper multipart upload + service-role secrets).
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { originAllowed } from '../../../lib/apiSecurity';
import {
  audioUsageRow,
  chatUsageRow,
  recordAiUsage,
} from '../../../lib/aiCost';
import { chatCompletionWithFallback } from '../../../lib/openaiChat';
import {
  buildSpeakingScoreSchema,
  isValidSpeakingBand,
} from '../../../lib/speakingScoreSchema';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const OPENAI_TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';
// Scoring is Premium-only, so every score uses the strong paid model.
const PAID_MODEL = process.env.SCORING_MODEL_PAID || process.env.OPENAI_SPEAKING_MODEL || 'gpt-5.1';
const WHISPER_MODEL = 'whisper-1';

const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // 10 MB hard cap
const MIN_TRANSCRIPT_WORDS = 15; // below this we cannot fairly score speech

// Per-user allowance and a hard global daily ceiling (cost circuit breaker),
// reusing the SAME check_rate_limit() RPC / rate_limits table as writing.
const PER_USER_WINDOW_SECONDS = 86400; // 1 day
const PER_USER_MAX = 10; // 10 scorings / day / user
const GLOBAL_WINDOW_SECONDS = 86400; // 1 day
const GLOBAL_MAX = 300; // hard daily ceiling across all users

const OPENAI_TIMEOUT_MS = 45000;

const PRONUNCIATION_NOTE =
  "Pronunciation (phonemes, stress, intonation) can't be assessed from a transcript. " +
  'Focus here on fluency, vocabulary and grammar; consider a human/tutor check for pronunciation.';

function quotaLimitMessage(quota) {
  const period = quota?.limitPeriod || 'day';
  const limit = quota?.limit || (period === 'day' ? 1 : null);
  const label = limit ? `${limit} Speaking score${limit === 1 ? '' : 's'} per ${period}` : `${period}ly Speaking scores`;
  return `You have reached your fair-use limit of ${label}.`;
}

// ---------------------------------------------------------------------------
// Supabase service-role client (server-only; bypasses RLS for rate_limits,
// storage download, passage lookup and score persistence).
// ---------------------------------------------------------------------------
let _admin = null;
function getAdmin() {
  if (_admin) return _admin;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase-admin-not-configured');
  _admin = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _admin;
}

function supabaseUrl() {
  return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
}

async function checkLimit(bucket, identifier, windowSeconds, max) {
  try {
    const { data, error } = await getAdmin().rpc('check_rate_limit', {
      p_bucket: bucket,
      p_identifier: identifier,
      p_window_seconds: windowSeconds,
      p_max: max,
    });
    return { allowed: data === true, error };
  } catch (error) {
    return { allowed: false, error };
  }
}

async function consumeQuota(userId) {
  const { data, error } = await getAdmin().rpc('consume_ai_score', {
    p_uid: userId,
    p_skill: 'speaking',
  });
  if (error) throw error;
  return data;
}

async function refundQuota(userId, quota) {
  if (!quota?.allowed || !quota?.consumedAt) return;
  try {
    const { error } = await getAdmin().rpc('refund_ai_score', {
      p_uid: userId,
      p_skill: 'speaking',
      // Restores the lifetime free sample / referral credit when the score
      // it paid for failed.
      p_free: quota.free === true,
      p_consumed_at: quota.consumedAt,
      p_referral: quota.referral === true,
    });
    if (error) throw error;
  } catch (error) {
    console.error('quota refund failed:', error.message);
  }
}

async function cleanupRecording(audioPath) {
  if (!audioPath) return;
  try {
    await getAdmin().storage.from('speaking-uploads').remove([audioPath]);
  } catch (error) {
    console.error('speaking upload cleanup failed:', error.message);
  }
}

// ---------------------------------------------------------------------------
// REQUIRED auth: verify `Authorization: Bearer <access token>` and return the
// user id. Unlike writing (optional auth), speaking REQUIRES sign-in, so a null
// here is a 401 upstream. Uses the Supabase auth API via the admin client.
// ---------------------------------------------------------------------------
async function resolveUserId(req) {
  const authz = req.headers.authorization || req.headers.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(authz).trim());
  if (!match) return null;
  const token = match[1].trim();
  if (!token) return null;
  const { data, error } = await getAdmin().auth.getUser(token);
  if (error || !data || !data.user) return null;
  return data.user.id;
}

// Fetch the passage (+ speaking detail) by slug via the service role, so the
// model knows what the candidate was actually asked. Missing prompts, part
// mismatches, and dependency failures stay distinct so scoring never proceeds
// against invented or incomplete context.
async function fetchPassageContext(passageSlug, part) {
  try {
    const admin = getAdmin();
    const { data, error } = await admin
      .from('passages')
      .select(
        'id, title, speaking_details ( part, part1_questions, cue_card, part3_followups )'
      )
      .eq('slug', passageSlug)
      .eq('skill', 'speaking')
      .maybeSingle();
    if (error) {
      console.error('passage lookup failed:', error.message);
      return { passage: null, error, partMismatch: false };
    }
    if (!data) {
      return { passage: null, error: null, partMismatch: false };
    }
    const det = Array.isArray(data.speaking_details)
      ? data.speaking_details[0]
      : data.speaking_details;
    const storedPart = Number(det?.part);
    if ([1, 2, 3].includes(storedPart) && storedPart !== part) {
      return { passage: null, error: null, partMismatch: true };
    }
    return {
      passage: {
        id: data.id,
        contextText: buildPassageContextText(data.title, det, part),
      },
      error: null,
      partMismatch: false,
    };
  } catch (e) {
    console.error('fetchPassageContext error:', e.message);
    return { passage: null, error: e, partMismatch: false };
  }

}

// Turn the part-specific JSONB into a compact plain-text brief for the examiner
// prompt. Defensive: any missing shape just yields less context, never a throw.
function buildPassageContextText(title, det, part) {
  const lines = [];
  if (title) lines.push(`Topic: ${title}`);
  if (!det) return lines.join('\n');

  const listQuestions = (arr) =>
    (Array.isArray(arr) ? arr : [])
      .map((q) => (q && typeof q.text === 'string' ? `- ${q.text}` : null))
      .filter(Boolean)
      .join('\n');

  if (part === 1 && det.part1_questions) {
    const p = det.part1_questions;
    if (p.topic) lines.push(`Part 1 topic: ${p.topic}`);
    const qs = listQuestions(p.questions);
    if (qs) lines.push('Questions asked:\n' + qs);
  } else if (part === 2 && det.cue_card) {
    const c = det.cue_card;
    if (c.topic) lines.push(`Cue card: ${c.topic}`);
    if (Array.isArray(c.bullets) && c.bullets.length) {
      lines.push('You should say:\n' + c.bullets.map((b) => `- ${b}`).join('\n'));
    }
    if (c.explainLine) lines.push(c.explainLine);
  } else if (part === 3 && det.part3_followups) {
    const p = det.part3_followups;
    if (p.theme) lines.push(`Part 3 theme: ${p.theme}`);
    const qs = listQuestions(p.questions);
    if (qs) lines.push('Discussion questions:\n' + qs);
  }
  return lines.join('\n');
}

// Persist a completed speaking score. Because scores.attempt_id is NOT NULL
// (0004) and scores are service-role-write only (0005), we insert an `attempts`
// row first (skill='speaking') then the `scores` row referencing it, both via
// the service-role client (bypasses RLS). Fully fail-soft: a DB error is logged
// (message only, never keys) and never affects the scoring response.
async function saveSpeakingScore({
  userId,
  passageId,
  part,
  audioPath,
  transcript,
  overallBand,
  criteria,
  model,
  startedAt,
}) {
  let admin;
  let attemptId;
  try {
    admin = getAdmin();

    const { data: attempt, error: attemptErr } = await admin
      .from('attempts')
      .insert({
        user_id: userId,
        passage_id: passageId || null,
        skill: 'speaking',
        responses: { part, audioPath, transcript },
        band: overallBand,
        started_at: startedAt || null,
        submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (attemptErr || !attempt) {
      console.error('speaking attempt insert failed:', attemptErr?.message || 'no row');
      return;
    }
    attemptId = attempt.id;

    const { error: scoreErr } = await admin.from('scores').insert({
      attempt_id: attempt.id,
      user_id: userId,
      skill: 'speaking',
      overall_band: overallBand,
      criteria,
      model,
    });
    if (scoreErr) {
      console.error('speaking score insert failed:', scoreErr.message);
      await rollbackSpeakingAttempt(admin, attemptId);
    }
  } catch (e) {
    console.error('saveSpeakingScore error:', e.message);
    if (admin && attemptId) await rollbackSpeakingAttempt(admin, attemptId);
  }
}

async function rollbackSpeakingAttempt(admin, attemptId) {
  try {
    const { error } = await admin.from('attempts').delete().eq('id', attemptId);
    if (error) throw error;
  } catch (error) {
    console.error('speaking attempt rollback failed:', error.message);
  }
}

function countWords(str) {
  return String(str || '')
    .split(/\s+/)
    .filter(Boolean).length;
}

// Average of the three criterion bands, rounded to the NEAREST 0.5.
function roundHalfBand(a, b, c) {
  const avg = (a + b + c) / 3;
  return Math.round(avg * 2) / 2;
}

// ---------------------------------------------------------------------------
// Examiner rubric (system prompt) — THREE transcript-assessable criteria only.
// ---------------------------------------------------------------------------
function buildSystemPrompt() {
  return `You are a certified, experienced IELTS Speaking examiner. You mark strictly and consistently against the official IELTS Speaking public band descriptors. Marking is fair and evidence-based: for every judgement you cite concrete evidence quoted or paraphrased from the candidate's transcribed answer.

IMPORTANT: you are scoring a TRANSCRIPT of the candidate's spoken answer (produced by automatic speech recognition). You therefore assess ONLY the THREE criteria that a transcript can support, each on the 0-9 band scale (halves allowed, e.g. 6.5):

1. Fluency and Coherence — the ability to talk at length coherently: flow and pace evident in the transcript, connected ideas, logical sequencing and topic development, use of cohesive devices and discourse markers, and self-correction/hesitation markers ("um", "you know", false starts, repetition) where visible. Do NOT penalise natural spoken features that would be normal in speech.
2. Lexical Resource — range and precision of vocabulary, ability to paraphrase, use of less common and idiomatic items, collocation, and appropriacy for the topic.
3. Grammatical Range and Accuracy — range of structures (simple vs. complex), the proportion of error-free clauses, and the communicative effect of errors.

You do NOT assess Pronunciation — it cannot be judged from a transcript. Do not mention a pronunciation band.

WHAT THE BANDS MEAN (apply the real Speaking descriptors):
- Band 9: speaks fluently with only very occasional repetition/self-correction; any hesitation is content- not language-related; fully coherent and appropriately developed; full and precise vocabulary with natural idiomatic control; full range of structures naturally and accurately, errors extremely rare.
- Band 8: fluent with only occasional repetition/self-correction; hesitation usually content-related; develops topics coherently; wide vocabulary to convey precise meaning, skilful paraphrase; wide range of structures flexibly, majority error-free, only occasional inappropriacies/basic errors.
- Band 7: speaks at length without noticeable effort (some loss of coherence from occasional repetition/self-correction/hesitation); flexible use of a range of connectives/discourse markers; vocabulary resource to discuss a variety of topics with some less common/idiomatic items (with occasional inaccuracies); a range of complex structures with frequent error-free sentences, though some grammatical errors persist.
- Band 6: willing to speak at length though may lose coherence at times due to occasional repetition/self-correction/hesitation; uses a range of connectives but not always appropriately; wide enough vocabulary to discuss topics at length and make meaning clear despite inappropriacies; a mix of simple and complex structures with limited flexibility; frequent errors in complex structures though these rarely impede communication.
- Band 5: usually maintains flow but with noticeable effort, repetition, self-correction and/or slow speech; over-uses certain connectives/discourse markers; manages to talk about familiar/unfamiliar topics but with limited flexibility and frequent inappropriate word choice; basic sentence forms with reasonable accuracy but limited range of complex structures, which usually contain errors and may cause comprehension problems.
- Band 4: cannot respond without noticeable pauses; may speak slowly with frequent repetition/self-correction; links only basic sentences with simple connectives, with repetitious use; able to talk about familiar topics only, conveying basic meaning; produces basic sentence forms and some correct simple sentences but subordinate structures are rare and errors are frequent.
- Below 4: long pauses before most words; little communication possible; only isolated words or memorised utterances; cannot produce basic sentence forms.

EVIDENCE FROM THE TRANSCRIPT: base every band on what is actually present. A short answer that shows little language cannot score highly on any criterion — say so and note the limited sample. Treat ASR artefacts charitably (do not penalise a plausible mishearing as a "grammar error" unless the transcript clearly shows a candidate error).

OVERALL BAND RULE: overallBand = the average of the THREE criterion bands, rounded to the NEAREST 0.5. Compute it exactly this way; do not eyeball it.

FEEDBACK STYLE: Be specific and constructive. In each criterion's feedback, name concrete strengths and weaknesses and quote or paraphrase actual phrases from the transcript as evidence. The summary should give an honest overall picture. improvements must be concrete, actionable next steps the candidate can practise.

Return ONLY the structured JSON object requested — no prose, no markdown, no HTML.`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  if (!originAllowed(req)) {
    return res
      .status(403)
      .json({ error: 'Requests from this origin are not allowed.' });
  }

  // --- 1. REQUIRED auth ----------------------------------------------------
  let userId;
  try {
    userId = await resolveUserId(req);
  } catch (e) {
    console.error('auth check failed:', e.message);
    return res
      .status(503)
      .json({ error: 'Scoring is temporarily unavailable. Please try again later.' });
  }
  if (!userId) {
    return res
      .status(401)
      .json({ error: 'Please sign in to get your speaking answer scored.' });
  }

  // Entitlement is enforced by consume_ai_score (v8, 2026-08-02): free users
  // get ONE lifetime sampled Speaking score (band + first criterion, reduced
  // below before the response leaves the server); after that the RPC returns
  // premium_required. The former route-level hard gate predates the sample.

  // --- Validate body -------------------------------------------------------
  const body = req.body || {};
  const passageSlug =
    typeof body.passageSlug === 'string' ? body.passageSlug.trim() : '';
  const part = body.part === 1 || body.part === 2 || body.part === 3
    ? body.part
    : Number(body.part) === 1 || Number(body.part) === 2 || Number(body.part) === 3
      ? Number(body.part)
      : null;
  const audioPath =
    typeof body.audioPath === 'string' ? body.audioPath.trim() : '';
  const resumeSaved = body.resume_saved === true;

  if (!passageSlug) {
    return res.status(400).json({ error: 'passageSlug is required.' });
  }
  if (!part) {
    return res.status(400).json({ error: 'part must be 1, 2 or 3.' });
  }
  if (!audioPath) {
    return res.status(400).json({ error: 'audioPath is required.' });
  }
  // No path traversal / absolute paths.
  if (audioPath.includes('..') || audioPath.startsWith('/')) {
    return res.status(400).json({ error: 'Invalid audioPath.' });
  }

  // --- 2. Ownership: the bucket is per-uid; the path MUST be under the user's
  // own folder. This is the primary IDOR guard (defence-in-depth over RLS).
  if (!audioPath.startsWith(`${userId}/`)) {
    return res
      .status(403)
      .json({ error: 'You can only score your own recordings.' });
  }

  // Fresh recordings remain aggressively cleaned on every failure. A saved
  // post-checkout recording has no browser Blob to recreate it, so retain that
  // explicitly resumed object only for retryable failures; the 30-day cleanup
  // cron remains the outer retention bound.
  const cleanupRetryableRecording = async () => {
    if (!resumeSaved) await cleanupRecording(audioPath);
  };

  // --- 3. Rate limit BEFORE any OpenAI spend -------------------------------
  // Check the owner bucket before the shared circuit breaker. Both calls
  // increment, so an owner already at their cap must not reduce global access.
  const userLimit = await checkLimit(
    'speaking-score',
    userId,
    PER_USER_WINDOW_SECONDS,
    PER_USER_MAX
  );
  if (userLimit.error) {
    console.error('rate-limit check failed:', userLimit.error.message);
    await cleanupRetryableRecording();
    return res
      .status(503)
      .json({ error: 'Scoring is temporarily unavailable. Please try again later.' });
  }
  if (!userLimit.allowed) {
    await cleanupRetryableRecording();
    return res.status(429).json({
      error: `You have reached the limit of ${PER_USER_MAX} speaking scorings per day. Please try again tomorrow.`,
    });
  }

  const dayKey = new Date().toISOString().slice(0, 10);
  const globalLimit = await checkLimit(
    'speaking-score-global',
    dayKey,
    GLOBAL_WINDOW_SECONDS,
    GLOBAL_MAX
  );
  if (globalLimit.error) {
    console.error('rate-limit check failed:', globalLimit.error.message);
    await cleanupRetryableRecording();
    return res
      .status(503)
      .json({ error: 'Scoring is temporarily unavailable. Please try again later.' });
  }
  if (!globalLimit.allowed) {
    await cleanupRetryableRecording();
    return res.status(429).json({
      error:
        'AI scoring is temporarily unavailable due to high demand. Please try again later.',
    });
  }

  const passageLookup = await fetchPassageContext(passageSlug, part);
  if (passageLookup.error) {
    await cleanupRetryableRecording();
    return res
      .status(503)
      .json({ error: 'Scoring is temporarily unavailable. Please try again later.' });
  }
  if (passageLookup.partMismatch) {
    await cleanupRecording(audioPath);
    return res.status(400).json({
      error: 'The speaking part does not match this practice question.',
    });
  }
  if (!passageLookup.passage) {
    await cleanupRecording(audioPath);
    return res.status(404).json({
      error: 'Speaking question not found. Please choose another question.',
    });
  }
  const passage = passageLookup.passage;

  let quota;
  try {
    quota = await consumeQuota(userId);
  } catch (error) {
    console.error('quota check failed:', error.message);
    await cleanupRetryableRecording();
    return res.status(503).json({ error: 'Scoring is temporarily unavailable. Please try again later.' });
  }
  if (!quota?.allowed) {
    // A first-time Premium gate is the intentional checkout handoff and must
    // preserve its upload. An explicitly resumed recording also survives a
    // retryable quota denial so the user can retry after the quota resets.
    if (quota?.reason !== 'premium_required') await cleanupRetryableRecording();
    return res.status(402).json({
      error:
        quota?.reason === 'premium_required'
          ? 'AI Speaking scoring is a Premium feature. Upgrade to get your answer scored.'
          : quotaLimitMessage(quota),
      remaining: 0,
      reason: quota?.reason || 'quota_exceeded',
      resetsAt: quota?.resetsAt || null,
    });
  }
  const scoringModel = PAID_MODEL;

  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set');
    await refundQuota(userId, quota);
    await cleanupRetryableRecording();
    return res
      .status(502)
      .json({ error: 'Scoring is temporarily unavailable. Please try again later.' });
  }

  // --- 4. Download the audio via the SERVICE ROLE, capped at 10 MB ---------
  let audioBuffer;
  let audioContentType = 'audio/webm';
  try {
    const encodedPath = audioPath
      .split('/')
      .map(encodeURIComponent)
      .join('/');
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const objRes = await fetch(
      `${supabaseUrl()}/storage/v1/object/speaking-uploads/${encodedPath}`,
      { headers: { Authorization: `Bearer ${key}`, apikey: key } }
    );
    if (objRes.status === 404 || objRes.status === 400) {
      await refundQuota(userId, quota);
      return res
        .status(404)
        .json({ error: 'Recording not found. Please upload it again.' });
    }
    if (!objRes.ok) {
      console.error('storage download error', objRes.status);
      await refundQuota(userId, quota);
      await cleanupRetryableRecording();
      return res
        .status(502)
        .json({ error: 'Could not read your recording. Please try again.' });
    }
    const declaredLen = Number(objRes.headers.get('content-length') || 0);
    if (declaredLen && declaredLen > MAX_AUDIO_BYTES) {
      await refundQuota(userId, quota);
      await cleanupRecording(audioPath);
      return res
        .status(413)
        .json({ error: 'Your recording is too large to score (max 10 MB).' });
    }
    audioContentType = objRes.headers.get('content-type') || audioContentType;
    const arrBuf = await objRes.arrayBuffer();
    audioBuffer = Buffer.from(arrBuf);
    if (audioBuffer.length > MAX_AUDIO_BYTES) {
      await refundQuota(userId, quota);
      await cleanupRecording(audioPath);
      return res
        .status(413)
        .json({ error: 'Your recording is too large to score (max 10 MB).' });
    }
    if (audioBuffer.length === 0) {
      await refundQuota(userId, quota);
      await cleanupRecording(audioPath);
      return res
        .status(422)
        .json({ error: 'Your recording appears to be empty. Please record again.' });
    }
  } catch (e) {
    console.error('audio download failed:', e.message);
    await refundQuota(userId, quota);
    await cleanupRetryableRecording();
    return res
      .status(502)
      .json({ error: 'Could not read your recording. Please try again.' });
  }

  // --- 5. TRANSCRIBE with Whisper ------------------------------------------
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  let transcript = '';
  try {
    const filename = audioPath.split('/').pop() || 'recording.webm';
    const form = new FormData();
    form.append('model', WHISPER_MODEL);
    form.append('response_format', 'verbose_json');
    form.append(
      'file',
      new Blob([audioBuffer], { type: audioContentType }),
      filename
    );

    const wRes = await fetch(OPENAI_TRANSCRIBE_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
    });

    if (!wRes.ok) {
      const detail = await wRes.text().catch(() => '');
      console.error('Whisper error', wRes.status, detail.slice(0, 500));
      clearTimeout(timeout);
      await refundQuota(userId, quota);
      await cleanupRetryableRecording();
      return res.status(502).json({
        error: 'We could not transcribe your recording. Please try again.',
      });
    }
    const wPayload = await wRes.json();
    await recordAiUsage(
      getAdmin(),
      audioUsageRow({
        userId,
        skill: 'speaking',
        feature: 'speaking_transcription',
        operation: 'transcribe_recording',
        model: WHISPER_MODEL,
        durationSeconds: wPayload?.duration,
        providerRequestId: wPayload?.id || null,
        metadata: { part },
      })
    );
    transcript = typeof wPayload?.text === 'string' ? wPayload.text.trim() : '';
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') {
      console.error('Whisper request timed out');
      await refundQuota(userId, quota);
      await cleanupRetryableRecording();
      return res
        .status(502)
        .json({ error: 'Transcription took too long. Please try again.' });
    }
    console.error('transcription failed:', e.message);
    await refundQuota(userId, quota);
    await cleanupRetryableRecording();
    return res
      .status(502)
      .json({ error: 'We could not transcribe your recording. Please try again.' });
  }

  const transcriptWords = countWords(transcript);
  if (transcriptWords < MIN_TRANSCRIPT_WORDS) {
    clearTimeout(timeout);
    await refundQuota(userId, quota);
    await cleanupRecording(audioPath);
    return res.status(422).json({
      error:
        "We couldn't hear enough speech to score — please record again and speak for longer.",
    });
  }

  // --- 6. SCORE the transcript ---------------------------------------------
  const passageId = passage.id;
  const contextText = passage.contextText;

  let scoringCompleted = false;
  try {
    const userContent = `IELTS SPEAKING — PART ${part}

WHAT THE CANDIDATE WAS ASKED:
${contextText}

CANDIDATE'S SPOKEN ANSWER (auto-transcribed, ${transcriptWords} words):
"""
${transcript}
"""

Assess this transcript as an IELTS Speaking examiner on the three transcript-assessable criteria and return the structured JSON.`;

    const ai = await chatCompletionWithFallback({
      model: scoringModel,
      fallbackModel: PAID_MODEL,
      signal: controller.signal,
      messages: [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: userContent },
      ],
      responseFormat: {
        type: 'json_schema',
        json_schema: buildSpeakingScoreSchema(),
      },
    });

    if (!ai.ok) {
      console.error('OpenAI error', ai.status, (ai.detail || '').slice(0, 500));
      await refundQuota(userId, quota);
      return res.status(502).json({
        error: 'The scoring service could not process your response. Please try again.',
      });
    }

    const payload = ai.payload;
    await recordAiUsage(
      getAdmin(),
      chatUsageRow({
        userId,
        skill: 'speaking',
        feature: 'speaking_score',
        operation: 'rubric_score',
        model: ai.model,
        payload,
        metadata: { part },
      })
    );
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) {
      console.error('OpenAI returned no content', JSON.stringify(payload).slice(0, 500));
      await refundQuota(userId, quota);
      return res.status(502).json({
        error: 'The scoring service returned an empty result. Please try again.',
      });
    }

    let result;
    try {
      result = JSON.parse(content);
    } catch (e) {
      console.error('Failed to parse OpenAI JSON:', e.message);
      await refundQuota(userId, quota);
      return res.status(502).json({
        error: 'The scoring service returned an invalid result. Please try again.',
      });
    }

    const c = result.criteria || {};
    const fc = c.fluencyCoherence || {};
    const lr = c.lexicalResource || {};
    const gr = c.grammaticalRange || {};
    if (
      !isValidSpeakingBand(fc.band) ||
      !isValidSpeakingBand(lr.band) ||
      !isValidSpeakingBand(gr.band)
    ) {
      console.error('OpenAI returned invalid bands', JSON.stringify(c).slice(0, 300));
      await refundQuota(userId, quota);
      return res.status(502).json({
        error: 'The scoring service returned an invalid result. Please try again.',
      });
    }

    // Compute the overall server-side (never trust the model's arithmetic):
    // average of the three, rounded to nearest 0.5.
    const overallBand = roundHalfBand(fc.band, lr.band, gr.band);

    const criteria = {
      fluencyCoherence: { band: fc.band, feedback: fc.feedback || '' },
      lexicalResource: { band: lr.band, feedback: lr.feedback || '' },
      grammaticalRange: { band: gr.band, feedback: gr.feedback || '' },
    };

    // --- 7. Persist (mirrors writing). Never blocks the response. ----------
    await saveSpeakingScore({
      userId,
      passageId,
      part,
      audioPath,
      transcript,
      overallBand,
      criteria,
      model: ai.model,
      startedAt: typeof body.started_at === 'string' ? body.started_at : null,
    });

    // --- 8. Respond with the exact contract shape --------------------------
    // Free sample: the full result is persisted above for the user's own
    // history, but the RESPONSE carries only the overall band + first
    // criterion (mirrors writing's reduceForFree) — the paid content is
    // withheld server-side, not hidden client-side.
    scoringCompleted = true;
    const isFreeScore = quota.free === true;
    return res.status(200).json({
      overallBand,
      criteria: isFreeScore
        ? { fluencyCoherence: criteria.fluencyCoherence }
        : criteria,
      ...(isFreeScore ? { lockedCriteriaCount: 2 } : {}),
      pronunciation: { assessed: false, note: PRONUNCIATION_NOTE },
      summary: isFreeScore ? '' : typeof result.summary === 'string' ? result.summary : '',
      improvements: isFreeScore
        ? []
        : Array.isArray(result.improvements)
          ? result.improvements
          : [],
      transcript,
      quotaRemaining: quota.remaining,
      free: isFreeScore,
    });
  } catch (e) {
    await refundQuota(userId, quota);
    if (e.name === 'AbortError') {
      console.error('OpenAI request timed out');
      return res.status(502).json({ error: 'Scoring took too long. Please try again.' });
    }
    console.error('Scoring failed:', e.message);
    return res.status(502).json({
      error: 'Scoring is temporarily unavailable. Please try again later.',
    });
  } finally {
    clearTimeout(timeout);
    // Always remove a successfully consumed recording. Fresh failures also
    // clean immediately; explicitly resumed saved recordings survive only a
    // retryable scoring failure and remain bounded by the cleanup cron.
    if (scoringCompleted || !resumeSaved) await cleanupRecording(audioPath);
  }
}
