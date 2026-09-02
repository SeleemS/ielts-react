import * as React from 'react';
import { BellRing, Loader2, Share } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Label } from '../../../components/ui/label';
import { Select } from '../../../components/ui/select';
import { getSupabase } from '../../../lib/supabase';
import { getSessionAccess } from '../../lib/sessionAccess';
import { track } from '../../lib/analytics';
import {
  currentSubscription,
  disableReminders,
  enableReminders,
  iosNeedsInstall,
  permissionState,
  pushSupported,
  updateReminderHour,
} from '../../lib/push';

// "Daily reminder" card. The service worker is registered and the browser
// permission prompt raised ONLY by the enable click below — never on load.
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const DEFAULT_HOUR = 19;

function hourLabel(hour) {
  const suffix = hour < 12 ? 'am' : 'pm';
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:00 ${suffix}`;
}

export default function DailyReminderCard({ userId }) {
  const [state, setState] = React.useState({ status: 'loading', enabled: false, hour: DEFAULT_HOUR });
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState({ type: '', message: '' });

  const supported = pushSupported();
  const needsInstall = supported ? iosNeedsInstall() : false;

  // Read-only sync of what this browser + this account already have. Uses
  // getRegistration, so it never registers a worker by itself.
  React.useEffect(() => {
    let active = true;
    (async () => {
      if (!supported || !userId) {
        if (active) setState({ status: 'ready', enabled: false, hour: DEFAULT_HOUR });
        return;
      }
      const subscription = await currentSubscription();
      let row = null;
      if (subscription?.endpoint) {
        const { data } = await getSupabase()
          .from('push_subscriptions')
          .select('endpoint, enabled, reminder_hour_local')
          .eq('endpoint', subscription.endpoint)
          .maybeSingle();
        row = data || null;
      }
      if (!active) return;
      setState({
        status: 'ready',
        enabled: Boolean(subscription && row?.enabled && permissionState() === 'granted'),
        hour: Number.isInteger(row?.reminder_hour_local) ? row.reminder_hour_local : DEFAULT_HOUR,
      });
    })().catch(() => {
      if (active) setState({ status: 'ready', enabled: false, hour: DEFAULT_HOUR });
    });
    return () => {
      active = false;
    };
  }, [supported, userId]);

  async function withToken(action) {
    const { accessToken } = await getSessionAccess(getSupabase);
    if (!accessToken) {
      setFeedback({ type: 'error', message: 'Please sign in again to change reminders.' });
      return null;
    }
    return action(accessToken);
  }

  async function handleEnable() {
    setBusy(true);
    setFeedback({ type: '', message: '' });
    try {
      const result = await withToken((accessToken) =>
        enableReminders({ accessToken, reminderHour: state.hour })
      );
      if (!result) return;
      if (!result.ok) {
        setFeedback({
          type: 'error',
          message:
            result.reason === 'permission-denied'
              ? 'Your browser is blocking notifications for this site. Allow them in site settings, then try again.'
              : result.reason === 'ios-install-required'
                ? 'On iPhone and iPad, add IELTS Bank to your Home Screen first.'
                : 'Could not turn on reminders in this browser.',
        });
        track('push_enable_failed', { reason: result.reason });
        return;
      }
      setState((current) => ({ ...current, enabled: true }));
      setFeedback({ type: 'success', message: `Daily reminder set for ${hourLabel(state.hour)}.` });
      track('push_enabled', { reminder_hour: state.hour });
    } catch {
      setFeedback({ type: 'error', message: 'Could not turn on reminders. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleDisable() {
    setBusy(true);
    setFeedback({ type: '', message: '' });
    try {
      await withToken((accessToken) => disableReminders({ accessToken }));
      setState((current) => ({ ...current, enabled: false }));
      setFeedback({ type: 'success', message: 'Daily reminders are off.' });
      track('push_disabled', {});
    } catch {
      setFeedback({ type: 'error', message: 'Could not turn reminders off. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  async function handleHourChange(event) {
    const hour = Number(event.target.value);
    setState((current) => ({ ...current, hour }));
    if (!state.enabled) return;
    setBusy(true);
    try {
      await withToken((accessToken) => updateReminderHour({ accessToken, reminderHour: hour }));
      setFeedback({ type: 'success', message: `Daily reminder moved to ${hourLabel(hour)}.` });
      track('push_time_changed', { reminder_hour: hour });
    } catch {
      setFeedback({ type: 'error', message: 'Could not save the new time. Please try again.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_18px_55px_-38px_rgba(15,23,42,0.5)] sm:p-6">
      <div className="flex gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
          <BellRing className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-black tracking-tight text-slate-950">Daily reminder</h2>
          <p className="mt-1 text-sm leading-5 text-slate-500">
            One notification a day, at your local time, linking straight to the questions you
            missed. No other notifications, ever.
          </p>
        </div>
      </div>

      {!supported ? (
        <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">
          This browser doesn’t support web notifications. Your study-plan emails still work.
        </p>
      ) : needsInstall ? (
        <p className="mt-5 flex items-start gap-2 rounded-2xl bg-slate-50 p-4 text-xs leading-5 text-slate-500">
          <Share className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <span>
            On iPhone and iPad, notifications work once IELTS Bank is on your Home Screen: tap
            Share, then <strong>Add to Home Screen</strong>, and open it from there.
          </span>
        </p>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2">
              <Label htmlFor="reminder-hour">Reminder time</Label>
              <Select
                id="reminder-hour"
                value={String(state.hour)}
                onChange={handleHourChange}
                disabled={busy || state.status === 'loading'}
                className="h-11 w-40 rounded-xl"
              >
                {HOURS.map((hour) => (
                  <option key={hour} value={hour}>
                    {hourLabel(hour)}
                  </option>
                ))}
              </Select>
            </div>
            <Button
              type="button"
              variant={state.enabled ? 'outline' : 'accent'}
              disabled={busy || state.status === 'loading'}
              onClick={state.enabled ? handleDisable : handleEnable}
              className="h-11 rounded-xl"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
              ) : (
                <BellRing className="h-4 w-4" aria-hidden="true" />
              )}
              {state.enabled ? 'Turn off reminders' : 'Enable daily reminder'}
            </Button>
          </div>
          <p className="text-xs leading-5 text-slate-500">
            Your device time zone is used, so the reminder stays at {hourLabel(state.hour)} local
            even after a clock change.
          </p>
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
        </div>
      )}
    </section>
  );
}
