# AI cost controls and unit economics

Updated: 2026-09-01

## What is measured

Every successful provider request is written to `public.ai_usage_costs` with:

- user, IELTS skill, feature, operation, provider, and model;
- input, cached-input, output, and audio usage;
- the price snapshot used to calculate `cost_usd`;
- whether the cost is exact or estimated;
- the provider request ID when one is available.

The service-role-only views `ai_usage_cost_daily` and
`ai_usage_cost_totals` aggregate calls and cost by user, skill, feature,
operation, and model. Unrecognized models remain visible as `unpriced_requests`
with a null cost instead of silently becoming zero-cost usage.

Tracked features:

| Skill | Feature | Cost basis |
|---|---|---|
| Writing | `writing_score` | exact chat input/cached/output tokens |
| Speaking | `speaking_transcription` | exact provider-reported audio duration |
| Speaking | `speaking_score` | exact chat input/cached/output tokens |
| Speaking | `speaking_realtime_score` | exact chat input/cached/output tokens |
| Speaking | `speaking_realtime` | conservative reserved-duration estimate |

Cost recording is fail-soft because a ledger outage after the provider has
returned must not withhold a paid result. Database monitoring should alert on
`ai usage cost insert failed`.

## Price snapshot and formulas

Snapshot used by the application on 2026-07-20:

| Model | Input | Cached input | Output |
|---|---:|---:|---:|
| GPT-5.1 | $1.25 / 1M tokens | $0.125 / 1M | $10 / 1M |
| GPT-4.1 mini | $0.40 / 1M tokens | $0.10 / 1M | $1.60 / 1M |
| Whisper-1 | $0.006 / audio minute | — | — |
| GPT Realtime 2.1 audio | $32 / 1M audio tokens | $0.40 / 1M | $64 / 1M |

Sources:

- [GPT-5.1 model pricing](https://developers.openai.com/api/docs/models/gpt-5.1)
- [GPT-4.1 mini model pricing](https://developers.openai.com/api/docs/models/gpt-4.1-mini)
- [Whisper-1 model pricing](https://developers.openai.com/api/docs/models/whisper-1)
- [Realtime pricing](https://developers.openai.com/api/docs/pricing)
- [Realtime usage and cost behavior](https://developers.openai.com/api/docs/guides/realtime-costs)

Chat:

`((uncached input × input rate) + (cached input × cached rate) + (output × output rate)) / 1,000,000`

Transcription:

`audio seconds / 60 × $0.006`

Realtime sessions are browser-to-provider, so the server cannot independently
trust an exact client usage report. The ledger therefore records a clearly
marked ceiling estimate of **$0.06 per reserved minute**, covering Realtime
audio, transcription, and conversation growth. Reconcile this against provider
billing exports before treating it as exact.

## Estimated unit costs

These are planning estimates; the ledger should replace them with real
percentiles after sufficient production volume.

| Operation | Typical assumption | Typical | Conservative |
|---|---|---:|---:|
| Paid Writing score | 2,650 input + 1,350 output tokens | ~$0.017 | ~$0.028 |
| Free Writing sample | same shape on GPT-4.1 mini | ~$0.003 | ~$0.006 |
| Recorded Speaking score | 2 audio min + 2,000 input + 800 output | ~$0.023 | ~$0.037 |
| Live examiner | reserved duration estimate | ~$0.06/min | use ledger reconciliation |

### Cost delta: the band-8 `rewrite` field (2026-09-01)

`/api/score/writing` now asks for one extra structured-output field: a band-8
rewrite of a single weak paragraph, used by the report's Pro section and, in
masked form, by the free report's Pro preview. It is prompt-capped at 60-90
words and hard-truncated server-side at 900 characters, so the added output is
~150 tokens plus ~30 tokens of schema/instruction input.

| Model | Added output | Added input | Delta per score |
|---|---:|---:|---:|
| GPT-5.1 (paid) | ~150 tokens @ $10/1M | ~30 tokens @ $1.25/1M | **+~$0.0015** (~10%) |
| GPT-4.1 mini (free sample) | ~150 tokens @ $1.60/1M | ~30 tokens @ $0.40/1M | **+~$0.00025** (~8%) |

At the enforced quotas that is at most **+$0.045/month** for a fully utilizing
paid customer, and a one-off **+$0.00025** per free account. The field is opt-in
at the schema level (`buildWritingScoreSchema(task, { includeRewrite: true })`),
so the Band Estimator's short-sample scorer — which shares the schema and runs
for anonymous visitors — is deliberately excluded and its cost is unchanged.

There is no `max_tokens` cap on the call: structured outputs truncated mid-JSON
fail to parse, which would refund the quota and 502 the user. Length is
controlled by the prompt and the response is truncated after parsing instead.

At the maximum score quotas below, paid Writing plus recorded Speaking costs
about **$0.79/month typically** and **$1.31/month conservatively** per fully
utilizing customer. Existing live-examiner allowances reserve up to another
**$1.80 PPP / $3.60 global** per period. The $3.99 PPP monthly tier therefore
has thin worst-case margin before payment fees and infrastructure; do not raise
its live allowance without measured p95 cost and utilization.

## Enforced limits

All counters roll over on UTC boundaries and are consumed transactionally
before calling the provider.

| Feature | Daily | ISO week | Calendar month |
|---|---:|---:|---:|
| Writing scores | 2 | 10 | 30 |
| Recorded Speaking scores | 1 | 5 | 15 |

Additional controls:

- one lifetime free Writing sample; no free Speaking score;
- Writing: 8 requests/hour/IP and 500/day global circuit breaker;
- recorded Speaking: 10/day/user route guard and 300/day global circuit breaker;
- Realtime mint: 8/hour/IP, 300/day global, plus prepaid seconds;
- Realtime allowance: 60 minutes global / 30 minutes PPP per billing period.

Recommended review after 100 paid users or 30 days, whichever comes first:

1. Compare average, p50, p95, and max cost per feature and per plan region.
2. Measure quota utilization and customer support requests.
3. Keep the score caps unless p95 monthly score cost exceeds $1.50.
4. For new PPP entitlements, consider 15 live minutes (30 global) if the
   current 30-minute PPP reserve materially compresses gross margin. Grandfather
   already-promised allowances rather than reducing paid access silently.

## Operational queries

```sql
-- Daily cost by skill and feature.
select usage_day, skill, feature, sum(known_cost_usd) as cost_usd,
       sum(unpriced_requests) as unpriced_requests
from public.ai_usage_cost_daily
group by usage_day, skill, feature
order by usage_day desc, cost_usd desc;

-- Highest-cost users over their lifetime.
select user_id, sum(known_cost_usd) as cost_usd,
       sum(call_count) as calls, sum(estimated_requests) as estimates
from public.ai_usage_cost_totals
group by user_id
order by cost_usd desc
limit 100;
```
