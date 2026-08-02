import { createHmac, timingSafeEqual } from 'node:crypto';

const SITE_URL = 'https://www.ielts-bank.com';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function emailSecret() {
  return (
    process.env.EMAIL_UNSUBSCRIBE_SECRET ||
    process.env.NEWSLETTER_UNSUBSCRIBE_SECRET ||
    process.env.CRON_SECRET ||
    ''
  );
}

export function unsubscribeToken(email) {
  const secret = emailSecret();
  if (!secret) return '';
  return createHmac('sha256', secret).update(String(email).trim().toLowerCase()).digest('hex');
}

export function validUnsubscribeToken(email, token) {
  const expected = unsubscribeToken(email);
  if (!expected || !/^[a-f0-9]{64}$/.test(String(token || ''))) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(String(token)));
}

function shell({ eyebrow, title, intro, body, ctaLabel, ctaHref, footer = '' }) {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f1f5f9;color:#0f172a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 12px;background:#f1f5f9;">
      <tr><td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
          <tr><td style="padding:28px;">
            <p style="margin:0 0 8px;color:#047857;font-size:12px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;">${escapeHtml(eyebrow)}</p>
            <h1 style="margin:0;color:#0f172a;font-size:28px;line-height:1.2;">${escapeHtml(title)}</h1>
            <p style="margin:16px 0 0;color:#475569;font-size:16px;line-height:1.65;">${escapeHtml(intro)}</p>
            <div style="margin:22px 0;color:#334155;font-size:15px;line-height:1.65;">${body}</div>
            <a href="${escapeHtml(ctaHref)}" style="display:inline-block;border-radius:10px;background:#059669;color:#ffffff;padding:12px 18px;font-size:14px;font-weight:700;text-decoration:none;">${escapeHtml(ctaLabel)}</a>
            ${footer ? `<div style="margin-top:24px;border-top:1px solid #e2e8f0;padding-top:16px;color:#64748b;font-size:12px;line-height:1.6;">${footer}</div>` : ''}
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`;
}

function weeklyFooter(email) {
  const token = unsubscribeToken(email);
  if (!token) return 'You received this because you subscribed to IELTS Bank practice updates.';
  const href = `${SITE_URL}/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}&token=${token}`;
  return `You received this because you subscribed to IELTS Bank practice updates. <a href="${href}" style="color:#475569;">Unsubscribe</a>.`;
}

export function renderLifecycleEmail(row) {
  const payload = row.payload || {};
  switch (row.email_type) {
    case 'welcome_signup':
      return {
        subject: 'Your free IELTS Writing sample is ready',
        html: shell({
          eyebrow: 'Welcome to IELTS Bank',
          title: 'Start with the essay you care about',
          intro: 'Your account includes one lifetime AI Writing sample score.',
          body:
            '<p>Paste a Task 1 or Task 2 response to see your overall band and first scoring criterion in full. Your result is saved to your dashboard.</p>',
          ctaLabel: 'Get my free Writing score',
          ctaHref: `${SITE_URL}/ielts-writing-checker`,
        }),
      };
    case 'welcome_purchase':
      return {
        subject: 'You’re in — your Premium first-day checklist',
        html: shell({
          eyebrow: 'IELTS Bank Premium',
          title: 'Do these three things first',
          intro: 'Turn your new access into useful feedback today.',
          body:
            '<ol><li>Score the essay you already wrote.</li><li>Meet the live AI examiner.</li><li>Sit one timed mock to find your weakest section.</li></ol>',
          ctaLabel: 'Open my dashboard',
          ctaHref: `${SITE_URL}/dashboard`,
          footer: payload.access_expires_at
            ? `Your Exam Pass is active until ${escapeHtml(new Date(payload.access_expires_at).toLocaleDateString('en-US', { timeZone: 'UTC' }))}.`
            : 'You can manage or cancel your subscription from Billing settings.',
        }),
      };
    case 'weekly_digest':
      return {
        subject: payload.subject || 'Your weekly IELTS practice plan',
        html: shell({
          eyebrow: payload.plan === 'premium' ? 'Premium weekly practice' : 'This week at IELTS Bank',
          title: payload.title || 'One focused session beats a week of vague studying',
          intro: payload.intro || 'Use this week’s guide, then complete one timed practice set.',
          body: payload.body_html || '<p>Choose the skill with the biggest gap and practise it under a real time limit.</p>',
          ctaLabel: payload.cta_label || 'Start this week’s practice',
          ctaHref: payload.cta_href || `${SITE_URL}/dashboard`,
          footer: weeklyFooter(row.recipient_email),
        }),
      };
    case 'win_back':
      return {
        subject: 'Retaking IELTS? Your practice history is still here',
        html: shell({
          eyebrow: 'Welcome back',
          title: 'Pick up where you left off',
          intro: 'Your saved scores and attempts are still on your dashboard.',
          body:
            '<p>If you are preparing for a retake, return for one month and get 40% off the Monthly plan. The offer is validated against your canceled account at checkout.</p>',
          ctaLabel: 'Return with 40% off',
          ctaHref: `${SITE_URL}/pricing?offer=winback`,
          footer: `Offer applies to eligible returning subscribers and cannot be combined with another discount.<br>${weeklyFooter(row.recipient_email)}`,
        }),
      };
    case 'exam_countdown': {
      const days = Number(payload.days_left) || 0;
      const target = payload.target_band ? ` Band ${escapeHtml(String(payload.target_band))}` : '';
      return {
        subject:
          days <= 2
            ? 'Your IELTS test is almost here — final checklist'
            : `${days} days to your IELTS test`,
        html: shell({
          eyebrow: 'Exam countdown',
          title:
            days <= 2
              ? 'Two days out: sharpen, don’t cram'
              : `${days} days left — here’s what moves the needle`,
          intro: target
            ? `You set a target of${target}. Focused, timed practice between now and test day is what closes the gap.`
            : 'Focused, timed practice between now and test day is what moves your band most.',
          body:
            days <= 2
              ? '<p>Do one light timed set per skill, re-read your own past mistakes, and stop the night before. Your dashboard has your weakest areas listed.</p>'
              : days <= 7
                ? '<p>This week: one timed mock, then drill only the question types you missed. Review beats new material at this stage.</p>'
                : '<p>Sit one full timed mock now to find your weakest section while there is still time to fix it — then practise that section every other day.</p>',
          ctaLabel: days <= 7 ? 'Review my weak areas' : 'Sit a timed mock',
          ctaHref: days <= 7 ? `${SITE_URL}/dashboard` : `${SITE_URL}/mock-test`,
          footer: `You’re receiving this because you set your exam date in your IELTS Bank profile. ${weeklyFooter(row.recipient_email)}`,
        }),
      };
    }
    case 'checkout_abandoned': {
      const upgrade = ['writing', 'speaking', 'mock'].includes(payload.upgrade)
        ? payload.upgrade
        : '';
      return {
        subject: 'Your Pro checkout is still open (no charge was made)',
        html: shell({
          eyebrow: 'IELTS Bank Pro',
          title: 'Still thinking it over?',
          intro:
            upgrade === 'writing'
              ? 'Your essay is saved and waiting for its full report. No charge was made.'
              : upgrade === 'speaking'
                ? 'Your recording is saved and waiting for its score. No charge was made.'
                : 'You were one step from Pro — no charge was made.',
          body:
            '<p>Every plan includes a <strong>14-day money-back guarantee</strong>: if Pro doesn’t help, ask within 14 days and we refund it — no forms, no questions. Prices are already set for your region.</p>',
          ctaLabel: 'Pick up where I left off',
          ctaHref: `${SITE_URL}/pricing${upgrade ? `?upgrade=${upgrade}` : ''}`,
          footer: `You’re receiving this because you started a checkout on IELTS Bank. ${weeklyFooter(row.recipient_email)}`,
        }),
      };
    }
    case 'paywall_followup': {
      const skill = payload.skill === 'speaking' ? 'speaking' : 'writing';
      return {
        subject:
          skill === 'speaking'
            ? 'Your Speaking score is one step away'
            : 'Your full Writing report is one step away',
        html: shell({
          eyebrow: 'IELTS Bank Pro',
          title: skill === 'speaking' ? 'Hear what an examiner hears' : 'See what an examiner sees',
          intro:
            skill === 'speaking'
              ? 'Yesterday you reached the AI Speaking scorer. Your work is saved — Pro unlocks the full band breakdown.'
              : 'Yesterday you reached the full Writing report. Your essay is saved — Pro unlocks all four criteria.',
          body:
            '<p>Criterion-by-criterion bands, an examiner summary, and line-level corrections — anchored to the public IELTS descriptors, with a 14-day money-back guarantee.</p>',
          ctaLabel: 'Unlock my full feedback',
          ctaHref: `${SITE_URL}/pricing?upgrade=${skill}`,
          footer: weeklyFooter(row.recipient_email),
        }),
      };
    }
    case 'weekly_progress': {
      const sessions = Number(payload.sessions) || 0;
      const streak = Number(payload.streak) || 0;
      const skillLine = escapeHtml(payload.skills_line || '');
      const weakest = payload.weakest_type ? escapeHtml(String(payload.weakest_type)) : '';
      const body = sessions
        ? `<p>You practised <strong>${sessions} ${sessions === 1 ? 'session' : 'sessions'}</strong> this week${skillLine ? ` (${skillLine})` : ''}${streak > 1 ? ` and you’re on a <strong>${streak}-day streak</strong>` : ''}.</p>${
            weakest
              ? `<p>Your weakest question type right now is <strong>${weakest}</strong> — one focused set there is this week’s best use of 20 minutes.</p>`
              : '<p>Keep the rhythm: one timed set today beats three unfocused ones at the weekend.</p>'
          }`
        : '<p>No practice landed this week — that’s fine, streaks restart in one 10-minute session. Pick your weakest skill and do one timed set today.</p>';
      return {
        subject: sessions
          ? `Your week: ${sessions} ${sessions === 1 ? 'session' : 'sessions'}${streak > 1 ? `, ${streak}-day streak` : ''}`
          : 'Restart your IELTS practice with one 10-minute set',
        html: shell({
          eyebrow: 'Your weekly progress',
          title: sessions ? 'Here’s what your practice added up to' : 'One set gets you moving again',
          intro: 'Real numbers from your own attempts — not generic tips.',
          body,
          ctaLabel: payload.cta_label || 'Open my dashboard',
          ctaHref: payload.cta_href || `${SITE_URL}/dashboard`,
          footer: weeklyFooter(row.recipient_email),
        }),
      };
    }
    case 'streak_at_risk': {
      const streak = Number(payload.streak) || 0;
      return {
        subject: `Your ${streak}-day streak ends tonight`,
        html: shell({
          eyebrow: 'Streak at risk',
          title: `${streak} days of practice — don’t stop now`,
          intro: 'You practised yesterday but not yet today. One quick set keeps the streak alive.',
          body: '<p>Ten minutes is enough: one reading passage or one listening part counts. Momentum is the whole game in IELTS prep.</p>',
          ctaLabel: 'Do a quick set now',
          ctaHref: `${SITE_URL}/readingquestion`,
          footer: weeklyFooter(row.recipient_email),
        }),
      };
    }
    case 'day2_first_week_plan': {
      const practiced = payload.practiced_skill ? escapeHtml(String(payload.practiced_skill)) : '';
      const next = payload.next_skill ? escapeHtml(String(payload.next_skill)) : 'listening';
      return {
        subject: 'Your first-week IELTS plan (10–15 min a day)',
        html: shell({
          eyebrow: 'Day 2',
          title: 'Yesterday was a start. Here’s the week.',
          intro: practiced
            ? `You practised ${practiced} yesterday — good. The plan below rotates all four skills so nothing gets rusty.`
            : 'A short, repeatable plan beats a long, one-off session.',
          body: `<ol><li>Today: one timed ${next} set.</li><li>Tomorrow: your free AI Writing sample — paste any essay.</li><li>Day 4–5: one reading + one listening set.</li><li>Weekend: your first timed mock to get a baseline band.</li></ol>`,
          ctaLabel: `Practise ${next} now`,
          ctaHref: `${SITE_URL}/${next}question`,
          footer: `You’re receiving this because you created an IELTS Bank account this week. ${weeklyFooter(row.recipient_email)}`,
        }),
      };
    }
    default:
      throw new Error(`unknown lifecycle email type: ${row.email_type}`);
  }
}

export async function sendLifecycleEmail(row) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, reason: 'resend-not-configured' };
  const rendered = renderLifecycleEmail(row);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': row.idempotency_key,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || process.env.REPORT_FROM || 'IELTS Bank <hello@ielts-bank.com>',
      to: [row.recipient_email],
      subject: rendered.subject,
      html: rendered.html,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      sent: false,
      reason: `resend-${response.status}: ${String(result?.message || '').slice(0, 180)}`,
    };
  }
  return { sent: true, providerId: result.id || null };
}
