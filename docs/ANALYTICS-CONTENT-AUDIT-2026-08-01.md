# Analytics & Content Authenticity Audit — 2026-08-01

Scope: Supabase `activity_events` (2026-07-17 → 2026-08-01, 44,311 events), `users`, `ai_usage_cost_totals`, plus a content-fidelity comparison of the question bank against official IELTS format specs (ielts.org).

---

## Part 1 — Analytics audit

### 1.1 Traffic & audience

- **~55–70 unique visitors/day** (launch spike Jul 18–19 up to 254), 998 unique actors over the window, 161 registered users.
- **Countries:** US 279, SG 79, VN 73, IN 55, PK 49, UZ 46, BD 38, AE 29 — a majority-PPP-market audience beneath a US-heavy top line.
- **Acquisition (visitors → signups → per-visitor conversion):**
  - chatgpt.com: 297 → 53 (18%)
  - www.google.com: 107 → 28 (26%) ← best-converting source
  - direct: 307 → 16 (5%)
  - bing 15, everything else negligible. Facebook/Instagram present but tiny.
- **Landing pages:** homepage dominates (543 landers); **speaking cue-card pages are the top content landing (67)**, then writing (17), reading (16), blog (14), listening (10). Speaking content is the SEO/ChatGPT magnet — and it's premium-gated, which explains why speaking is also the top paywall-view source.

### 1.2 Conversion funnel (unique actors, full window)

| Stage | Actors | % of visitors |
|---|---|---|
| All visitors | 998 | 100% |
| Engaged (opened a question / started attempt) | 368 | 36.9% |
| Submitted an attempt | 164 | 16.4% |
| Signup started | 125 | 12.5% |
| Signup verified | 102 | 10.2% |
| Hit any gate (free limit / premium / mock) | 136 | 13.6% |
| Paywall view | 34 | 3.4% |
| Upgrade click | 26 | 2.6% |
| Checkout start | 11 | 1.1% |
| **Paid** | **4** | **0.4%** |

- Paywall views come from **speaking (23 actors)** and **writing (12 actors)** only.
- Checkout sources: pricing 5 actors, speaking 3, writing 2, direct 3.
- Estimator funnel: 37 starters → 15 completers (40%); 12 estimator CTA clicks.
- Free-limit gate is dominated by a handful of reading/listening slugs (`a-brief-history-of-money` alone: 24 hits / 11 actors) — these are the highest-intent free pages.

### 1.3 Payments & upgrades

Real purchases (excluding two $0 test transactions on Jul 19):

| Date | Buyer | SKU | Amount | Source | Time to buy | Practice before buying |
|---|---|---|---|---|---|---|
| Jul 20 | 260db533 | monthly → **6month upgrade 55 min later** | $9.99 + $29.99 | direct | 30 min | 0 attempts (writing user) |
| Jul 20 | 7277eb34 | monthly | $9.99 | google | 22.8 h | 1 reading attempt |
| Jul 26 | 9dddce78 | monthly | $8.99 (new pricing) | unknown (journey unlinked) | unknown | unknown |
| Jul 31 | e7e09853 | monthly | **$3.99 PPP (India)** | chatgpt.com | **10 min from signup** | 0 attempts |

Gross ≈ **$62.95**. Plan mix now: 2 monthly active, 1 6month active, 1 monthly canceled.

Insights:
- **Buyers are fast, high-intent, and barely practice first** (0–1 attempts before paying; one bought 10 minutes after signup). The paywall meets them with intent already formed — speaking/writing gating is doing the selling, not the practice loop.
- **PPP pricing converted its first buyer** ($3.99 India) — evidence the regional pricing ladder works.
- **AI cost vs revenue is very healthy:** $1.86 total OpenAI spend (29 calls, 18 users) against ~$63 gross.

### 1.4 Retention — the weakest metric

- **87% of all actors were active exactly 1 day**; 75 two days, 44 for 3–5 days, only 6 actors exceeded 5 days.
- Of 91 verified signups through Jul 25: only **34 (37%) ever returned after signup day**, and just **6 (7%) were active in week 2+**.
- Practice mix: reading 268 attempt-submits (127 actors), listening 215 (71); writing 71 submits (27), speaking 44 (26). Onboarding captured 93 answer sets (goal/exam date/target band) — currently unused for re-engagement.

The acquisition engine and paywall both work; **nothing brings users back**. Lifecycle email infra exists (`lifecycle_emails`) and exam dates + target bands are captured at onboarding — that's the obvious lever.

### 1.5 Tracking integrity findings (ordered by severity)

1. **CRITICAL — client tracker dies after onboarding-modal close.** Jul 31 buyer's events stop dead at 11:34:25 (modal_close → dashboard), then nothing — no heartbeats, no /pricing page view — despite completing Stripe checkout at 11:42 (checkout can only be launched from `pages/pricing.jsx`, so they definitely browsed untracked). The Jul 26 buyer has *one* linked event ever. Both post-migration purchase journeys are invisible. → spawned fix task.
2. **CRITICAL — no purchase event recorded since Jul 26.** The GA4 ecommerce migration renamed the client event to `purchase` (never observed once) and the Stripe webhook now logs only `subscription_activated` — pre-Jul-26 it wrote `purchase_success` rows. The /data dashboard funnel and GA4 Monetization are blind to revenue. `GA4_MP_API_SECRET` is still unset, so the Measurement Protocol backstop is also inactive.
3. **`begin_checkout`/`checkout_start` fired once since Jul 26** (a non-buyer). Downstream of bug #1 — bottom-funnel events are effectively dark.
4. **Anon→user linkage gap:** the Jul 26 buyer's browsing was never backfilled to their user_id (login-time backfill only matches the current device's anon_id). 17,180 of 44,311 events remain anon.
5. **`select_promotion` has 0 events ever** despite 65 `view_promotion` — either nobody clicked sale chrome or the click handler isn't wired; worth a 5-minute check.
6. Healthy elsewhere: no `client_event_id` duplicates, bot filtering working, null-session events (2,452) are legitimately server-side, internal-path filtering active.

