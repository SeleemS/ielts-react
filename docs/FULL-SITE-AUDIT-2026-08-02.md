# Full Site Audit — 2026-08-02

Five parallel deep-dives: **speed, content, retention, conversion, virality/sharing**. Prior shipped work (Jul 20 product-audit fixes, Jul 25 pricing rollback, Aug 1 content fixes, GA4 funnel) was excluded — everything below is net-new. Funnel context from the Aug 1 analytics audit: 998 visitors → 34 paywall views → 26 upgrade clicks → 11 checkout starts → 4 paid; 87% of users active exactly one day; speaking pages are the #1 lander AND #1 paywall source; buyers convert fast (0–1 attempts).

---

## Executive summary — the five headline gaps

1. **Zero share/referral features exist anywhere** — no share buttons, no wa.me/Telegram links, no referral codes, no `?ref=` handling — despite the OG-image generator, UTM attribution pipeline, and AI-credit ledger already providing ~80% of the plumbing. (Prior audits flagged this in July; nothing shipped.)
2. **Nothing proactively pulls users back.** The email system sends only 4 static templates; exam dates, target bands, streaks, and progress data are captured but never reach an inbox. Worse, registered users are mostly not in the email audience at all (opt-in only renders for signed-out users).
3. **Warm non-converters get zero follow-up.** 7 of 11 checkout starters and 22 of 26 upgrade-clickers evaporated with no abandoned-checkout or paywall-bounce email — the highest-intent audience on the site, all with known emails.
4. **Speaking — the top SEO surface and top paywall source — has no free taste and no model answers.** Hard paywall before any scoring; cue-card pages (top content landers) contain zero band-9 sample answers.
5. **The fake "studying now" badge is still live in the navbar** (`src/components/Navbar.jsx:207`, `src/lib/studyingNow.js`) — the exact artifact the July legal audit flagged. Prerequisite fix before building any social-proof or word-of-mouth loop.

---

## Priority 1 — Quick wins (each ≤1 day)

| # | Item | Dimension | Detail |
|---|------|-----------|--------|
| Q1 | **Remove/replace fake StudyingNowBadge** | Legal/virality | Replace with truthful metric from `activity_events` (e.g. "questions answered today") or remove. `Navbar.jsx:24,207`, `src/lib/studyingNow.js`. Also verify the `averageUserBand` migration landed so synthetic fallbacks aren't serving. |
| Q2 | **Fix 324 KB favicon** | Speed | `public/favicon.ico` is 324 KB served with `max-age=0`. Regenerate multi-res .ico (~10–15 kB); add immutable cache headers for static icons in `next.config.js`. |
| Q3 | **Newsletter opt-in at signup** | Retention | `deliverDue` suppresses weekly_digest AND win_back unless user is a confirmed `newsletter_subscribers` row — but signup never subscribes anyone, and the opt-in form renders only for signed-out users (`QuestionEngine.jsx:192`). Add consent checkbox to the signup "about" step (geo-aware: unticked EU). Multiplier for everything email-based. |
| Q4 | **Default pricing toggle to 3-month** | Conversion | `pricing.jsx:308` defaults to monthly; the comment even says 3-month should lead. One-line change + verify Save badge. |
| Q5 | **Share buttons on result surfaces** | Virality | One `ShareResultButton` component: `navigator.share` (native sheet → WhatsApp first on mobile) + `wa.me`/`t.me`/copy-link fallbacks, UTM-tagged. Mount at: mock completion, estimator reveal, band-calculator result, writing report, dashboard trend. Track `share_click`. |
| Q6 | **Verify/import GT Writing Task 2** | Content | `scripts/content/data/wr-general-task2.json` has 12 GT Task 2 prompts but Aug 1 audit counted zero in DB. Re-run `import-wr.mjs`, confirm rows publish, run model-answer generation over them. |
| Q7 | **Checkout-canceled recovery page** | Conversion | `pricing.jsx:589` shows only "Checkout canceled." Add guarantee restatement + saved-work reminder + one-tap "what stopped you?" survey (price / unsure / payment failed). |
| Q8 | **Free-sample state chip on writing page** | Conversion | Users discover their lifetime sample is spent only after composing a full essay (402). Show "✨ Free AI score available" / "Sample used — Pro scores this essay" via RLS-readable `user_quotas`. |
| Q9 | **Mock paywall context + clickable sale banner** | Conversion | `PremiumGate` links bare `/pricing` (contextualCopy only handles writing/speaking); sale banner has 65 view_promotion, 0 select_promotion — it's not clickable. Add `?upgrade=mock` variant + click handler. |
| Q10 | **Streak surfacing** | Retention | Streak computed but shown only on dashboard. Add "Day N streak" to post-submit ResultsSummary (confetti at 3/7/14/30) + small navbar flame badge. Extract streak logic from `src/components/dashboard/utils.js` into shared lib. |
| Q11 | **Blog share row** | Virality | Full OG meta exists, zero share buttons on `blog/[slug].js` and guide pages. WhatsApp/Telegram/X/copy, UTM-tagged. |
| Q12 | **Fair-use clarity** | Conversion | State exact AI-score allowances in pricing FAQ; return `resets_at` from 402 and render "resets in 6h" in `AiQuotaPanel`. |

