// pages/api/score/speaking-realtime.js
// Premium post-interview assessment: signed candidate audio uses Realtime 2.1
// and all four criteria; legacy transcripts retain the three-criterion scorer.
// Session minutes are reserved at mint time; idempotent scoring retries do not
// consume another reservation. Raw audio never passes through this request.
export const config = { runtime: 'nodejs' };
export const maxDuration = 180;

import { verifyAssessmentTicket } from '../../../lib/realtimeAssessmentTicket';
import { loadAssessmentAudio, scoreRecordedInterview } from '../../../lib/realtimeAudioScorer';
import { realtimeUsageRow } from '../../../lib/realtimeCost';
import { AUDIO_ASSESSMENT_MODEL } from '../../../lib/speakingAudioAssessment';
import { createClient } from '@supabase/supabase-js';
import { clientIp, originAllowed } from '../../../lib/apiSecurity';
import { chatUsageRow, recordAiUsage } from '../../../lib/aiCost';
import { roundBandMean } from '../../../lib/bandTables';
import { fetchPremiumStatus } from '../../../lib/premium';
import { MODES } from '../../../lib/realtimeExaminer';
import { buildSpeakingRealtimeScoreSchema } from '../../../lib/speakingRealtimeScoreSchema';
import { isValidSpeakingBand } from '../../../lib/speakingScoreSchema';

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';
const SCORING_MODEL =
  process.env.SCORING_MODEL_PAID || process.env.OPENAI_SPEAKING_MODEL || 'gpt-5.1';
const OPENAI_TIMEOUT_MS = 60000;
const MIN_CANDIDATE_WORDS = 40;
const MAX_TRANSCRIPT_CHARS = 60000;
const PER_IP_WINDOW_SECONDS = 3600;
const PER_IP_MAX = 8;
const GLOBAL_WINDOW_SECONDS = 86400;
const GLOBAL_MAX = 300;
const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

async function resolveUserId(req) {
  const authz = req.headers.authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(authz).trim());
  if (!match) return { userId: null, error: null };
  try {
    const { data, error } = await getAdmin().auth.getUser(match[1].trim());
    return {
      userId: error ? null : data?.user?.id || null,
      error: null,
    };
  } catch (error) {
    return { userId: null, error };
  }
}