---

## Part 2 — Content authenticity vs real IELTS

Reference: official ielts.org format pages (Listening, Academic/GT Reading, Writing, Speaking). Full sources at bottom.

### 2.1 Verdict per skill

| Skill | Fidelity | Verdict |
|---|---|---|
| Reading (Academic) | **B+** | Passage lengths (median 755 words; mocks 2,377–2,474 words vs official 2,150–2,750) and instructions close to real; type mix badly skewed. |
| Reading (GT) | **C−** | 22 standalone short texts; no multi-text Section 1–2, no Section-3 long text, no GT mock. |
| Listening | **B−** | Authentic content, 10-Q sections — but **no Part 1–4 model at all**, mock ordering looks alphabetical, map-labelling mistyped. |
| Writing | **B+** | Academic T1 (150w, SVG charts: bar/map/table/pie/process/line) and T2 (250w, authentic frames) solid; **GT Task 2 essays: zero**. |
| Speaking | **A−** | Closest replica — cue cards with bullets + "and explain…", 60s prep/1–2min talk, themed Part 3. Missing: assembled full 11–14-min interview. |

### 2.2 Type-coverage gaps (published bank: 152 reading passages / 1,965 Qs; 45 listening passages / 426 Qs)

- **Missing entirely (official types, zero coverage):** flow-chart completion, diagram-label completion, plan/map/diagram labelling (5 listening map groups exist but are mistyped as `matching_information`). Enum values exist but are unused.
- **Over-weighted:** short-answer (398 Qs ≈ 20% vs ~5% on real tests), TFNG (617 Qs = 31%), multiple choice (487).
- **Under-weighted:** matching headings (only 10 of 152 passages — it's on nearly every real test), matching information (10), matching features (7), summary completion (9).
- **Writing:** GT Task 2 = 0 prompts (96 academic). GT users can't practice half their writing test.

### 2.3 Structural & wording findings

1. **Listening has no Part 1–4 model** (`listening_details` lacks a `part` column). Real test: P1 everyday dialogue → P2 everyday monologue → P3 academic discussion → P4 lecture, 10 Qs each.
2. **Mock assembly appears alphabetical, not curated** — a Part-1-style transactional call sits in a Part-3 slot; reading mock-2 difficulty runs easy→medium→easy instead of easy→hard.
3. **Instruction idiom inconsistent:** 40 groups use official "…AND/OR A NUMBER", 19 use non-official "…OR A NUMBER"; several TFNG instruction variants; one GT TFNG group has no TRUE/FALSE instruction at all.
4. **`instructions_html` null for ~530 groups** (all TFNG/YNNG/matching-headings; most MC) — instructions drift inside free-text `prompt`. This is the same field family as the July completion-render bug.
5. **122 completion questions have placeholder `prompt_text` ("Gap 10")**.
6. Listening mock timing: 4×600s caps vs real audio-driven pacing (~30 min + 10 transfer) — defensible but not authentic.
7. No full 4-skill mock; no writing/speaking mock sections despite schema support.

### 2.4 Top 10 content fixes by impact

1. Add Part 1–4 model to listening; tag all 45 passages; reorder mocks P1→P4.
2. Re-curate mock section selection/ordering (difficulty progression, canonical part sequence) in the seeding script.
3. Author GT Writing Task 2 prompts (currently zero).
4. Re-type the 5 map-labelling groups to `plan_map_diagram_label`; author plan/map/diagram content for listening + reading.
5. Rebalance reading: more matching-headings/information/features + summary completion; stop short-answer-heavy generation.
6. Add flow-chart completion and diagram-label content (both official, both at zero).
7. Standardize instruction idiom to official phrasing; fix the instruction-less GT TFNG group.
8. Build GT Reading Sections 1–2 (multi-text) + Section-3 discursive texts; ship a GT mock.
9. Ship a full 4-skill mock (speaking can chain existing P1/P2/P3 sets into an 11–14-min flow).
10. Backfill `instructions_html` for ~530 null groups and replace "Gap N" placeholders — prerequisite for programmatic wording QA.

### Sources

- ielts.org format pages: [Listening](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-listening) · [Academic Reading](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-reading) · [GT Reading](https://ielts.org/take-a-test/test-types/ielts-general-training-test/ielts-general-training-format-reading) · [Writing](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-writing) · [Speaking](https://ielts.org/take-a-test/test-types/ielts-academic-test/ielts-academic-format-speaking)

---

## Combined priority list

1. **Fix the tracker-death bug + restore webhook `purchase_success`** (revenue events dark since Jul 26; task chip spawned).
2. **Set `GA4_MP_API_SECRET` on Vercel** — one env var, activates the purchase backstop.
3. **Retention program:** lifecycle emails keyed off onboarding exam-date/target-band (7% week-2 retention is the growth ceiling; infra already exists).
4. **Listening Part 1–4 model + mock re-curation** (biggest authenticity payoff per hour).
5. **GT Writing Task 2 + reading type rebalance** (matching headings first).
6. Double down on what's working: speaking/writing SEO pages (top landers, top paywall sources) and PPP pricing (first Indian conversion at $3.99).
