import * as React from 'react';
import { useRouter } from 'next/router';
import { Sparkles } from 'lucide-react';
import AccessibleModal from './AccessibleModal';
import SaleCountdown from './SaleCountdown';
import { Button } from '../../components/ui/button';
import { useAuth } from '../lib/auth';
import { usePlan } from '../lib/usePlan';
import { track } from '../lib/analytics';
import { getLocalPref, setLocalPref, loadUserPref, saveUserPref } from '../lib/prefs';
import { PRACTICE_EVENT } from '../lib/practiceActivity';
import { SALE, isSaleLive, saleEndsAtMs } from '../lib/saleConfig';
import { trackSelectPromotion, trackViewPromotion } from '../lib/ecommerce';

// "Every few questions" reminder of the Summer Sale, shown to signed-in,
// non-premium users while the sale is live. Mounted once globally in _app.js.
//
// Cadence (per browser session): first at FIRST_AT graded submits, then every
// REPEAT_EVERY after a dismissal, capped at MAX_PER_SESSION. "Don't remind me"
// persists across sessions/devices via prefs.js. Never interrupts the pricing/
// billing pages or a timed mock.

const FIRST_AT = 4;
const REPEAT_EVERY = 8;
const MAX_PER_SESSION = 3;
const SHOWN_KEY = 'ielts-sale-reminder-shown';
const MUTE_PREF = 'saleReminderMuted';

// Pages where a sale nudge would be redundant or disruptive.
const EXCLUDED_PREFIXES = ['/pricing', '/billing', '/mock'];

function isExcludedPath(pathname) {
  return EXCLUDED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function getSessionShown() {
  if (typeof window === 'undefined') return 0;
  try {
    return Number(window.sessionStorage.getItem(SHOWN_KEY) || 0) || 0;
  } catch {
    return 0;
  }
}

function setSessionShown(value) {
  try {
    window.sessionStorage.setItem(SHOWN_KEY, String(value));
  } catch {
    /* non-fatal */
  }
}

// count needed for the (shown+1)-th appearance.
function thresholdFor(shown) {
  return FIRST_AT + shown * REPEAT_EVERY;
}

export default function OfferReminderModal() {
  const router = useRouter();
  const { user } = useAuth();
  const { isPremium, loading: planLoading } = usePlan();
  const [open, setOpen] = React.useState(false);
  const [muted, setMuted] = React.useState(false);

  // Latest decision inputs, read by the (single, stable) event listener.
  const stateRef = React.useRef({});
  stateRef.current = {
    open,
    muted,
    isPremium,
    planLoading,
    pathname: router.pathname,
    userId: user?.id || null,
  };

  // Resolve the persistent "don't remind me" flag: local first (instant), then
  // the signed-in user's cross-device pref.
  React.useEffect(() => {
    if (getLocalPref(MUTE_PREF)) {
      setMuted(true);
      return;
    }
    if (!user?.id) return;
    let active = true;
    loadUserPref(user.id, MUTE_PREF)
      .then((value) => {
        if (active && value) {
          setMuted(true);
          setLocalPref(MUTE_PREF, true);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user?.id]);

  // Single listener for the whole session — reads current state via stateRef so
  // it never goes stale and never misses an event during a re-subscribe.
  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const onActivity = (event) => {
      const s = stateRef.current;
      if (s.open || s.muted || s.planLoading || s.isPremium || !s.userId) return;
      if (isExcludedPath(s.pathname)) return;
      if (!isSaleLive()) return;
      const shown = getSessionShown();
      if (shown >= MAX_PER_SESSION) return;
      const count = Number(event?.detail?.count || 0);
      if (count < thresholdFor(shown)) return;
      setSessionShown(shown + 1);
      setOpen(true);
      track('sale_reminder_shown', { count, appearance: shown + 1 });
      trackViewPromotion('reminder_modal');
    };
    window.addEventListener(PRACTICE_EVENT, onActivity);
    return () => window.removeEventListener(PRACTICE_EVENT, onActivity);
  }, []);

  const close = React.useCallback(() => setOpen(false), []);

  const handleSeeOffer = React.useCallback(() => {
    track('sale_reminder_click', { destination: 'pricing' });
    trackSelectPromotion('reminder_modal');
    setOpen(false);
    void router.push('/pricing');
  }, [router]);

  const handleLater = React.useCallback(() => {
    track('sale_reminder_dismiss', {});
    setOpen(false);
  }, []);

  const handleMute = React.useCallback(() => {
    track('sale_reminder_mute', {});
    setMuted(true);
    setLocalPref(MUTE_PREF, true);
    if (user?.id) void saveUserPref(user.id, MUTE_PREF, true);
    setOpen(false);
  }, [user?.id]);

  if (!open) return null;

  return (
    <AccessibleModal open={open} onClose={handleLater} title={`☀️ ${SALE.name} is on`} analyticsId="sale_reminder">
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-6 text-muted-foreground">
          You&apos;re putting in the practice — make it count. Unlock full AI Writing &amp; Speaking
          scores, a live AI examiner, and timed mock tests. {SALE.tagline}
        </p>

        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
          <p className="text-xs font-bold uppercase tracking-wide text-amber-900 dark:text-amber-200">
            Offer ends {new Date(SALE.endsAt).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
          </p>
          <div className="mt-2.5">
            <SaleCountdown targetMs={saleEndsAtMs()} size="sm" onExpire={close} />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <Button variant="accent" className="w-full" onClick={handleSeeOffer}>
            <Sparkles className="h-4 w-4" />
            See the {SALE.name}
          </Button>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={handleLater}
              className="rounded px-1 py-1 text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Maybe later
            </button>
            <button
              type="button"
              onClick={handleMute}
              className="rounded px-1 py-1 text-xs font-medium text-muted-foreground/80 underline-offset-4 hover:text-foreground hover:underline"
            >
              Don&apos;t remind me
            </button>
          </div>
        </div>
      </div>
    </AccessibleModal>
  );
}
