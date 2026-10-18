import * as React from 'react';
import { CheckCircle2 } from 'lucide-react';
import AccessibleModal from '../AccessibleModal';
import QuickCheckout from '../billing/QuickCheckout';
import { FREE_PRACTICE_TESTS } from '../../../lib/practiceAllowance';
import { track } from '../../lib/analytics';

const POINTS = [
  'Unlimited marked Reading & Listening practice with band estimates',
  'Full AI Writing reports and Speaking scoring',
  'Timed full-length mock tests and band trends',
];

// Shown to a signed-in free learner submitting a NEW passage after the free
// allowance is used. Their answers stay autosaved on this page, so returning
// after checkout lets them submit and see the score.
export default function PracticeLimitDialog({ open, onClose, skill, slug, used }) {
  const [returnTo, setReturnTo] = React.useState('');
  React.useEffect(() => {
    if (open) setReturnTo(window.location.pathname);
  }, [open]);
  React.useEffect(() => {
    if (open) track('paywall_view', { source: 'practice_limit', skill, slug, used, limit: FREE_PRACTICE_TESTS });
  }, [open, skill, slug, used]);

  return (
    <AccessibleModal
      open={open}
      onClose={onClose}
      title={`You've used your ${FREE_PRACTICE_TESTS} free practice tests`}
      analyticsId="practice_limit_dialog"
    >
      <p className="text-sm text-muted-foreground">
        Your answers on this passage are saved. Upgrade to see your score now and keep practising
        without limits.
      </p>
      <ul className="mt-4 space-y-2">
        {POINTS.map((point) => (
          <li key={point} className="flex items-start gap-2 text-sm text-foreground">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            {point}
          </li>
        ))}
      </ul>
      {open ? (
        <QuickCheckout className="mt-6" upgrade="practice" stage="saved" returnTo={returnTo} source="practice_limit" />
      ) : null}
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Questions and answer keys stay free to read.{' '}
        <button type="button" onClick={onClose} className="font-semibold text-foreground underline">
          Not now
        </button>
      </p>
    </AccessibleModal>
  );
}
