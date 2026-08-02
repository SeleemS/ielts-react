// pages/api/score/writing.js
// Server-side IELTS Writing scoring. Replaces the old unauthenticated AWS API
// Gateway GPT endpoint that the browser called directly. This route:
//   * runs only on the server (needs the secret OPENAI_API_KEY),
//   * REQUIRES sign-in; free users receive one lifetime Writing sample while
//     Premium users use the daily fair-use meter in consume_ai_score,
//   * rate-limits per client IP AND enforces a daily global circuit breaker via
//     the Supabase check_rate_limit() RPC (service role),
//   * checks Origin/Referer against an allow-list,
//   * validates the essay length,
//   * calls OpenAI with Structured Outputs (strict JSON schema) so the client
//     receives per-criterion band scores it can render as plain React text
//     (no HTML, so the XSS vector is gone).
//
// pages/api/* run on the Node.js runtime by default, which is what we need.
export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { clientIp, originAllowed } from '../../../lib/apiSecurity';
import { chatUsageRow, recordAiUsage } from '../../../lib/aiCost';
import { overallBand as calculateOverallBand } from '../../../lib/bandTables';
import { chatCompletionWithFallback } from '../../../lib/openaiChat';
import { WRITING_PROMPT_MAX_CHARS } from '../../../lib/writingLimits';
import { buildWritingScoreSchema } from '../../../lib/writingScoreSchema';
import { WRITING_CALIBRATION } from '../../../lib/writingCalibration';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const FREE_MODEL = process.env.SCORING_MODEL_FREE || 'gpt-4.1-mini';
const PAID_MODEL = process.env.SCORING_MODEL_PAID || process.env.OPENAI_WRITING_MODEL || 'gpt-5.1';

const MIN_WORDS = 50; // below this it is not scorable
const MAX_WORDS = 4000;
const MAX_CHARS = 25000;

const PER_IP_WINDOW_SECONDS = 3600; // 1 hour
const PER_IP_MAX = 8; // 8 scorings / hour / IP
const GLOBAL_WINDOW_SECONDS = 86400; // 1 day
const GLOBAL_MAX = 500; // hard daily ceiling across all users (cost circuit breaker)

const OPENAI_TIMEOUT_MS = 45000;

function quotaLimitMessage(quota) {
  const period = quota?.limitPeriod || 'day';
  const limit = quota?.limit || (period === 'day' ? 2 : null);
  const label = limit ? `${limit} Writing scores per ${period}` : `${period}ly Writing scores`;
  return `You have reached your fair-use limit of ${label}.`;
}

// ---------------------------------------------------------------------------
// Supabase service-role client (server-only; bypasses RLS for rate_limits)
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

// A limiter denial and a limiter outage require different responses. Both
// checks fail closed on infrastructure errors so scoring cannot bypass cost
// controls, while verified exhaustion retains its normal 429 response.
async function checkLimit(bucket, identifier, windowSeconds, max) {
  try {
    const { data, error } = await getAdmin().rpc('check_rate_limit', {
      p_bucket: bucket,
      p_identifier: identifier,
      p_window_seconds: windowSeconds,
      p_max: max,
    });
    if (error) {
      console.error('check_rate_limit error:', error.message);
      return { allowed: false, error: true };
    }
    return { allowed: data === true, error: false };
  } catch (error) {
    console.error('check_rate_limit failed:', error.message);
    return { allowed: false, error: true };
  }
}

async function consumeQuota(userId) {
  const { data, error } = await getAdmin().rpc('consume_ai_score', {
    p_uid: userId,
    p_skill: 'writing',
  });
  if (error) throw error;
  return data;
}

