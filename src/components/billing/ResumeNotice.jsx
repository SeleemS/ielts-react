import * as React from 'react';
import { useRouter } from 'next/router';

// Friendly notice for a learner bounced here from the recovery email's resume
// link (/billing/resume -> /pricing or /dashboard?resume=<code>). The codes
// come from lib/checkoutResume.js; unknown codes render nothing.
export const RESUME_NOTICES = {
  unavailable: 'That checkout link isn’t valid any more, so we didn’t reopen it. Pick a plan below to start a fresh checkout — no charge was made.',
  expired: 'That checkout link has expired. Your plan choices are below — no charge was made.',
  plan_changed: 'The plan in that checkout link is no longer on sale. Here are today’s plans — no charge was made.',
  offer_ended: 'The offer in that checkout link has ended, so we didn’t reopen it at the old price. Today’s prices are below — no charge was made.',
  already_premium: 'Good news — you already have Pro, so there’s nothing left to pay. We retired your old checkout link so you can’t be charged twice.',
  already_exam_pass: 'Your pass is still active, so we didn’t open a second one. You can switch to a subscription from the pricing page whenever you like.',
};

export function resumeNoticeText(code) {
  return typeof code === 'string' && Object.hasOwn(RESUME_NOTICES, code) ? RESUME_NOTICES[code] : '';
}

export default function ResumeNotice({ className = '' }) {
  const router = useRouter();
  const text = resumeNoticeText(router?.query?.resume);
  if (!text) return null;
  return (
    <div
      role="status"
      className={`rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium leading-6 text-emerald-950 ${className}`}
    >
      {text}
    </div>
  );
}
