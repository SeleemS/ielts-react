# IELTS Speaking: audio assessment and pricing review

Prepared 6 September 2026. Implementation is local and disabled by default; no prices, customer allowances, database schema or production settings were changed.

## Recommendation

Use GPT-Realtime-2.1 for the interview and a separate candidate-audio assessment after it. Offer full mocks as a metered premium feature with paid top-ups, rather than unlimited speaking. Do not expand the existing 60/30-minute allowances. In particular, do not automatically add the richer assessment to those allowances across annual plans before validating real costs.

Suggested commercial experiment: a **$9.99 pack of three 14-minute mocks**, each with its four-criterion assessment included. This is a proposal, not a configured product. At $1 per mock, its model-only margin is about 70%; at $1.55 per mock, about 53%, before payment fees, taxes, storage, support and refunds. Establish a measured cost floor before applying regional discounts. A failed assessment retry should not require buying another mock.

For an initial pilot, keep access invite-only and bounded. A short initial drill can demonstrate the feature. Existing customers' promised allowances should be preserved; changing future inclusions requires a deliberate product/pricing decision and clear terms. The current code flag is an on/off switch, not an invitation system: an allowlist still needs to be added if that launch route is chosen.

## Current product, verified

The existing examiner already defaults to `gpt-realtime-2.1`. It conducts 14-minute full mocks or five-minute drills. Its existing post-interview scorer uses a transcript and assesses only fluency/coherence, vocabulary and grammar. It explicitly excludes pronunciation.

Stripe's six active prices were read on 6 September and match `src/lib/saleConfig.js`:

| Plan | Global | Regional discount |
| --- | ---: | ---: |
| Monthly | $8.99 | $3.99 |
| Annual | $49.99 ($4.17/month) | $19.99 ($1.67/month) |
| 30-day Exam Pass | $14.99 | $5.99 |

The repository grants 60 minutes globally and 30 regionally; the quota function refills on a 30-day cycle, including while an annual plan remains eligible. These allowances were not changed.

A read-only cost-ledger query since 30 August returned 12 records: seven writing assessments, two transcriptions, two recorded-speaking transcript assessments, and one realtime reservation estimate. There were **no provider-measured live-interview cost records** in this sample. These sparse records include QA activity and cannot establish production average or p95 speaking cost, retention, or willingness to pay.

## Cost assumptions and sensitivity