async function refundQuota(userId, quota) {
  if (!quota?.allowed || !quota?.consumedAt) return;
  try {
    const { error } = await getAdmin().rpc('refund_ai_score', {
      p_uid: userId,
      p_skill: 'writing',
      p_free: quota.free === true,
      p_consumed_at: quota.consumedAt,
      p_referral: quota.referral === true,
    });
    if (error) throw error;
  } catch (error) {
    // The scoring request still fails closed. Provider/API retries are safe,
    // and the error is surfaced to operations without leaking learner data.
    console.error('quota refund failed:', error.message);
  }
}

// ---------------------------------------------------------------------------
// REQUIRED auth: the free sample is an account reward. A null here is
// a 401 upstream.
// ---------------------------------------------------------------------------
async function resolveUserId(req) {
  const authz = req.headers.authorization || req.headers.Authorization || '';
  const match = /^Bearer\s+(.+)$/i.exec(String(authz).trim());
  if (!match) return null;
  const token = match[1].trim();
  if (!token) return null;
  const { data, error } = await getAdmin().auth.getUser(token);
  if (error || !data || !data.user) return null;
  // Supabase anonymous-auth tokens are valid JWTs, but the lifetime sample
  // is specifically the reward for linking an email/OAuth account.
  if (data.user.is_anonymous === true || !data.user.email) return null;
  return data.user.id;
}

