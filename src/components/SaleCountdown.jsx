import * as React from 'react';
import { cn } from '../lib/utils';

// Live countdown to a target timestamp. Client-only: it renders a stable
// placeholder on the server / first paint (mounted === false) so the ticking
// numbers never cause a hydration mismatch on the SSR pricing page.
export function useCountdown(targetMs) {
  const [mounted, setMounted] = React.useState(false);
  const [now, setNow] = React.useState(() => targetMs);

  React.useEffect(() => {
    setMounted(true);
    setNow(Date.now());
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const total = Math.max(0, targetMs - now);
  const seconds = Math.floor(total / 1000);
  return {
    mounted,
    total,
    days: Math.floor(seconds / 86400),
    hours: Math.floor((seconds % 86400) / 3600),
    minutes: Math.floor((seconds % 3600) / 60),
    seconds: seconds % 60,
  };
}

const pad = (n) => String(n).padStart(2, '0');

// Compact, self-contained countdown. Fires onExpire once when it reaches zero.
// `size="sm"` is the modal variant; default is the pricing-hero variant.
export default function SaleCountdown({ targetMs, onExpire, size = 'md', className }) {
  const { mounted, total, days, hours, minutes, seconds } = useCountdown(targetMs);
  const firedRef = React.useRef(false);

  React.useEffect(() => {
    if (mounted && total <= 0 && !firedRef.current) {
      firedRef.current = true;
      onExpire?.();
    }
  }, [mounted, total, onExpire]);

  // Reserve space on the server / before mount so layout doesn't jump.
  const units = mounted
    ? [
        { label: 'days', value: days },
        { label: 'hrs', value: hours },
        { label: 'min', value: minutes },
        { label: 'sec', value: seconds },
      ]
    : [
        { label: 'days', value: 0 },
        { label: 'hrs', value: 0 },
        { label: 'min', value: 0 },
        { label: 'sec', value: 0 },
      ];

  if (mounted && total <= 0) return null;

  const box =
    size === 'sm'
      ? 'min-w-[2.5rem] rounded-md px-1.5 py-1'
      : 'min-w-[3.25rem] rounded-lg px-2 py-1.5';
  const num = size === 'sm' ? 'text-base' : 'text-xl sm:text-2xl';

  return (
    <div
      className={cn('flex items-center gap-1.5 sm:gap-2', className)}
      role="timer"
      aria-label="Time left in the current offer"
      suppressHydrationWarning
    >
      {units.map((unit, index) => (
        <React.Fragment key={unit.label}>
          {index > 0 ? (
            <span className={cn('font-bold text-amber-900/40 dark:text-amber-100/40', size === 'sm' ? 'text-sm' : 'text-lg')} aria-hidden="true">
              :
            </span>
          ) : null}
          <div className={cn('flex flex-col items-center bg-white/70 dark:bg-white/10', box)}>
            <span className={cn('font-extrabold tabular-nums leading-none text-amber-950 dark:text-amber-50', num)} suppressHydrationWarning>
              {pad(unit.value)}
            </span>
            <span className={cn('mt-0.5 font-semibold uppercase tracking-wide text-amber-900/70 dark:text-amber-100/70', size === 'sm' ? 'text-[9px]' : 'text-[10px]')}>
              {unit.label}
            </span>
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}