[OpenAI's model page](https://developers.openai.com/api/docs/models/gpt-realtime-2.1) lists USD per million tokens: audio input $32, audio output $64, text input $4, text output $24 and cached input $0.40. Audio and text must be priced separately. Reasoning usage must not be counted twice when it is already included in output text tokens.

Planning conversion: approximately 600 input audio tokens and 1,200 output audio tokens per audio minute. The synthetic checks observed 320 input tokens for 32 seconds of silence and 797 output tokens for 39.85 seconds of generated speech, consistent with those rates. This does not establish the total cost per interview minute. [Conversation history is billed again on successive turns, with caching affecting the result](https://developers.openai.com/api/docs/guides/realtime-costs).

Base scenario: candidate speaks for 60% of the interview; examiner for 25%; the rest is silence/preparation. Add $0.15 for live context/text/reasoning and $0.10 for assessment text/reasoning. Budget the entire microphone recording for the second audio pass, including silent gaps. Whisper transcription is budgeted at $0.006 per candidate audio minute. These are explicit assumptions, not spending ceilings.

| Cost component | Five-minute drill | 14-minute mock |
| --- | ---: | ---: |
| New live audio input/output | $0.154 | $0.430 |
| Candidate transcription | $0.018 | $0.050 |
| Recording replay for assessment | $0.096 | $0.269 |
| Live context/text/reasoning assumption | $0.150 | $0.150 |
| Assessment text/reasoning assumption | $0.100 | $0.100 |
| **Planning total** | **$0.518** | **$0.999** |
| Higher context/output budgets ($0.60 + $0.20) | **$1.068** | **$1.549** |

The executable calculation is in `lib/realtimeCost.js`, with tests. Silence, turn count, prompt length, caching, response length, noise-triggered turns and retries can change actual cost. The historic $0.06/minute reservation estimate has been relabelled as an estimate, not a ceiling. Assessment responses now record provider token details and mixed-modality pricing, including unsuccessful/incomplete responses when the provider returns usage.

The successful 39.85-second synthetic-answer assessment consumed 398 audio input, 731 text input and 599 text output tokens: **$0.030036** for the assessment alone. That excludes fixture generation and the preceding interview. It is one transport test, not a production cost forecast.

### What existing inclusions imply

At the base full-mock scenario, four mocks consume 56 of 60 minutes and cost about $4.00; two consume 28 of 30 minutes and cost about $2.00. Spending the allowance on five-minute drills is more expensive because each drill incurs another assessment: twelve cost about $6.21; six cost about $3.11.

Those numbers are **speaking only**. At full use they leave almost no model-cost room in the $4.17/month global annual plan and exceed the $1.67/month discounted annual plan before writing, payment fees and operations. The discounted monthly plan also has thin margin. Actual average usage may be lower; the current ledger does not justify betting pricing on that assumption.

Use measured distributions across modes before setting recurring inclusions. A promising pilot decision is paid mock credits plus a limited introductory drill; keep broad ongoing audio use separate from the cheapest annual plans. Do not silently remove benefits from existing subscribers.

## What was implemented

- Candidate microphone capture in lossless 24 kHz mono PCM, kept separate from examiner output. Headphones are requested to reduce speaker bleed. AudioWorklet support is checked before reserving minutes.
- Recordings split into at most two private WAV files, each no longer than seven minutes, uploaded directly to the existing owner-only `speaking-uploads` bucket. No large recording passes through the Next.js request body. No new storage policy or migration is needed for the checked-in schema.
- A server-signed, 24-hour assessment ticket binds the paid reservation to its owner, mode, duration and score request. The server derives storage paths; clients cannot submit arbitrary URLs or another user's object path.
- A short-lived server WebSocket replays the recording to **GPT-Realtime-2.1**, then requests text feedback. It disables automatic voice responses and bounds response tokens/time. Failed format validation does not become a score.
- Four rubric criteria, server-computed equal weighting and half-band rounding. Any unassessed criterion withholds the overall band. Pronunciation includes intelligibility, sounds, stress, rhythm and intonation; accent identity is not a criterion.
- Timestamped pronunciation observations, assessment limitations, practice-estimate labels and a four-card result view. Generated confidence is not presented as calibrated certainty.
- Existing idempotent score claims protect retries. The audio path has a distinct claim fingerprint. Upload failures keep audio in tab memory; once uploaded, a small reference supports retry after reload. Audio is deleted after durable score confirmation; otherwise existing cleanup schedules deletion after 30 days.
- Legacy transcript-only sessions remain explicitly three-criterion assessments. A failed audio assessment never silently becomes a transcript-based pronunciation grade.

The new route uses the [official equal-weighted criteria](https://ielts.org/take-a-test/your-results/ielts-scoring-in-detail) and [public speaking descriptors](https://ielts.org/cdn/ielts-guides/ielts-speaking-band-descriptors.pdf) as rubric references. The model is not an IELTS-certified examiner and the estimates are not validated official results.

## Validation and release limits

Passed: 1,569 tests across 152 test files; default suite skips the opt-in paid API tests. Production build passed, generating 624 static pages. Targeted lint and whitespace checks passed. Tests cover four-way band maths, missing evidence, timestamps, paid ticket ownership/tampering/expiry, bounded WAV downloads, provider token pricing, socket closure, uploads and scoring retries.

Live checks passed independently: Realtime 2.1 accepted synthetic silence and withheld an overall/pronunciation band; a 39.85-second synthetic English answer produced all four criteria and pronunciation observations. The synthetic result and usage are retained in `synthetic-assessment.json`. This is **not** validation against human examiner scores. Some generated feedback is generic; specificity and grounding must be evaluated as part of calibration.

Not yet verified: physical Chrome/Safari/iPhone microphone capture and playback, a complete 14-minute upload/assessment under mobile network conditions, multi-accent human calibration, timing accuracy of observations, true live interview token costs, and production deployment. Existing minute termination is enforced in the browser. It is **not a tamper-proof provider spend cap**, and a short-lived client secret does not terminate an established call. Production expansion needs trusted call-duration enforcement and live-session usage reconciliation; the current per-IP/global start limits bound starts, not every dollar spent within a call.

Before enabling broadly: collect consented recordings across target accents, bands and microphone conditions; obtain independent examiner ratings; compare criterion error, systematic over/under-scoring, accent-related disparities, confidence/refusal behaviour, and timestamp correctness. Set acceptance thresholds before evaluating. Include silence/noise, short answers, examiner leakage and spoken prompt injection. Measure p50/p95/worst observed cost per completed and failed session and include retries in pricing.

Configuration, once the pilot is ready: set the build-time `NEXT_PUBLIC_REALTIME_AUDIO_ASSESSMENT=true` and a server-only random `REALTIME_ASSESSMENT_SECRET` of at least 32 characters, then rebuild. Rotating that secret invalidates outstanding assessment tickets. Keep the switch false until the chosen launch checks and pricing decision are complete. No Stripe pack was created and no public price was changed.
