import * as React from 'react';
import { Gift } from 'lucide-react';
import ShareRow from '../ShareRow';
import { useReferral } from '../../lib/referral';

// Give-get referral card: "give a friend a free AI score, get one yourself."
// The share link carries the user's code; crediting happens server-side after
// the friend signs up (redeem_referral RPC — capped, self-referral-proof).
export default function InviteCard() {
  const { loading, code, credits, referredCount } = useReferral();

  if (loading || !code) return null;

  return (
    <section
      className="rounded-3xl border border-emerald-200 bg-emerald-50/60 p-5 sm:p-7"
      aria-labelledby="invite-heading"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">
            Invite a friend
          </p>
          <h2 id="invite-heading" className="mt-2 text-xl font-black tracking-tight text-slate-950">
            You both get a free AI score
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            When a friend joins with your link, you each get one extra AI Writing or
            Speaking score — up to 5 friends a month.
          </p>
        </div>
        <Gift className="h-5 w-5 shrink-0 text-emerald-600" />
      </div>
      <ShareRow
        className="mt-5 justify-start"
        label="Invite via"
        source="referral_invite"
        path={`/?ref=${code}`}
        text="I'm practising IELTS free at IELTS-Bank — join with my link and we both get a free AI score"
      />
      <p className="mt-3 text-xs text-slate-500">
        {referredCount > 0
          ? `${referredCount} ${referredCount === 1 ? 'friend has' : 'friends have'} joined with your link. `
          : ''}
        {credits > 0
          ? `You have ${credits} bonus ${credits === 1 ? 'score' : 'scores'} ready to use.`
          : ''}
      </p>
    </section>
  );
}