## Priority 2 — High-impact projects (2–5 days each)

### P1. Personalized lifecycle email suite (retention + conversion, single project)
The outbox infra (idempotent queue, Resend, unsubscribe, hourly cron) is solid — this is new queue functions + templates:
- **`exam_countdown`** at D-30/14/7/2: band gap vs target + recommended skill + contextual Pro CTA. (93 onboarding answer sets captured; exam_date currently cosmetic only.)
- **`checkout_abandoned`** (T+2h): enable Stripe `after_expiration.recovery` in `pages/api/billing/checkout.js`, store recovery URL, restate guarantee + saved essay.
- **`paywall_followup`** (T+24h after paywall_view with no purchase) → `/pricing?upgrade=<skill>`.
- **`weekly_progress`** replacing the generic digest for active users: bands, delta, streak, weakest type, one CTA. Zero-activity users get a streak-reset nudge.
- **`streak_at_risk`** (practiced yesterday, not today, streak ≥3).
- **`day2_first_week_plan`** (24h post-signup with ≥1 attempt).
Depends on Q3 (audience) — and note win_back is currently suppressed for anyone not in the newsletter table; consider exempting it.

### P2. Speaking free taste (conversion)
Mirror the proven writing model: one lifetime free recorded-speaking score (band + first criterion, rest locked) or the 3-min examiner taster from MONETIZATION.md §9.3. `WritingScoreReport` teaser pattern + `reduceForFree` server logic + `goToPremium(audioPath)` recording capture already exist to copy. `SpeakingQuestion.js:956`, `speaking-examiner.js:641`.

### P3. Speaking model answers (content)
Add `model_answer` (+ optional TTS audio) to speaking_details; generate Band 8–9 samples + examiner rationale per cue card / Part 1&3 set (clone `generate-writing-model-answers.mjs`). Server-render with free-teaser/premium split so it's crawlable. Compounds the strongest acquisition channel.

### P4. Score OG cards + share landing (virality)
Extend `pages/api/og.jsx` with a `band` layout (BandHero donut in Satori) + `/r/[payload]` share-landing route (band+skill in query, no PII) whose OG meta serves the band card and body says "Beat this score — try the free mock." Makes WhatsApp-shared links unfurl as branded band-score images. Multiplies Q5.

### P5. Give-get referral (virality)
"Give a friend a free AI Writing score, get one yourself." `?ref=` code through the existing `acquisition_source` first-touch pipeline (`pages/api/track.js:59-75`), a `referrals` table, grant via existing `consume_ai_score` credit path, monthly cap + same-device/IP guard. Surface in dashboard + post-score screens. Add "Share" channel to `/data` dashboard.

### P6. Mistake review mode (retention)
`/review` page: queue of missed questions across attempts (per_question data already stored with questionType + correctness), weakest-type first, re-presented individually with existing "Why:" explanations; item clears after 2 correct answers (light spaced repetition). Today "Retry" restarts the whole passage. This is the daily-return activity loop and the deep-link target for P1's emails.

