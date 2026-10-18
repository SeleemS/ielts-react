import { writingReportPath } from '../../lib/writingReport';
import FeedbackPreview from './FeedbackPreview';
import { OFFER_VERSION } from '../../lib/monetizationExperiment';
import * as React from 'react';
import { CheckCircle2 } from 'lucide-react';
import QuickCheckout from './billing/QuickCheckout';
import { EXAM_PASS_DAYS, money } from '../lib/saleConfig';
import { useVisitorMarket } from '../lib/useVisitorMarket';
import { track } from '../lib/analytics';

// What Pro adds to the NEXT report, stated as concretely as the free result
// allows. `locked` comes from the free payload (reduceForFree in
// pages/api/score/writing.js): how many corrections were held back and whether
// a Band 8 rewrite exists. Counts describe THIS essay, which is why the copy is
// careful to say Pro applies to the next essay — an old sample never unlocks.
export function lockedValueLines(skill, locked = {}) {
  if (skill === 'speaking') {
    return [
      'Full Speaking reports on your next recordings',
      'Minutes with the live AI examiner for a full 3-part interview',
      'Timed full mock tests and band trends on your dashboard',
    ];
  }
  const corrections = Number.isFinite(locked.corrections) && locked.corrections > 0
    ? locked.corrections
    : 0;
  return [
    'Band and feedback on all four criteria',
    corrections > 0
      ? `Every corrected sentence — this essay had ${corrections} more we held back`
      : 'Every corrected sentence, not just the first',
    locked.rewrite
      ? 'A Band 8 rewrite of your weakest paragraph (one was written for this essay)'
      : 'A Band 8 rewrite of your weakest paragraph',
    'The examiner summary and an improvement plan in priority order',
    'Up to 2 full reports a day, 30 a month',
  ];
}

// Plain daily cost of a fixed-length pass — honest arithmetic, not an anchor.
export function perDay(price, days = EXAM_PASS_DAYS) {
  if (!Number.isFinite(price) || !days) return null;
  return money(Math.round((price / days) * 100) / 100);
}

// The single next step after a learner has received a free result. One
// primary action; the monthly option is information, not a competing button.
export default function ExamPassOffer({ skill, source, band, locked, reportId, children }) {
  const reportPath = skill === 'writing' ? writingReportPath(reportId) : null;
  const offerVersion = reportPath ? 'current_report_v4' : OFFER_VERSION;
  const element = React.useRef(null);
  const viewed = React.useRef(false);
  const passFirstRef = React.useRef(false);
  const { passFirst } = useVisitorMarket();
  const [returnTo, setReturnTo] = React.useState('');
  React.useEffect(() => {
    setReturnTo(window.location.pathname);
  }, []);
  React.useEffect(() => {
    const record = () => {
      if (viewed.current) return;
      viewed.current = true;
      track('exam_pass_offer_view', { skill, source, sku: 'exam_pass', stage: 'sample', offer_version: offerVersion, pass_first: passFirstRef.current });
    };
    if (typeof IntersectionObserver === 'undefined') { record(); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting && entry.intersectionRatio >= 0.5)) { record(); observer.disconnect(); }
    }, { threshold: 0.5 });
    if (element.current) observer.observe(element.current);
    return () => observer.disconnect();
  }, [skill, source, offerVersion]);
  passFirstRef.current = passFirst;
  const speaking = skill === 'speaking';
  const next = speaking ? 'recording' : 'essay';
  return (
    <section ref={element} aria-label={`${EXAM_PASS_DAYS}-day Exam Pass`} className="rounded-xl border-2 border-accent/40 bg-accent/[0.04] p-5 sm:p-6">
      <p className="text-xs font-bold uppercase tracking-wide text-accent">Your free sample is done</p>
      <h3 className="mt-2 text-lg font-bold text-foreground sm:text-xl">
        {reportPath ? 'Unlock the full feedback on this essay' : `Get the full report on your next ${next}`}
      </h3>
      {children ? <p className="mt-2 text-sm text-muted-foreground">{children}</p> : null}
      <p className="mt-3 text-sm font-semibold text-foreground">Pro adds to every report:</p>
      <ul className="mt-2 space-y-2">
        {lockedValueLines(skill, locked).map((line) => (
          <li key={line} className="flex items-start gap-2 text-sm text-foreground">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
            <span>{line}</span>
          </li>
        ))}
      </ul>

      <QuickCheckout
        className="mt-5"
        upgrade={skill}
        stage="sample"
        returnTo={reportPath || returnTo}
        source={source || 'score_tease'}
      />
      <p className="mt-3 text-xs leading-5 text-muted-foreground">
        {reportPath
          ? 'Every plan unlocks this saved report and includes continued practice. No resubmission needed. Scoring limits apply.'
          : `Pro applies to the ${next}s you score next — this free sample stays as it is. Scoring limits apply.`}
      </p>
      <FeedbackPreview skill={skill} />
    </section>
  );
}
