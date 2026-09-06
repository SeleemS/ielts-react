import * as React from 'react';
import NextLink from 'next/link';
import { Sparkles } from 'lucide-react';
import { usePlan } from '../../lib/usePlan';
import { useAuth } from '../../lib/auth';
import { useFreeWritingSample } from '../../lib/useFreeWritingSample';

// Small status line under the writing submit CTA so the free-sample state is
// visible BEFORE the user composes a whole essay and gets a 402: either the
// free score is still available (activation nudge) or it's spent and Pro will
// score this essay (expectation-setting, with the price inline).
export default function FreeSampleChip({ className = '' }) {
  const { user } = useAuth();
  const { isPremium, loading: planLoading } = usePlan();
  const { loading: sampleLoading, used } = useFreeWritingSample();

  if (planLoading || isPremium) return null;
  if (user?.id && (sampleLoading || used === null)) return null;

  return (
    <p
      className={`mx-auto max-w-md text-center text-xs font-medium text-muted-foreground ${className}`}
    >
      {!user?.id ? (
        <>
          <Sparkles className="mr-1 inline h-3.5 w-3.5 text-accent" aria-hidden="true" />
          Includes one free AI score — sign in when you submit to use it.
        </>
      ) : used ? (
        <>
          Your free sample is used — Pro scores this essay in full.{' '}
          <NextLink href="/pricing?upgrade=writing" className="font-semibold text-accent">
            See Pro plans
          </NextLink>
          .
        </>
      ) : (
        <>
          <Sparkles className="mr-1 inline h-3.5 w-3.5 text-accent" aria-hidden="true" />
          Your free AI score is available for this essay.
        </>
      )}
    </p>
  );
}