function countWords(s) {
  return String(s || '').trim().split(/\s+/).filter(Boolean).length;
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

function buildSystemPrompt() {
  return `You are an AI IELTS Speaking practice assessor, not an official or certified examiner. You mark strictly and consistently against the official IELTS Speaking public band descriptors. Marking is fair and evidence-based: for every judgement you cite concrete evidence quoted or paraphrased from the candidate's transcribed answers.

You are given the FULL TRANSCRIPT of a live practice speaking interview between an AI examiner and a candidate. The EXAMINER turns are context only — assess ONLY the CANDIDATE's language. Assess ONLY the THREE criteria a transcript can support, each on the 0-9 band scale (halves allowed):

1. Fluency and Coherence — ability to talk at length coherently across the interview: connected ideas, logical sequencing and topic development, cohesive devices and discourse markers, self-correction/hesitation markers where visible, and responsiveness to the examiner's questions. Do NOT penalise natural spoken features.
2. Lexical Resource — range and precision of vocabulary across topics, paraphrase, less common and idiomatic items, collocation, appropriacy.
3. Grammatical Range and Accuracy — range of structures, proportion of error-free clauses, communicative effect of errors.

You do NOT assess Pronunciation — it cannot be judged from a transcript. Do not mention a pronunciation band.

EVIDENCE: base every band on what is actually present across ALL candidate turns. Very short answers throughout cannot score highly — say so. Treat ASR artefacts charitably (do not penalise a plausible mishearing unless the transcript clearly shows a candidate error).

OVERALL BAND RULE: overallBand = the average of the THREE criterion bands, rounded to the NEAREST 0.5. Compute it exactly; do not eyeball it.

FEEDBACK STYLE: specific, constructive and SCANNABLE. For each criterion give 1-3 "strengths" bullets and 1-3 "improvements" bullets. Each bullet is ONE short sentence (under 20 words), states one concrete observation, and quotes a brief candidate phrase as evidence where useful. NO long paragraphs. The top-level "improvements" list holds the 3-5 highest-impact practice actions across all criteria.

Return ONLY the structured JSON object requested — no prose, no markdown, no HTML.`;
}

async function rollbackRealtimeAttempt(admin, attemptId) {
  try {
    const { error } = await admin.from('attempts').delete().eq('id', attemptId);
    if (error) throw error;
  } catch (error) {
    console.error('realtime attempt rollback failed:', error.message);
  }
}

async function failRealtimeScoreClaim(claim) {
  if (!claim) return true;
  try {
    const { data, error } = await getAdmin().rpc('fail_realtime_score_request', {
      p_request_id: claim.requestId,
      p_user_id: claim.userId,
      p_lease_id: claim.leaseId,
    });
    if (error || data !== true) {
      console.error('realtime score claim release failed:', error?.message || 'lease mismatch');
      return false;
    }
    return true;
  } catch (error) {
    console.error('realtime score claim release failed:', error.message);
    return false;
  }
}

async function completeRealtimeScoreClaim(claim, result) {
  if (!claim) return true;
  // A lost RPC response is ambiguous, so retry the idempotent completion once.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const { data, error } = await getAdmin().rpc('complete_realtime_score_request', {
        p_request_id: claim.requestId,
        p_user_id: claim.userId,
        p_lease_id: claim.leaseId,
        p_result: result,
      });
      if (!error && data === true) return true;
      if (error) console.error('realtime score claim completion failed:', error.message);
    } catch (error) {
      console.error('realtime score claim completion failed:', error.message);
    }
  }
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (!originAllowed(req)) return res.status(403).json({ error: 'Forbidden' });

  const { userId, error: authError } = await resolveUserId(req);
  if (authError) {
    console.error('realtime scoring auth failed:', authError.message);
    return res.status(503).json({ error: 'Scoring is temporarily unavailable.' });
  }
  if (!userId) return res.status(401).json({ error: 'Please sign in.' });

  const premium = await fetchPremiumStatus(getAdmin(), userId);
  if (premium.error) {
    console.error('realtime scoring entitlement failed:', premium.error.message);
    return res.status(503).json({ error: 'Scoring is temporarily unavailable.' });
  }
  if (!premium.isPremium) {
    return res.status(402).json({
      error: 'The live AI examiner is a Premium feature.',
      reason: 'not_premium',
    });
  }

  // --- Validate transcript before mutating rate-limit counters -------------
  const body = req.body || {};
  const requestId = body.requestId == null ? null : body.requestId;
  if (requestId != null && (typeof requestId !== 'string' || !REQUEST_ID_RE.test(requestId))) {
    return res.status(400).json({ error: 'Invalid scoring request reference.' });
  }
  const mode = typeof body.mode === 'string' ? body.mode : 'mock';
  if (!MODES[mode]) {
    return res.status(400).json({ error: 'Unknown session mode.' });
  }
  const audioRequested = body.audioAssessment != null;
  let audioClaims = null;
  if (audioRequested) {
    audioClaims = verifyAssessmentTicket(body.audioAssessment?.ticket, { userId, mode, requestId });
    if (!audioClaims || !Number.isInteger(body.audioAssessment?.count)
      || body.audioAssessment.count < 1 || body.audioAssessment.count > 2) {
      return res.status(400).json({ error: 'Invalid or expired audio assessment reference.' });
    }
  }
  const transcript = Array.isArray(body.transcript) ? body.transcript : [];
  const turns = transcript
    .filter(
      (t) =>
        t &&
        (t.role === 'examiner' || t.role === 'candidate') &&
        typeof t.text === 'string' &&
        t.text.trim()
    )
    .map((t) => ({ role: t.role, text: t.text.trim() }));

  const transcriptChars = turns.reduce((total, turn) => total + turn.text.length, 0);
  if (transcriptChars > MAX_TRANSCRIPT_CHARS) {
    return res.status(413).json({ error: 'This interview transcript is too long to score.' });
  }

  const candidateWords = turns
    .filter((t) => t.role === 'candidate')
    .reduce((n, t) => n + countWords(t.text), 0);
  if (!audioRequested && candidateWords < MIN_CANDIDATE_WORDS) {
    return res.status(422).json({
      error:
        'There is not enough of your speech in this session to score fairly. Try a longer conversation with the examiner.',
    });
  }

  let scoreClaim = null;
  if (requestId) {
    try {
      const { data, error } = await getAdmin().rpc('claim_realtime_score_request', {
        p_request_id: requestId,
        p_user_id: userId,
        p_mode: mode,
        p_transcript: audioRequested
          ? [...turns, { role: 'examiner', text: `[assessment:audio-v1;parts:${body.audioAssessment.count}]` }]
          : turns,
      });
      const claimed = Array.isArray(data) ? data[0] : data;
      if (error || !claimed?.action) {
        console.error('realtime score claim failed:', error?.message || 'empty claim');
        return res.status(503).json({ error: 'Scoring is temporarily unavailable.' });
      }
      if (claimed.action === 'replay') {
        if (!claimed.replay_result || typeof claimed.replay_result !== 'object') {
          console.error('realtime score replay was empty');
          return res.status(503).json({ error: 'Scoring is temporarily unavailable.' });
        }
        return res.status(200).json(claimed.replay_result);
      }
      if (claimed.action === 'busy') {
        return res.status(202).json({
          error: 'This interview is still being scored. Wait a moment and retry.',
        });
      }
      if (claimed.action === 'conflict') {
        return res.status(409).json({ error: 'This scoring request does not match the saved interview.' });
      }
      if (claimed.action !== 'claimed' || !claimed.claim_lease_id) {
        console.error('realtime score claim returned an unknown action:', claimed.action);
        return res.status(503).json({ error: 'Scoring is temporarily unavailable.' });
      }
      scoreClaim = {
        requestId,
        userId,
        leaseId: claimed.claim_lease_id,
      };
    } catch (error) {
      console.error('realtime score claim failed:', error.message);
      return res.status(503).json({ error: 'Scoring is temporarily unavailable.' });
    }
  }

  const failAndRespond = async (status, payload) => {
    await failRealtimeScoreClaim(scoreClaim);
    return res.status(status).json(payload);
  };

  // Reject an already-capped caller before incrementing the shared daily
  // circuit breaker; check_rate_limit mutates its counter on every invocation.
  const ipLimit = await checkLimit(
    'realtime-score-ip',
    clientIp(req),
    PER_IP_WINDOW_SECONDS,
    PER_IP_MAX
  );
  if (ipLimit.error || !ipLimit.allowed) {
    if (ipLimit.error) {
      console.error('check_rate_limit error:', ipLimit.error.message);
      return failAndRespond(503, { error: 'Scoring is temporarily unavailable.' });
    }
    return failAndRespond(429, { error: 'Too many scoring requests. Please wait a while.' });
  }

  const dayKey = new Date().toISOString().slice(0, 10);
  const globalLimit = await checkLimit(
    'realtime-score-global',
    dayKey,
    GLOBAL_WINDOW_SECONDS,
    GLOBAL_MAX
  );
  if (globalLimit.error || !globalLimit.allowed) {
    if (globalLimit.error) {
      console.error('global check_rate_limit error:', globalLimit.error.message);
    }
    return failAndRespond(503, { error: 'Scoring is temporarily unavailable.' });
  }

  const rendered = turns
    .map((t) => `${t.role === 'examiner' ? 'EXAMINER' : 'CANDIDATE'}: ${t.text}`)
    .join('\n')
    .slice(0, MAX_TRANSCRIPT_CHARS);

  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set');
    return failAndRespond(502, { error: 'Scoring is temporarily unavailable.' });
  }

  // --- Score ---------------------------------------------------------------
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  let result;
  if (audioRequested) {
    clearTimeout(timeout);
    try {
      const audio = await loadAssessmentAudio({ userId, requestId, count: body.audioAssessment.count, maxSeconds: audioClaims.durationSeconds });
      const scored = await scoreRecordedInterview({ ...audio, mode, transcript: rendered,
        onResponse: response => recordAiUsage(getAdmin(), realtimeUsageRow({ userId, response, durationSeconds: audio.durationSeconds, mode })),
      });
      result = scored.result;

    } catch (error) {
      console.error('audio assessment failed:', error.message);
      return failAndRespond(502, { error: 'Audio assessment could not finish. Your recording is saved; retry this interview.' });
    }
  } else try {
    const r = await fetch(OPENAI_CHAT_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: SCORING_MODEL,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          {
            role: 'user',
            content: `Session type: ${mode}. Full interview transcript:\n\n${rendered}`,
          },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: buildSpeakingRealtimeScoreSchema(),
        },
      }),
    });
    const payload = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('scoring call failed:', r.status, payload?.error?.message);
      return failAndRespond(502, { error: 'Scoring failed. Please try again.' });
    }
    await recordAiUsage(
      getAdmin(),
      chatUsageRow({
        userId,
        skill: 'speaking',
        feature: 'speaking_realtime_score',
        operation: 'rubric_score',
        model: SCORING_MODEL,
        payload,
        metadata: { mode },
      })
    );
    result = JSON.parse(payload.choices?.[0]?.message?.content || '{}');
  } catch (e) {
    console.error('scoring error:', e.message);
    return failAndRespond(502, { error: 'Scoring failed. Please try again.' });
  } finally {
    clearTimeout(timeout);
  }

  const criteria = result?.criteria || {};
  const fluency = criteria.fluencyCoherence?.band;
  const lexical = criteria.lexicalResource?.band;
  const grammar = criteria.grammaticalRange?.band;
  if (!audioRequested && (
    !isValidSpeakingBand(fluency) ||
    !isValidSpeakingBand(lexical) ||
    !isValidSpeakingBand(grammar)
  )) {
    console.error(
      'realtime scoring returned invalid bands:',
      JSON.stringify(criteria).slice(0, 500)
    );
    return failAndRespond(502, { error: 'Scoring failed. Please try again.' });
  }
  const overallBand = audioRequested ? result.overallBand : roundBandMean((fluency + lexical + grammar) / 3);
  result = { ...result, overallBand };

  // --- Persist (fail-soft) -------------------------------------------------
  let persistenceAdmin;
  let attemptId;
  try {
    persistenceAdmin = getAdmin();
    const { data: attempt, error: attemptErr } = await persistenceAdmin
      .from('attempts')
      .insert({
        user_id: userId,
        skill: 'speaking',
        responses: {
          realtime: true,
          assessmentBasis: audioRequested ? 'candidate_audio' : 'transcript',
          ...(audioRequested ? { audioEvidence: result.audioEvidence, limitations: result.limitations, confidence: result.confidence } : {}),
          mode,
          transcript: turns,
          ...(requestId ? { realtime_request_id: requestId } : {}),
        },
        band: overallBand,
        submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single();
    if (!attemptErr && attempt) {
      attemptId = attempt.id;
      const { error: scoreErr } = await persistenceAdmin.from('scores').insert({
        attempt_id: attempt.id,
        user_id: userId,
        skill: 'speaking',
        overall_band: overallBand,
        criteria: result.criteria || {},
        model: audioRequested ? AUDIO_ASSESSMENT_MODEL : SCORING_MODEL,
      });
      if (scoreErr) {
        console.error('realtime score insert failed:', scoreErr.message);
        await rollbackRealtimeAttempt(persistenceAdmin, attemptId);
      }
    } else if (attemptErr) {
      console.error('realtime attempt insert failed:', attemptErr.message);
    }
  } catch (e) {
    console.error('realtime score persist failed:', e.message);
    if (persistenceAdmin && attemptId) {
      await rollbackRealtimeAttempt(persistenceAdmin, attemptId);
    }
  }

  const responseBody = { mode, candidateWords, ...result };
  if (!(await completeRealtimeScoreClaim(scoreClaim, responseBody))) {
    return res.status(503).json({
      error: 'Your score finished but confirmation is delayed. Retry this saved interview.',
    });
  }
  // Delete only after the idempotent result is durably confirmed. Retryable
  // failures retain owner-only audio; the existing cleanup cron is the backstop.
  if (audioRequested) {
    try {
      const { error } = await getAdmin().storage.from('speaking-uploads').remove(
        Array.from({ length: body.audioAssessment.count }, (_, i) => `${userId}/${requestId}/audio-${i}.wav`)
      );
      if (error) throw error;
    } catch (error) { console.error('assessment audio cleanup failed:', error.message); }
  }
  return res.status(200).json(responseBody);
}
