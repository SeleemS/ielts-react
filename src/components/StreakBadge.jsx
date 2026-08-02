import * as React from 'react';
import NextLink from 'next/link';
import { Flame } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useStreak } from '../lib/useStreak';

// Navbar flame: the signed-in user's current practice streak, linking to the
// dashboard. Renders nothing while loading, signed out, or at streak 0 so the
// chrome stays quiet for new users. Data is real attempts only.
export default function StreakBadge({ className = '' }) {
  const { user } = useAuth();
  const { loading, streak } = useStreak();

  if (!user?.id || loading || streak < 1) return null;

  return (
    <NextLink
      href="/dashboard"
      className={`inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-1 text-xs font-bold text-amber-600 no-underline transition-colors hover:bg-amber-500/20 dark:text-amber-400 ${className}`}
      title={`${streak}-day practice streak`}
      aria-label={`${streak}-day practice streak`}
    >
      <Flame className="h-3.5 w-3.5" aria-hidden="true" />
      {streak}
    </NextLink>
  );
}
