# Paid funnel measurement contract

Prices and free allowances are unchanged. The offer is a single sequential rollout, not an A/B experiment. Evaluate operational health before interpreting conversion movement.

## Sources and privacy

- Stripe Checkout Sessions: created session and completed positive-value payment facts. Invoice renewals are not purchases in this funnel.
- `billing_checkout_fulfillments`: atomic `applied` activation and first fulfillment timestamp. A paid session without that receipt is a reconciliation exception, not an assumed activation. Historical pre-cutover activation cannot be reconstructed reliably.
- `attempts` and `scores`: persisted completion timestamps only; no answers, essays, feedback, recordings, grades, or contact details are selected for the report.
- `activity_events`: `checkout_session_created` and `checkout_session_failed` with `source=billing_checkout` are operational diagnostics. They store only user billing identity, SKU, bounded failure stage, and session/request key. A diagnostic write failure must not break checkout; Stripe remains created-session truth.
- `exam_pass_offer_view` and `exam_pass_offer_click` remain optional, consent-limited browser analytics. Their reach is reported separately and must not be interpreted as complete operational coverage.

The existing activation/purchase webhook records already cover paid entitlement activation; no duplicate behavioral event or new table is needed. First completed practice is derived from operational persistence after activation, within fourteen days and before a recorded pass expiry or purchase revocation. It demonstrates a buyer returning to practice, not necessarily consumption of a paid allowance. Only activations with fourteen complete follow-up days enter the first-practice rate.

## Denominator and revenue

An eligible learner is a current non-anonymous account that completed persisted practice during the window before its first recorded positive-value Checkout purchase. This reproducible denominator covers authenticated active learners, not all visitors, all registered accounts, or verified offer exposure. An account currently verified may have practised anonymously historically.

Report complete trailing 14-day and 28-day UTC windows, ending at midnight. Gross collected revenue per eligible learner includes positive-value **first** Checkout activations among that same denominator. Keep currencies separate (USD is the advertised catalog currency), with no exchange-rate assumptions. Report repeat purchases and zero-value activations separately; exclude explicit QA identities and recurring renewals. Unknown internal accounts and manual/non-Checkout purchase history remain limitations. Existing customer classification includes prior positive-value Checkout and paid invoice history mapped by exact Stripe customer identity. Off-Stripe/manual payments remain outside that history.

Gross collected revenue is not net revenue or profit. The script separately checks exact payment-intent/invoice-linked charge refunds/disputes in the reporting window. Missing charge links and refunds on older charges require separate reconciliation; no unverified net-revenue number is fabricated.

## Reproduction

```sh
node scripts/report-paid-funnel.mjs --read-only \
  --end=2026-09-06 \
  --exclusions=/private/path/qa-user-ids.json \
  --output=/private/path/paid-funnel-report.json
```

The exclusions file is a JSON array of UUIDs and must stay outside the repository. Alternatively set `FUNNEL_QA_USER_IDS_JSON`; the locally approved audit account is also excluded when its private fixture file exists. The script uses `BEGIN READ ONLY`, rolls back, makes only Stripe list requests, enforces a pagination cap that fails instead of truncating, and outputs only aggregates. Credentials come from local environment/configuration and are never printed. Dates and exclusions must be fixed when comparing saved runs.

Baseline aggregates are private operational reports and must not be committed to a public repository. Empty new diagnostics/exposure events before deployment do not prove an absence of errors or views.

Operational failures cover rate limiting, catalog validation, coupon validation, customer creation/linking, and session creation after authenticated checkout eligibility. Invalid authentication, invalid SKU, anonymous users, already-owned plans and winback eligibility rejections are not classified as provider checkout failures. Provider payment failures after session creation require Stripe payment-event reconciliation; a session created successfully is not a payment success.

The ordered observed offer path is a separate signed-in, consent-limited subset: prior completed AI score (including a mirrored estimator result), observed offer view, later click, later Exam Pass session, and an exact positive-value activation receipt. It does not stitch anonymous identities, establish causation, or replace the operational eligible denominator.

## AI-score outcome

`firstCompletedAiScoreWithin14Days` and `firstAiScoreRate` measure a completed Writing/Speaking score after a positive paid activation, inside fourteen days and before a recorded expiry/revocation. They are separate from `firstCompletedPracticeWithin14Days`, which also includes free Reading/Listening. This infers that the score completed while the recorded paid entitlement was active; it does not assert which quota bucket was charged or reconstruct unrecorded subscription cancellation history.

Estimator results already mirrored into `scores` count as prior AI results for `withPriorCompletedAiScore`. The SQL classifies their source with a scalar JSON comparison inside the database; it does not retrieve essay/response content. Estimator results do **not** count as paid AI-score outcomes, even if revealed after activation. No anonymous estimator identity is stitched to later behavior and no extra estimator content query is needed.