// Persist a completed writing score for a signed-in user. Because scores.attempt_id
// is NOT NULL (0004) and scores are service-role-write only (0005), we insert an
// `attempts` row first (skill='writing') then the `scores` row referencing it,
// both via the service-role client (bypasses RLS). Fully fail-soft: a DB error
// is logged (message only, never keys) and never affects the scoring response.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function saveWritingScore({ userId, passageId, task, essay, model, result, startedAt, anonId, wordCount }) {
  let admin;
  let attemptId;
  try {
    admin = getAdmin();
    const overall = typeof result.overallBand === 'number' ? result.overallBand : null;

    const { data: attempt, error: attemptErr } = await admin
      .from('attempts')
      .insert({
        user_id: userId,
        passage_id: passageId || null,
        skill: 'writing',
        responses: { essay, task },
        band: overall,
        started_at: startedAt || null,
        submitted_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (attemptErr || !attempt) {
      console.error('writing attempt insert failed:', attemptErr?.message || 'no row');
      return;
    }
    attemptId = attempt.id;

    const { error: scoreErr } = await admin.from('scores').insert({
      attempt_id: attempt.id,
      user_id: userId,
      skill: 'writing',
      overall_band: overall,
      criteria: result.criteria || {},
      model,
    });
    if (scoreErr) {
      console.error('writing score insert failed:', scoreErr.message);
      await rollbackWritingAttempt(admin, attemptId);
      return;
    }

    if (UUID_RE.test(anonId || '')) {
      await admin.from('activity_events').insert({
        anon_id: anonId,
        user_id: userId,
        event: 'writing_score_server',
        skill: 'writing',
        props: { task, word_count: wordCount, band: overall, model },
      });
    }
  } catch (e) {
    console.error('saveWritingScore error:', e.message);
    if (admin && attemptId) await rollbackWritingAttempt(admin, attemptId);
  }

}

async function rollbackWritingAttempt(admin, attemptId) {
  try {
    const { error } = await admin.from('attempts').delete().eq('id', attemptId);
    if (error) throw error;
  } catch (error) {
    console.error('writing attempt rollback failed:', error.message);
  }
}

function countWords(str) {
  return str.split(/\s+/).filter(Boolean).length;
}

// Total actionable issues across the full report — sent as a bare NUMBER to free
// users so the upgrade CTA can say "N fixable issues" without shipping the
// underlying (paid) feedback text.
function countWritingIssues(result) {
  const criterionIssues = Object.values(result.criteria || {}).reduce(
    (n, c) => n + (Array.isArray(c?.improvements) ? c.improvements.length : 0),
    0
  );
  return (
    criterionIssues +
    (Array.isArray(result.improvements) ? result.improvements.length : 0) +
    (Array.isArray(result.correctedExamples) ? result.correctedExamples.length : 0)
  );
}

// Free users are entitled to the overall band + the FIRST criterion only.
// Everything else is a Premium entitlement, so it must be withheld at the API —
// blurring it client-side still ships the text in the response (paywall bypass).
// The full result is still persisted server-side for the user's own history.
function reduceForFree(result, task) {
  const firstKey = task === 1 ? 'taskAchievement' : 'taskResponse';
  return {
    overallBand: result.overallBand,
    criteria: { [firstKey]: result.criteria?.[firstKey] || {} },
    lockedIssueCount: countWritingIssues(result),
  };
}

// ---------------------------------------------------------------------------
// Examiner rubric (system prompt). The shared WRITING_CALIBRATION block
// (lib/writingCalibration.js) is appended below and also feeds the Band
// Estimator's short-sample scorer, so the two calibrations never drift apart.
// ---------------------------------------------------------------------------
function buildSystemPrompt(task) {
  const isTask1 = task === 1;
  const firstCriterion = isTask1 ? 'Task Achievement' : 'Task Response';
  const taskRules = isTask1
    ? `TASK 1 (Academic report): The candidate must summarise, describe or report visual/factual information (a graph, chart, table, map or process) in AT LEAST 150 words. There is NO personal opinion. "Task Achievement" rewards: covering the requirement fully, presenting a clear overview of main trends/stages, accurately highlighting key features, and supporting them with correctly selected data. Penalise no overview, inaccurate data, irrelevant detail, or bullet-point/incomplete responses.`
    : `TASK 2 (Essay): The candidate must write an argumentative/discursive essay of AT LEAST 250 words responding to a point of view, argument or problem. "Task Response" rewards: fully addressing all parts of the prompt, a clear well-developed position throughout, and relevant, extended, well-supported ideas. Penalise partial coverage, an unclear or wavering position, over-generalisation, or unsupported ideas.`;

  return `You are a certified, experienced IELTS Writing examiner. You mark strictly and consistently against the official IELTS public band descriptors. Marking is fair and evidence-based: for every judgement you cite concrete evidence quoted or paraphrased from the candidate's essay.

You assess FOUR equally-weighted criteria, each on the 0-9 band scale (halves allowed, e.g. 6.5):

1. ${firstCriterion}
2. Coherence and Cohesion
3. Lexical Resource
4. Grammatical Range and Accuracy

WHAT THE BANDS MEAN (apply the real descriptors):
- Band 9: fully operational command; fully satisfies all requirements; cohesion is effortless/unobtrusive; wide natural vocabulary with very rare slips; a wide range of structures with full flexibility and accuracy, errors extremely rare.
- Band 8: fully addresses the task with well-developed ideas; sequences information logically with well-managed cohesion; fluent and flexible vocabulary including less common items; a wide range of structures, the majority error-free, only occasional errors.
- Band 7: addresses the task with a clear position/purpose and extended ideas (may over-generalise); logically organises with a range of cohesive devices (some over/under-use); flexible vocabulary with some awareness of style/collocation and occasional errors; a variety of complex structures with frequent error-free sentences, good but not perfect control.
- Band 6: addresses the task though some parts may be inadequately covered; arranges information coherently with generally effective but sometimes faulty/mechanical cohesion; adequate vocabulary with some imprecision; a mix of simple and complex forms where errors seldom impede communication.
- Band 5: partially addresses the task, position may be unclear, ideas limited/not fully developed or partly irrelevant; some organisation but cohesion is inadequate/mechanical/inaccurate; limited vocabulary with noticeable errors that may cause difficulty; limited range of structures with frequent grammar/punctuation errors that can cause some difficulty.
- Band 4: responds only minimally / format may be inappropriate / tends to be off-topic; information not arranged coherently, no clear progression; very limited vocabulary and control causing strain; very limited structures with frequent errors and faulty punctuation.
- Below 4: barely addresses the task; little logical organisation; extremely limited vocabulary; cannot use sentence forms except memorised phrases — communication largely fails.

TASK-SPECIFIC REQUIREMENTS:
${taskRules}

UNDER-LENGTH PENALTY: If the response is below the required minimum (150 words for Task 1, 250 for Task 2), penalise ${firstCriterion} (the task is not fully completed), and note it explicitly. Very short responses (a few sentences) cannot score above band 4-5 on ${firstCriterion}.

OVERALL BAND RULE: overallBand = the average of the four criterion bands, rounded to the NEAREST 0.5 (a .25 rounds up to .5, a .75 rounds up to the next whole). Compute it exactly this way; do not eyeball it.

FEEDBACK STYLE: Be specific, constructive and SCANNABLE. For each criterion give 1-3 "strengths" bullets and 1-3 "improvements" bullets. Each bullet is ONE short sentence (under 20 words), states one concrete observation, and quotes or paraphrases a brief phrase from the essay as evidence where useful. NO long paragraphs. The top-level "improvements" list holds the 3-5 highest-impact actions across all criteria. correctedExamples must take real problematic sentences/phrases from the essay ("original") and give an improved version ("suggestion").

Return ONLY the structured JSON object requested — no prose, no markdown, no HTML.

${WRITING_CALIBRATION}`;
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

  let userId;
  try {
    userId = await resolveUserId(req);
  } catch (error) {
    console.error('writing auth check failed:', error.message);
    return res
      .status(503)
      .json({ error: 'Scoring is temporarily unavailable. Please try again later.' });
  }
  if (!userId) {
    return res.status(401).json({ error: 'Please sign in to get your writing scored.' });
  }

  // --- Validate body -------------------------------------------------------
  const body = req.body || {};
  const anonId =
    typeof body.anon_id === 'string' && UUID_RE.test(body.anon_id) ? body.anon_id : null;
  const essay = typeof body.essay === 'string' ? body.essay.trim() : '';
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim() : '';
  const task = body.task === 1 || body.task === '1' ? 1 : 2;
  const passageId = typeof body.passage_id === 'string' && body.passage_id ? body.passage_id : null;

  if (!essay) {
    return res.status(400).json({ error: 'No essay was provided.' });
  }
  if (essay.length > MAX_CHARS) {
    return res
      .status(400)
      .json({ error: 'Your response is too long to score.' });
  }
  if (prompt.length > WRITING_PROMPT_MAX_CHARS) {
    return res
      .status(400)
      .json({ error: 'The task prompt is too long to score.' });
  }
  const words = countWords(essay);
  if (words < MIN_WORDS) {
    return res.status(400).json({
      error: `Your response is too short to score (${words} words). Write a full answer and try again.`,
    });
  }
  if (words > MAX_WORDS) {
    return res
      .status(400)
      .json({ error: 'Your response is too long to score.' });
  }

  // --- Abuse protection BEFORE calling OpenAI ------------------------------
  try {
    const ip = clientIp(req);

    // Check the caller-specific bucket first. The RPC increments atomically, so
    // a request already blocked here must never consume shared daily capacity.
    const ipLimit = await checkLimit(
      'writing-score',
      ip,
      PER_IP_WINDOW_SECONDS,
      PER_IP_MAX
    );
    if (ipLimit.error) {
      return res
        .status(503)
        .json({ error: 'Scoring is temporarily unavailable. Please try again later.' });
    }
    if (!ipLimit.allowed) {
      return res.status(429).json({
        error: `You have reached the limit of ${PER_IP_MAX} scorings per hour. Please try again later.`,
      });
    }

    const dayKey = new Date().toISOString().slice(0, 10);
    const globalLimit = await checkLimit(
      'writing-score-global',
      dayKey,
      GLOBAL_WINDOW_SECONDS,
      GLOBAL_MAX
    );
    if (globalLimit.error) {
      return res
        .status(503)
        .json({ error: 'Scoring is temporarily unavailable. Please try again later.' });
    }
    if (!globalLimit.allowed) {
      return res.status(429).json({
        error:
          'AI scoring is temporarily unavailable due to high demand. Please try again later.',
      });
    }
  } catch (e) {
    // Rate-limit infra misconfigured: fail closed to protect spend.
    console.error('rate-limit check failed:', e.message);
    return res
      .status(503)
      .json({ error: 'Scoring is temporarily unavailable. Please try again later.' });
  }

  let quota = null;
  try {
    quota = await consumeQuota(userId);
  } catch (error) {
    console.error('quota check failed:', error.message);
    return res.status(503).json({ error: 'Scoring is temporarily unavailable. Please try again later.' });
  }
  if (!quota?.allowed) {
    return res.status(402).json({
      error:
        quota?.reason === 'premium_required'
          ? 'AI Writing scoring is a Premium feature. Upgrade to get your essay scored.'
          : quotaLimitMessage(quota),
      remaining: 0,
      reason: quota?.reason || 'quota_exceeded',
      resetsAt: quota?.resetsAt || null,
    });
  }
  const isFreeScore = quota.free === true;
  const scoringModel = isFreeScore ? FREE_MODEL : PAID_MODEL;

  // --- Call OpenAI ---------------------------------------------------------
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set');
    await refundQuota(userId, quota);
    return res
      .status(502)
      .json({ error: 'Scoring is temporarily unavailable. Please try again later.' });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

  try {
    const userContent = `TASK TYPE: Writing Task ${task}

PROMPT / QUESTION:
${prompt || '(prompt not supplied)'}

CANDIDATE'S ESSAY (${words} words):
"""
${essay}
"""

Assess this essay as an IELTS examiner and return the structured JSON.`;

    const ai = await chatCompletionWithFallback({
      model: scoringModel,
      fallbackModel: scoringModel,
      signal: controller.signal,
      messages: [
        { role: 'system', content: buildSystemPrompt(task) },
        { role: 'user', content: userContent },
      ],
      responseFormat: {
        type: 'json_schema',
        json_schema: buildWritingScoreSchema(task),
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
        skill: 'writing',
        feature: 'writing_score',
        operation: 'rubric_score',
        model: ai.model,
        payload,
        metadata: { task, free_sample: isFreeScore },
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

    const criteria = result?.criteria || {};
    const firstCriterion =
      task === 1 ? criteria.taskAchievement : criteria.taskResponse;
    const overallBand = calculateOverallBand([
      firstCriterion?.band,
      criteria.coherenceCohesion?.band,
      criteria.lexicalResource?.band,
      criteria.grammaticalRange?.band,
    ]);
    if (overallBand === null) {
      console.error(
        'OpenAI returned invalid Writing bands',
        JSON.stringify(criteria).slice(0, 500)
      );
      await refundQuota(userId, quota);
      return res.status(502).json({
        error: 'The scoring service returned an invalid result. Please try again.',
      });
    }
    result = { ...result, overallBand };

    await saveWritingScore({
      userId,
      passageId,
      task,
      essay,
      model: ai.model,
      result,
      startedAt: typeof req.body?.started_at === 'string' ? req.body.started_at : null,
      anonId,
      wordCount: words,
    });

    return res.status(200).json({
      task,
      wordCount: words,
      quotaRemaining: quota.remaining,
      plan: quota.plan,
      free: isFreeScore,
      ...(isFreeScore ? reduceForFree(result, task) : result),
    });
  } catch (e) {
    await refundQuota(userId, quota);
    if (e.name === 'AbortError') {
      console.error('OpenAI request timed out');
      return res.status(502).json({
        error: 'Scoring took too long. Please try again.',
      });
    }
    console.error('Scoring failed:', e.message);
    return res.status(502).json({
      error: 'Scoring is temporarily unavailable. Please try again later.',
    });
  } finally {
    clearTimeout(timeout);
  }
}