### P7. Speed batch (one PR-sized project each)
- **Pricing SSR → static** (biggest single win): `pricing.jsx:955` SSRs solely to read `x-vercel-ip-country` → 675 ms TTFB, cache MISS on the top conversion page. Have `middleware.js` set an `ib_country` cookie; convert page to `getStaticProps`, flip PPP client-side. 3–4× TTFB improvement.
- **Lazy-load Supabase SDK**: `_app` chunk is 90.7 kB gz because `AuthProvider` eagerly imports supabase-js incl. unused realtime/websocket code. Dynamic-import inside mount effect; also `next/dynamic({ssr:false})` for OfferReminderModal/ConsentManager/InteractionTelemetry. ~35–45 kB gz off every page's first load.
- **Bound dashboard queries**: `dashboard.js:52-63` fetches every attempt ever with `per_question` JSONB and joins, no limit. Add `.limit(100)`, drop per_question from list select (fetch on row expand).
- **Mock API waterfall**: `api/mock/[slug].js` does 6–10 serial round trips (auth → premium → sections sequentially, admin client re-created per request). `Promise.all` the premium check + fetch, parallelize sections, memoize `getAdmin()`.
- **Build-time**: `getRelatedPractice` runs 2 full list queries per page × ~380 pages (readingquestion builds took 178 s); memoize per-skill list per build. Also stop pre-rendering both legacy-ID and slug variants (`readingquestion/[id].js:13-25`) — canonical only, fallback covers the rest.
- **usePlan dedupe**: per-instance fetch, 1–3 duplicate `users` selects per navigation. Lift to a PlanProvider or module-level cache.
- Minor: bump question-index `revalidate: 60` → 3600.

### P8. Content hub layer (content/SEO)
- Add missing reading hub entries: `flow-chart-completion`, `diagram-label`, `plan-map-diagram-labelling` (content now live but unfilterable/un-SEO'd).
- Build `listeningQuestionTypes.js` + `pages/listening/[type]` hubs (Part 1–4, map labelling) now that the Part model exists.
- `/speaking/part-1|2|3` + topic hub over the cue-card bank.
- New utility pages: `/ielts-band-descriptors` (tables — LLMs cite tables), `/ielts-score-requirements` (incl. CLB conversion for Canada PR).

### P9. Blog pipeline (content)
Write the 16 queued topics in `scripts/content/blog-gap-topics.json` (sample-answer + requirements posts first), then: "6.5→7.0 per skill," band-annotated Task 2 sample essays (5/6/7/8/9 compared — natural writing-checker funnel), CLB conversion, TRF guide, Task 1 letter samples per type. Rewrite the 5 thin July-2025 posts (which also carry the legally-flagged "past papers" framing) and start using the `updated:` field (currently never used).

## Priority 3 — Larger/later

- **INR + UPI checkout** (conversion, L): checkout hard-requires USD (`advertisedPriceMismatch()`); UPI needs INR and RBI e-mandate breaks recurring USD cards. Add INR price variants, enable UPI, per-lookup-key currency map; consider non-renewing prepaid SKU (retired Exam Pass webhook machinery still exists) for e-mandate markets. First step: display local-currency equivalents on /pricing.
- **Cancellation save offer** (conversion, M): pre-portal interstitial with pause + 40% save offer (coupon machinery exists); win-back currently only fires 30 days post-cancel.
- **Challenge-a-friend mocks** (virality, M): share deep-link with challenger's band on the landing (payload-only, no DB for v1).
- **Full mock day** (content, M): Reading mock → Writing (AI-scored) → Speaking chained; GT Reading mock once ~2 more GT section sets exist.
- **Explanation reasoning upgrade** (content, M): current explanations are evidence-quotes only; LLM pass to add "why the trap options are wrong" for TFNG/MC; listening transcript anchors (aligned transcripts already exist at generation time).
- **PWA + study reminders** (retention, M): manifest + installability; user-chosen reminder time driving streak email, upgradeable to web push later.
- **Testimonial collection loop** (conversion, M): post-score micro-prompt for premium users + post-exam "what did you score?" email → fills the currently-empty `TESTIMONIALS = []` honestly; enables AI-band-vs-real-band accuracy claims.
- **Dashboard progress-card export** (virality, M): BandTrend improvement as shareable image via OG endpoint.
- **Homepage Pro strip** (conversion, S but low certainty): index.js never mentions pricing; add free-vs-pro strip after skill grid.
- **Post-completion next-steps** (retention, S): after mock, reuse PracticePlan logic ("weakest section → practice → next mock"); after writing score, CTA targeting lowest criterion.
- **"vs average user" comparison post-score** (retention, S): real per-passage average band exists, shown only in DataTable.

## Dependencies / notes
- Q3 (email audience) gates P1. Q1 (fake badge) gates all social-proof/virality work reputationally.
- The Aug 1 analytics audit's tracker-death bug should be confirmed fixed before P1/P2 impact can be measured.
- All streaks/countdowns/comparisons must use real stored data (legal-audit lesson) — everything proposed above does.
- Key rotation (Supabase/Stripe) still pending from July — unrelated to this audit but still open.
