# Release audit — 6 September 2026

This report records code repairs and observed test coverage. It does not certify every device, catalog item, provider lifecycle or external delivery path. Business analytics, account identifiers, credentials, payment identifiers and operational access details are intentionally excluded from this public artifact.

## Repairs

| Area | Failure | Result |
|---|---|---|
| Account plans | PostgREST thenable was treated as a native Promise with `.finally`, breaking plan loading | Native Promise assimilation; real-thenable and synchronous-failure regression tests; authenticated free/paid dashboard verified |
| Public Writing | Sample banner dereferenced retired pricing | Safe current-price rendering; public editor/model answer verified |
| Checkout | Replaying activation could extend a pass and replenish spent quota | Atomic fulfillment receipt, stable expiry and purchase correlation; real zero-total QA checkout and two unchanged replays verified |
| Subscription events | Retried invoices and stale lifecycle events could overwrite newer access | Atomic event ordering and invoice deduplication; rollback and separate-connection tests |
| Refunds | Earlier purchase reversal could revoke newer paid access or be undone by replay | Exact purchase pointers and revocation tombstones; provider fixtures and SQL tests |
| Mistake review | One missed question reopened its whole group and generated false mistakes and misleading bands | Exact question selection, source context, isolated drafts and null-band review history; live 1/1 preserved original 9/10 attempts |
| Billing display | Retained expired timestamps appeared active | Shared time-aware heading/status, controlled expiry/cancellation fixtures |
| Quota and signup copy | Copy omitted weekly/monthly AI caps and anonymous sample boundary | Promises aligned with enforced allowances; no plan/pricing strategy change |
| Discovery | Three empty topic months and empty Reading category were advertised | Discovery now follows published content availability |
| Voice lifecycle | Late microphone/mint/SDP completion could continue after navigation; delayed unmute survived connection failure | Generation guards stop stale work and release media/timers; reproduced with synthetic local media |
| Automatic voice scoring | Timer/data-channel callbacks captured an unset mode, rejecting an otherwise valid transcript | Session mode and current account refs preserve scoring identity; timer expiry and account-switch fixtures |
| Push destinations | Arbitrary HTTPS endpoints could reach the server-side push transport | Standard provider host validation at registration and dispatch; invalid stored destinations retired without network calls |
| Reminder overlap | Simultaneous cron runs could both dispatch before recording delivery | Row-locked ten-minute leases and token-checked completion preserve local-day scheduling and user opt-out; service-role SQL fixtures pass |
| Referral rewards | Concurrent redemptions could exceed the five-award monthly cap | Serialize the referrer code lookup before counting/crediting; reproduced cap 6 before the fix and verified cap 5 afterward with separate connections |
| Push click beacons | JSON null body crashed before validation | Normalize malformed/non-object input and return 400; identity/rate/persistence tests |
| Reminder opt-out | UI could report disabled despite failed server deletion | Require server success and retain endpoint for retry before browser unsubscribe |

Zero-total settlement also has defensive `no_payment_required` coverage, accepted only with zero total. The actual QA checkout reported `paid` with zero amount; this status variant was not a reproduced production failure.

## Verification methods

- Inventoried **44 page patterns and 34 API routes** in [routes.json](routes.json). Every page pattern received HTTP probes, with 12 invalid dynamic paths; every API received method/authentication/origin boundary probes. This is not a claim of every body/role/method permutation.
- Crawled 620 sitemap URLs. Three advertised404 pages led to the discovery repair; corrected public discovery was checked after deployment. HTTP success does not prove interactive behavior for every catalog item.
- Dedicated synthetic account: confirmed login, profile preferences, free Writing/Speaking samples and upgrade boundaries, Reading/Listening submissions, populated history/search, paid Writing/Speaking, timed 40-question mock draft/reload/submission, billing and portal.
- Real QA one-time checkout: 100% discount, zero total, no card, no PaymentIntent and no recurring subscription. Exact entitlement and purchase receipt reconciled; two sequential replays left expiry/quota unchanged. Promotion exhausted. Exclude this synthetic activity from business reporting.
- Estimator: one synthetic anonymous Writing score withheld its band; authenticated reveal returned the Premium report. Repeated reveal preserved exactly one owned attempt and score.
- Realtime: authorized session mint plus a brief synthetic text exchange succeeded. Separate page tests use mocked media/WebRTC/provider calls to exercise permission denial, greeting, resource cleanup, scoring retry, timed ending and account changes. These are not live microphone/audio tests.
- Billing: three applied-schema rollback regression suites, plus 11 controlled races using distinct PostgreSQL connections, actual lock observation and exact normalized copies of five installed billing functions. Isolated fixture schemas were removed. No customer data or real Stripe charges/refunds were used by the race tests. Run the opt-in [concurrency verifier](../../scripts/verify-billing-concurrency.mjs) only against an authorized database.
- Account: sampled owner-isolation and ordinary-account analytics denial, duplicate-pass rejection, optional consent persistence and local-session refresh revocation. Date save/clear input-event and payload/rerender tests passed; the live native date control remains an automation limitation.
- Contact/newsletter/lifecycle/push: provider-mocked handler tests establish validation, persistence, consent and failure behavior. They do not establish external inbox/device delivery.

