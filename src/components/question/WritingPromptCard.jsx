import * as React from 'react';
import NextLink from 'next/link';
import { PenLine, Sparkles } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { cn } from '../../lib/utils';
import { track } from '../../lib/analytics';
import { usePlan } from '../../lib/usePlan';
import { useFreeWritingSample } from '../../lib/useFreeWritingSample';
import { formatResultScore, writingPromptVariant } from '../../lib/writingUpsell';

// Post-result bridge from Reading/Listening into AI Writing scoring.
// Reading and Listening bring most of the traffic and used to end at the
// answer key; the free Writing report is what actually converts. Rendered
// inside the results summary (never inside a mock test — see
// writingPromptVariant).
export default function WritingPromptCard({
  skill,
  band = null,
  score = null,
  total = null,
  isMock = false,
  className,
}) {
  const { isPremium, loading: planLoading } = usePlan();
  const { loading: sampleLoading, used: freeSampleUsed } = useFreeWritingSample();

  const variant = writingPromptVariant({
    skill,
    isMock,
    isPremium,
    planLoading,
    freeSampleUsed,
    sampleLoading,
  });

  const shownRef = React.useRef(null);
  React.useEffect(() => {
    if (!variant || shownRef.current === variant) return;
    shownRef.current = variant;
    track('writing_prompt_shown', {
      source_skill: skill,
      band: typeof band === 'number' ? band : null,
      variant,
    });
  }, [band, skill, variant]);

  if (!variant) return null;

  const scoreLine = formatResultScore({ skill, band, score, total });
  const checkerHref = `/ielts-writing-checker?from=${skill}_result`;

  const copy =
    variant === 'upgrade'
      ? {
          body: 'Get full AI Writing reports with Pro — every criterion, corrected examples and a Band 8 rewrite, with up to 2 reports per day, 10 per week and 30 per month.',
          cta: 'See Pro plans',
          href: '/pricing?upgrade=writing',
        }
      : variant === 'premium'
        ? {
            body: 'Want your writing band? Paste an essay for a full AI examiner report — included in your Pro plan.',
            cta: 'Score an essay',
            href: checkerHref,
          }
        : {
            body: 'Want your writing band? Paste an essay — free report, no card. Four examiner criteria and what is holding you back.',
            cta: 'Get my writing band',
            href: checkerHref,
          };

  const onClick = () => {
    if (variant === 'upgrade') {
      // Upgrade clicks stay on the documented paywall funnel event so the
      // existing upsell-path query keeps working.
      track('paywall_upgrade_click', {
        source: `${skill}_result`,
        skill: 'writing',
        band: typeof band === 'number' ? band : null,
      });
      return;
    }
    track('writing_prompt_click', {
      source_skill: skill,
      band: typeof band === 'number' ? band : null,
      variant,
    });
  };

  return (
    <div
      className={cn(
        'rounded-lg border border-accent/40 bg-card p-4 shadow-sm sm:flex sm:items-center sm:justify-between sm:gap-4',
        className
      )}
    >
      <div className="flex gap-3">
        <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent sm:flex">
          {variant === 'upgrade' ? (
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          ) : (
            <PenLine className="h-5 w-5" aria-hidden="true" />
          )}
        </span>
        <div>
          <p className="text-sm font-bold text-foreground">{scoreLine}.</p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{copy.body}</p>
        </div>
      </div>
      <Button
        asChild
        variant="accent"
        className="mt-3 w-full shrink-0 sm:mt-0 sm:w-auto"
      >
        <NextLink href={copy.href} onClick={onClick} className="no-underline">
          {copy.cta}
        </NextLink>
      </Button>
    </div>
  );
}
