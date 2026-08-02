# LLM Visibility Review & Improvement Plan — 2026-08-02

Why this matters here: chatgpt.com is already our largest attributed acquisition source (297 visitors / 53 signups in the first 16 days), AI referral traffic converts far better than average industry-wide, and Claude/Gemini referrals are the fastest-growing segment. This plan is based on a sourced research pass (agent brief, Aug 2026) plus a hands-on audit of the live site.

## How assistants actually find and cite sites (evidence summary)

- **ChatGPT**: three agents — `OAI-SearchBot` builds the citation index, `ChatGPT-User` fetches live during conversations (73% of all AI-agent traffic in a Jul 2026 log study), `GPTBot` is training-only. ChatGPT citations still overlap Bing's top results ~87% (Seer, 2025), though OpenAI is building its own index.
- **Claude**: Brave Search-backed (~87% citation overlap with Brave results); agents `Claude-SearchBot` / `Claude-User` / `ClaudeBot`.
- **Perplexity**: own index (`PerplexityBot` / `Perplexity-User`); most Reddit-heavy engine (~47% of citations).
- **Google AI Overviews/Gemini**: powered by the normal Googlebot index; `Google-Extended` only controls training, not AI Overviews inclusion.
- **Copilot**: rides Bing directly.
- **Critical technical fact (confirmed, Vercel/MERJ study)**: AI crawlers execute **zero JavaScript**. Only server-rendered HTML is citable.
- **llms.txt**: no confirmed consumer; Ahrefs found 97% of llms.txt files get zero requests. Ours exists and is refreshed (cheap insurance), but it is not a lever. **.md page mirrors: skip** — Google now treats AI-only variants as cloaking, and markdown demand comes from coding agents, not consumer assistants.

## Audit of ielts-bank.com (what we verified today)

| Check | Status |
|---|---|
| Server-rendered content (no-JS crawlability) | **PASS** — question pages, instructions, blog, pricing all present in raw HTML (SSG) |
| robots.txt allows AI agents | **PASS** (upgraded today: explicit welcome for OAI-SearchBot, ChatGPT-User, Claude-SearchBot/User, Perplexity-User, Bingbot, Meta/Applebot tokens) |
| Bing indexation | **PARTIAL** — homepage, all section hubs, blog posts and individual passages are in (verified via DuckDuckGo/Bing index probes), but depth vs our 515 sitemap URLs is unverified; Bing Webmaster Tools not set up |
| IndexNow | **ADDED today** — self-issued key at /01984fdbff8e84fd2dcbf3a29275d300.txt + `scripts/indexnow-ping.mjs` (full-sitemap or per-URL submission) |
| llms.txt | **REFRESHED today** — live counts (2,500+ questions, 164 reading passages, GT mocks), all 12 question-type guide URLs, band estimator, "link don't quote" pricing note |
| Structured data | **GOOD hygiene** — WebSite+Organization (home), Article with datePublished/dateModified (blog), LearningResource+Breadcrumb (passages), FAQPage (pricing) |
| Page speed | **PASS** — static/ISR on Vercel CDN; no bot challenges on our side |
| AI-traffic measurement | **PARTIAL** — acquisition_source captures chatgpt.com referrals; no dedicated AI channel grouping; no crawler-log telemetry |

## Improvement plan (ranked by evidence strength × impact)

### Do now / done today
1. ✅ robots.txt explicit AI-agent welcome (confirmed mechanism).
2. ✅ IndexNow key + submission script — run `node scripts/indexnow-ping.mjs` after publishing content; gets Bing/Copilot freshness without waiting on crawl. (Google ignores IndexNow.)
3. ✅ llms.txt refresh (speculative but free).

### User actions (need your accounts, ~15 min)
4. **Bing Webmaster Tools**: bing.com/webmasters → "Import from Google Search Console" → confirm the sitemap is listed. Then check Index Explorer for coverage gaps vs our 515 URLs. This is the single highest-confidence lever for ChatGPT citations.
5. Optional: a citation tracker (Otterly ~$29/mo) watching ~20 core prompts ("best free IELTS practice", "check my IELTS essay free", "IELTS band calculator", per-question-type queries) across ChatGPT/Perplexity/AIO.

### Engineering next (small, high confidence)
6. **AI-channel analytics**: group acquisition_source matching `chatgpt.com|openai.com|perplexity.ai|claude.ai|gemini.google.com|copilot.microsoft.com` as an "AI assistants" channel in the /data dashboard; note OpenAI's `utm_source=chatgpt.com` convention. Mobile-app clicks often arrive as Direct, so treat Direct spikes after content pushes as partially AI.
7. **Crawler telemetry**: log OAI-SearchBot / ChatGPT-User / Claude-User / PerplexityBot hits per URL (middleware counter into activity_events or a lightweight table). ChatGPT-User hits on a page ≈ "ChatGPT is reading this page in answers" — our ground-truth feedback loop.

### Content strategy (correlational but consistently supported)
8. **Answer capsules**: on blog + question-type guide pages, phrase H2s as questions and follow each with a 1–2 sentence direct answer; put the core answer in the first 30% of the page (44% of ChatGPT citations come from the first 30%).
9. **Tables + listicles for AI-queried topics**: tables are cited ~2.5x more, listicles are 50–63% of citations. Priority pages: band-score conversion tables (expand /band-calculator content), "IELTS test format 2026" table page, "best free IELTS practice resources" honest listicle, IELTS vs TOEFL/PTE/Duolingo comparison, "IELTS Writing Task 2 topics 2026".
10. **Visible freshness**: show "Updated <date>" on guides/blog and keep `dateModified` truthful; refresh top pages quarterly (recently-updated content cited ~3.2x more on freshness-sensitive queries).
11. **Off-site brand mentions — the strongest measured correlate** (Ahrefs: YouTube r=0.737, brand mentions r=0.664, vs backlinks r=0.218; Perplexity is ~47% Reddit-sourced; the 2026 EdTech AI Visibility Index shows brand footprint beats legacy SEO):
    - Genuine participation in r/IELTS (answer questions; mention tools only where directly useful — no spam),
    - Short YouTube explainers (band descriptors, question-type strategies) with "IELTS-Bank" in title/description/transcript,
    - Get listed in "IELTS resources" roundups.

### Explicitly skipped (negative evidence)
- **.md/.txt page mirrors** — no consumer among assistant search bots; cloaking risk under Google's May 2026 policy.
- Further llms.txt investment beyond keeping counts fresh.
- Blocking any training bots — we want maximum model familiarity with the brand.

## Measurement targets
- Bing/DDG `site:` coverage of the 515 sitemap URLs (after BWT setup: Index Explorer count).
- Weekly AI-channel visitors/signups in /data (currently ~19 signups/wk from chatgpt.com).
- ChatGPT-User fetches per URL once crawler telemetry lands.