## Remaining verification and required conditions

| Gap | Why not established | Required condition |
|---|---|---|
| Signup OTP, resend/recovery and email receipt/delivery | Dedicated admin-provisioned QA account has no deliverable inbox; Mail access was not approved | Authorized test inbox and an approved way to read it; account provisioning does not substitute for delivery |
| Native browser date entry | Programmatic fill did not change the controlled value; normal owner API and local real-input-event tests pass | Manual native picker interaction or supported browser automation for this control |
| Browser microphone, WebRTC audio, VAD and device interruptions | Available browser controls expose no supported synthetic media injection; room audio was not recorded | Explicit test-device/media setup with synthetic input or intentional participant consent |
| Push receipt/click/device permission | No existing push subscriptions were available; no dedicated receiving browser/device configured | QA push-enabled device and approved synthetic destination |
| Real recurring charge/proration/refund/dispute lifecycle | Only live Stripe credentials were configured; the audit excludes real customer transactions | Isolated Stripe test-mode account/keys and webhook destination, or separately authorized controlled payment test |
| Exhaustive catalog, accessibility and browser/device combinations | Route inventory and representative interactions do not enumerate every combination | Defined target browser/device matrix and additional UI runs |

The push provider policy permits Google FCM, Mozilla production/legacy endpoints, Apple push subdomains and Microsoft WNS subdomains. Provider changes require a reviewed policy update; arbitrary self-hosted endpoints are unsupported. Sources: [Chromium](https://chromium.googlesource.com/chromium/src.git/+/40644b8cf2b03be542976e7d1192c653e389c14e), [Mozilla](https://mozilla-services.github.io/autopush-rs/http.html), [Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [Microsoft](https://learn.microsoft.com/en-us/windows/apps/develop/notifications/push-notifications/wns-overview).

Push transport acknowledgement followed by a process crash is inherently ambiguous: a later retry may duplicate delivery. The lease prevents simultaneous active workers; it does not promise exactly-once provider delivery.

Code tests and isolated database fixtures can close logic gaps without claiming those external conditions were met. Historical learner records and scoring results were not rewritten. Production release/test totals are updated at the final release checkpoint below.

## Release checkpoint

Application fixes pushed through `350d3a9`, including speaking lifecycle/scoring repair `9361b62`. Final full suite: **147 files, 1,511 tests passed; lint passed**. Three billing migrations, the additive push delivery lease migration and the referral serialization migration were applied and tracked. Push migration preflight and applied-schema tests ran as `service_role`, rolled back their fixtures, and left no subscriptions. Four additional push races passed using separate database connections and exact installed function copies; cleanup verified. Sanitized outcomes: [billing races](billing-races.json), [push races](push-races.json). Reproducible push runner: [verify-push-concurrency.mjs](../../scripts/verify-push-concurrency.mjs). Application release `350d3a9` was verified Ready on the production domains. Live checks rejected an untrusted push host and malformed null beacon with400; service-role claim/finish RPCs returned safe no-op results for nonexistent fixture IDs. All eleven referral boundary checks passed against an exact installed-function clone, including separate-connection cap enforcement, loser attribution and rollback/retry. Cleanup was verified. [Referral evidence](referral-boundaries.json) and [runner](../../scripts/verify-referral-boundaries.mjs).
