// Provider usage normalization and immutable price snapshots. Cost rows are
// best-effort observability: a ledger outage must never hide a paid score from
// a customer after OpenAI has already completed it.

const MODEL_PRICES = [
  {
    model: 'gpt-5.1',
    inputPerMillion: 1.25,
    cachedInputPerMillion: 0.125,
    outputPerMillion: 10,
  },
  {
    model: 'gpt-4.1-mini',
    inputPerMillion: 0.4,
    cachedInputPerMillion: 0.1,
    outputPerMillion: 1.6,
  },
];

function modelPrice(model) {
  return MODEL_PRICES.find(
    (price) => model === price.model || String(model || '').startsWith(`${price.model}-`)
  );
}

function nonNegativeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function chatUsageRow({
  userId,
  skill,
  feature,
  operation,
  model,
  payload,
  metadata = {},
}) {
  const usage = payload?.usage || {};
  const usageReported = Boolean(
    payload?.usage &&
      (
        usage.prompt_tokens != null ||
        usage.input_tokens != null ||
        usage.completion_tokens != null ||
        usage.output_tokens != null
      )
  );
  const inputTokens = nonNegativeNumber(usage.prompt_tokens ?? usage.input_tokens);
  const outputTokens = nonNegativeNumber(usage.completion_tokens ?? usage.output_tokens);
  const cachedInputTokens = Math.min(
    inputTokens,
    nonNegativeNumber(
      usage.prompt_tokens_details?.cached_tokens ??
        usage.input_tokens_details?.cached_tokens
    )
  );
  const price = modelPrice(model);
  const costUsd = price && usageReported
    ? ((inputTokens - cachedInputTokens) * price.inputPerMillion +
        cachedInputTokens * price.cachedInputPerMillion +
        outputTokens * price.outputPerMillion) /
      1_000_000
    : null;

  return {
    user_id: userId,
    skill,
    feature,
    operation,
    provider: 'openai',
    model,
    provider_request_id: payload?.id || null,
    input_tokens: inputTokens,
    cached_input_tokens: cachedInputTokens,
    output_tokens: outputTokens,
    audio_seconds: 0,
    cost_usd: costUsd,
    pricing_known: Boolean(price && usageReported),
    estimated: false,
    succeeded: true,
    input_rate_per_million: price?.inputPerMillion ?? null,
    cached_input_rate_per_million: price?.cachedInputPerMillion ?? null,
    output_rate_per_million: price?.outputPerMillion ?? null,
    audio_rate_per_minute: null,
    metadata,
  };
}

export function audioUsageRow({
  userId,
  skill,
  feature,
  operation,
  model = 'whisper-1',
  durationSeconds,
  providerRequestId = null,
  metadata = {},
}) {
  const duration = Number(durationSeconds);
  const durationKnown = Number.isFinite(duration) && duration >= 0;
  const audioSeconds = durationKnown ? duration : 0;
  const ratePerMinute = model === 'whisper-1' ? 0.006 : null;
  return {
    user_id: userId,
    skill,
    feature,
    operation,
    provider: 'openai',
    model,
    provider_request_id: providerRequestId,
    input_tokens: 0,
    cached_input_tokens: 0,
    output_tokens: 0,
    audio_seconds: audioSeconds,
    cost_usd:
      durationKnown && ratePerMinute != null
        ? (audioSeconds / 60) * ratePerMinute
        : null,
    pricing_known: durationKnown && ratePerMinute != null,
    estimated: false,
    succeeded: true,
    input_rate_per_million: null,
    cached_input_rate_per_million: null,
    output_rate_per_million: null,
    audio_rate_per_minute: ratePerMinute,
    metadata: {
      ...metadata,
      duration_reported_by_provider: durationKnown,
    },
  };
}

export function realtimeReservationRow({
  userId,
  durationSeconds,
  mode,
  providerRequestId = null,
}) {
  const seconds = nonNegativeNumber(durationSeconds);
  // Historical planning estimate only, not an invoice reconstruction or ceiling.
  // Context reuse, output mix and reasoning can exceed this assumption.
  const estimatedRatePerMinute = 0.06;
  return {
    user_id: userId,
    skill: 'speaking',
    feature: 'speaking_realtime',
    operation: 'session_reservation',
    provider: 'openai',
    model: 'gpt-realtime-2.1',
    provider_request_id: providerRequestId,
    input_tokens: 0,
    cached_input_tokens: 0,
    output_tokens: 0,
    audio_seconds: seconds,
    cost_usd: (seconds / 60) * estimatedRatePerMinute,
    pricing_known: true,
    estimated: true,
    succeeded: true,
    input_rate_per_million: 32,
    cached_input_rate_per_million: 0.4,
    output_rate_per_million: 64,
    audio_rate_per_minute: estimatedRatePerMinute,
    metadata: {
      mode,
      methodology: 'reserved_duration_estimate',
      includes_transcription_allowance: true,
    },
  };
}

export async function recordAiUsage(admin, row) {
  try {
    const { error } = await admin.from('ai_usage_costs').insert(row);
    if (error) throw error;
    return true;
  } catch (error) {
    console.error('ai usage cost insert failed:', error.message);
    return false;
  }
}
