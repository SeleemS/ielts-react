# Analytics tracking contract

IELTS-Bank sends product analytics through one client helper to both:

1. Google Analytics 4 via `gtag('event', ...)`.
2. The private Supabase `activity_events` table via the origin-checked,
   rate-limited `/api/track` endpoint.

The two destinations receive the same `client_event_id`, `session_id`,
`page_view_id`, event name, timestamp, path, and event properties. This makes
GA acquisition reports reconcilable with first-party user journeys.

## Coverage

`InteractionTelemetry` uses delegated browser events, so controls rendered now
or later by React are covered without adding an `onClick` wrapper to every
component. The static audit verifies that every JSX interaction handler maps to
a captured semantic control, role, or explicit analytics identifier.

Run:

```bash
npm run audit:analytics
```

Current audited surface:

- 382 interactive JSX elements
- 11 forms
- 7 dialogs/popups
- 139 explicit product-event calls
- 1 uncaptured interaction handler (`src/components/datadash/GlobeStage.jsx`
  drag surface — pre-existing; add `data-analytics-skip` or a semantic role)
- 0 parser failures

The generic capture layer records:

| Event | Meaning |
| --- | --- |
| `ui_interaction` | Button, link, menu, tab, switch, CTA, table-row, or similar activation |
| `field_change` | Privacy-safe field completion or selection; never the entered value |
| `form_submit` | A valid form submission attempt |
| `question_answer` | A practice/estimator answer change without answer text or selected option |
| `modal_open` / `modal_close` | Dialog or popup visibility and open duration |
| `ui_feedback` | A non-empty user-facing error alert |
| `page_view` | Initial load and SPA route completion |

Internal framework/API/Google-tag paths under `/api`, `/_next`, and `/gt` are
discarded in both the client and ingestion endpoint. They are infrastructure,
not user journeys.

Text answers emit after an 800 ms pause or on change/blur. This captures
abandonment without sending every keystroke or the answer itself.

Explicit domain events remain the source of truth for outcomes and funnel
milestones, including auth, attempts, AI scoring, estimator, audio,
newsletter, paywall, checkout, purchase, subscription, realtime-examiner, and
push-reminder events.

### Server-emitted events

Two events are written server-side, with `anon_id` set to a synthetic
`push:<user_id>` (the same convention as `billing:<user_id>`) because no
browser session exists at that moment:

| Event | Written by | Props |
| --- | --- | --- |
| `push_sent` | `/api/cron/push-reminders` after the push service accepts a daily reminder | `source`, `notification_id`, `streak`, `destination` |
| `push_click` | `/api/push/event`, beaconed by the service worker's `notificationclick` | `source`, `notification_id`, `streak` |

`/api/push/event` is not origin-checked (a service worker may send no Origin);
it authenticates by requiring the posted push endpoint to match an existing
`push_subscriptions` row, and is IP rate-limited like `/api/track`.

### Writing-activation events

The free AI Writing report is the site's primary conversion driver, so the
paths into it are instrumented end to end:

| Event | Emitted by | Key props |
| --- | --- | --- |
| `hero_essay_submit` | Homepage hero paste box | `source`, `task_type`, `chars`, `word_count` |
| `writing_prompt_shown` | Post-result card after a Reading/Listening submission | `source_skill`, `band`, `variant` |
| `writing_prompt_click` | The same card's CTA, free and Pro variants | `source_skill`, `band`, `variant` |
| `pro_preview_shown` | Free Writing report rendering its masked Pro preview | `source`, `skill`, `band`, `corrections_shown`, `corrections_locked`, `rewrite_locked` |

`writing_prompt_shown`'s `variant` is `free` (the sample is still available),
`upgrade` (spent, no Pro) or `premium` (Pro subscriber). The `upgrade` variant's
CTA deliberately emits the existing `paywall_upgrade_click` rather than
`writing_prompt_click`, so the upsell-path query below keeps counting it.

## Required journey fields

`activity_events` stores:

- `anon_id`: durable anonymous browser identity.
- `user_id`: authenticated identity; earlier anonymous events are stitched on
  login.
- `session_id`: per-tab session.
- `page_view_id`: one SPA page view and its downstream interactions.
- `client_event_id`: deduplication key shared with GA4.
- `occurred_at`: validated client time.
- `created_at`: trusted server receipt time.
- `event`, `skill`, `slug`, `country`, and privacy-filtered `props`.

`props.event_sequence` provides stable client ordering within a session.
`props.acquisition_source` is first-touch attribution; `props.source` is the
in-product placement that emitted the event. They must not be combined.

## Privacy rules

- Never send essays, recordings, transcripts, free-text responses, email
  addresses, passwords, auth tokens, or raw answer values.
- Text question events may include `answer_length`, never the answer.
- Generic fields record only identifiers, control type, checked/has-value
  state, form, surface, and destination.
- The server drops suspicious keys matching essay, transcript, response,
  audio, token, or email and caps property count and string length.
- Browsers cannot query or insert directly into `activity_events`; RLS is
  enabled and table access is service-role-only.

## Analysis recipes

Ordered user journey:

```sql
select
  occurred_at,
  event,
  props->>'surface' as surface,
  props->>'element_id' as element_id,
  props->>'interaction' as interaction,
  props->>'event_sequence' as sequence
from public.activity_events
where session_id = :session_id
order by
  (props->>'event_sequence')::bigint nulls last,
  occurred_at,
  created_at;
```

Pain points by surface:

```sql
select
  props->>'surface' as surface,
  props->>'feedback_id' as feedback,
  count(*) as occurrences,
  count(distinct session_id) as affected_sessions
from public.activity_events
where event = 'ui_feedback'
  and created_at >= now() - interval '30 days'
group by 1, 2
order by occurrences desc;
```

Upsell path:

```sql
select
  event,
  props->>'source' as source,
  count(*) as events,
  count(distinct coalesce(user_id::text, anon_id)) as people
from public.activity_events
where event in (
  'premium_gate',
  'paywall_view',
  'paywall_upgrade_click',
  'checkout_start',
  'purchase_success',
  'subscription_activated'
)
  and created_at >= now() - interval '30 days'
group by 1, 2
order by 1, 3 desc;
```

Question abandonment:

```sql
with sessions as (
  select
    session_id,
    slug,
    count(*) filter (where event = 'question_answer') as answer_changes,
    bool_or(event = 'attempt_submit') as submitted
  from public.activity_events
  where created_at >= now() - interval '30 days'
    and session_id is not null
    and slug is not null
  group by 1, 2
)
select slug, count(*) as abandoned_sessions, avg(answer_changes) as avg_answer_changes
from sessions
where answer_changes > 0 and not submitted
group by slug
order by abandoned_sessions desc;
```
