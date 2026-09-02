import * as React from 'react';
import { Check, Loader2, Mail } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Checkbox } from '../../../components/ui/checkbox';
import { getSupabase } from '../../../lib/supabase';
import { track } from '../../lib/analytics';
import { MARKETING_PREF, STUDY_PLAN_PREF, withEmailConsent } from '../../lib/emailConsent';

// Email preferences, mirroring the two onboarding opt-ins. Both are plain
// checkboxes with the same wording used at signup — turning one off here is
// exactly what the one-click unsubscribe link in each email does.
export default function EmailPreferences({ user, profile, onProfileChange }) {
  const stored = profile.prefs || {};
  const [studyPlan, setStudyPlan] = React.useState(stored[STUDY_PLAN_PREF] === true);
  const [marketing, setMarketing] = React.useState(stored[MARKETING_PREF] === true);
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState({ type: '', message: '' });

  React.useEffect(() => {
    setStudyPlan(profile.prefs?.[STUDY_PLAN_PREF] === true);
    setMarketing(profile.prefs?.[MARKETING_PREF] === true);
  }, [profile]);

  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setFeedback({ type: '', message: '' });
    try {
      const prefs = withEmailConsent(profile.prefs, {
        studyPlan,
        marketing,
        source: 'dashboard',
      });
      const { data, error } = await getSupabase()
        .from('users')
        .update({ prefs })
        .eq('id', user.id)
        .select('prefs')
        .maybeSingle();
      if (error || !data) {
        setFeedback({ type: 'error', message: error?.message || 'Could not save your email preferences.' });
        return;
      }
      onProfileChange?.(data);
      track('email_prefs_saved', {
        study_plan_emails: studyPlan,
        marketing_emails: marketing,
        source: 'dashboard',
      });
      setFeedback({ type: 'success', message: 'Your email preferences are saved.' });
    } catch {
      setFeedback({ type: 'error', message: 'Could not save your email preferences. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      id="email-preferences"
      className="scroll-mt-24 rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_18px_55px_-38px_rgba(15,23,42,0.5)] sm:p-7"
    >
      <div className="flex gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
          <Mail className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-black tracking-tight text-slate-950">Email preferences</h2>
          <p className="mt-1 text-sm leading-5 text-slate-500">
            Choose what we send you. Account and purchase emails are always sent.
          </p>
        </div>
      </div>
      <form onSubmit={save} className="mt-7 space-y-5">
        <label
          htmlFor="pref-study-plan"
          className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4"
        >
          <Checkbox
            id="pref-study-plan"
            className="mt-0.5"
            checked={studyPlan}
            onCheckedChange={setStudyPlan}
          />
          <span className="text-sm text-slate-900">
            Study plan for my exam date
            <span className="mt-0.5 block text-xs leading-5 text-slate-500">
              Exam countdown, weekly progress, streak reminders, and follow-ups on a checkout you
              started.
            </span>
          </span>
        </label>
        <label
          htmlFor="pref-marketing"
          className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-4"
        >
          <Checkbox
            id="pref-marketing"
            className="mt-0.5"
            checked={marketing}
            onCheckedChange={setMarketing}
          />
          <span className="text-sm text-slate-900">
            Tips and offers by email
            <span className="mt-0.5 block text-xs leading-5 text-slate-500">
              The weekly guide, product news, and occasional offers.
            </span>
          </span>
        </label>
        {feedback.message && (
          <p
            role={feedback.type === 'error' ? 'alert' : 'status'}
            className={`rounded-xl px-3 py-2 text-xs font-semibold ${
              feedback.type === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'
            }`}
          >
            {feedback.message}
          </p>
        )}
        <div className="flex justify-end">
          <Button type="submit" variant="accent" disabled={busy} className="rounded-xl">
            {busy ? (
              <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
            ) : (
              <Check className="h-4 w-4" aria-hidden="true" />
            )}
            Save email preferences
          </Button>
        </div>
      </form>
    </section>
  );
}
