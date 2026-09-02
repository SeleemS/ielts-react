// lib/pushSchedule.js
// "Is it 7pm where this person is?" — the only tricky part of the daily
// reminder, kept pure and unit-tested (tests/push-schedule.test.js).
//
// The hourly cron runs at a fixed UTC minute; each subscription fires on the
// single UTC hour that maps to its chosen local hour. Zone handling:
//
//   * time_zone (IANA, captured from Intl in the browser) is authoritative and
//     survives DST changes, because the offset is recomputed per instant.
//   * tz_offset_minutes (minutes EAST of UTC at subscribe time) is the fallback
//     for browsers with no resolvable zone. It is stale by one hour for half
//     the year in DST countries — accepted, and never used when a zone exists.
//
// One notification per local calendar day is enforced by comparing the local
// date of `now` with the local date of last_sent_at, so a retry, a redeploy,
// or a cron double-run cannot double-send.

const HOUR_FORMATTERS = new Map();

function partsIn(timeZone, date) {
  let formatter = HOUR_FORMATTERS.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
    });
    HOUR_FORMATTERS.set(timeZone, formatter);
  }
  const parts = {};
  for (const { type, value } of formatter.formatToParts(date)) parts[type] = value;
  return parts;
}

function validZone(timeZone) {
  if (typeof timeZone !== 'string' || !timeZone.trim()) return null;
  try {
    partsIn(timeZone, new Date(0));
    return timeZone;
  } catch {
    return null;
  }
}

// { hour, dateKey } for an instant, in the subscription's own zone.
export function localClock(subscription, now = new Date()) {
  const date = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime())) return null;
  const zone = validZone(subscription?.time_zone);
  if (zone) {
    const parts = partsIn(zone, date);
    // Intl renders midnight as hour "24" in some ICU versions.
    const hour = Number(parts.hour) % 24;
    return { hour, dateKey: `${parts.year}-${parts.month}-${parts.day}` };
  }
  const offset = Number(subscription?.tz_offset_minutes);
  const shifted = new Date(date.getTime() + (Number.isFinite(offset) ? offset : 0) * 60000);
  return {
    hour: shifted.getUTCHours(),
    dateKey: shifted.toISOString().slice(0, 10),
  };
}

export const MAX_PUSH_FAILURES = 5;

// Why a subscription is or isn't due right now. Reasons are logged by the
// cron, which makes a "nothing sent" run explainable.
export function reminderDue(subscription, now = new Date()) {
  if (!subscription?.enabled) return { due: false, reason: 'disabled' };
  if (Number(subscription.failures || 0) >= MAX_PUSH_FAILURES) {
    return { due: false, reason: 'too-many-failures' };
  }
  const clock = localClock(subscription, now);
  if (!clock) return { due: false, reason: 'bad-clock' };
  const wanted = Number(subscription.reminder_hour_local);
  if (!Number.isInteger(wanted) || wanted < 0 || wanted > 23) {
    return { due: false, reason: 'bad-reminder-hour' };
  }
  if (clock.hour !== wanted) return { due: false, reason: 'wrong-hour' };
  if (subscription.last_sent_at) {
    const sent = localClock(subscription, new Date(subscription.last_sent_at));
    if (sent && sent.dateKey === clock.dateKey) return { due: false, reason: 'already-sent-today' };
  }
  return { due: true, reason: 'due', localDateKey: clock.dateKey };
}

export function dueReminders(subscriptions, now = new Date()) {
  return (subscriptions || []).filter((subscription) => reminderDue(subscription, now).due);
}

// Copy for the notification itself. Streak-forward, because the streak is the
// reason to come back today specifically.
export function reminderNotification({ streak = 0, reviewCount = 0 } = {}) {
  const title =
    streak > 0
      ? `Your daily IELTS question is ready · 🔥 ${streak}-day streak`
      : 'Your daily IELTS question is ready';
  const body =
    streak > 0
      ? reviewCount > 0
        ? `Practise today to keep your ${streak}-day streak — ${reviewCount} ${reviewCount === 1 ? 'question' : 'questions'} waiting in your review queue.`
        : `Practise today to keep your ${streak}-day streak. One 10-minute set is enough.`
      : reviewCount > 0
        ? `${reviewCount} ${reviewCount === 1 ? 'question' : 'questions'} you missed are waiting — clear them in 10 minutes.`
        : 'One 10-minute set today starts your streak.';
  // The mistake-review pool is the highest-value practice; with an empty pool
  // the link goes to the reading index instead of a "nothing to review" page.
  const url = reviewCount > 0 ? '/review?src=push' : '/readingquestion?src=push';
  return { title, body, url };
}
