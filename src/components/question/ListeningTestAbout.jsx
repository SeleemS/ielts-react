import React from 'react';
import NextLink from 'next/link';
import { LISTENING_PARTS } from '../../../lib/listeningQuestionTypes';
import { questionTypeLabel, tipsForPassage } from '../../../lib/answerKeys';

// Server-rendered context for a Listening practice page. The test itself is
// audio plus answer fields, so without this block a crawler sees little more
// than form labels. Everything here is derived from the passage data and the
// part guides in lib/listeningQuestionTypes.js — no answers, no transcript.
export function listeningTestFacts(passage) {
  const groups = passage?.groups || [];
  const questionCount = groups.reduce((sum, g) => sum + (g.questions?.length || 0), 0);
  const typeLabels = [...new Set(groups.map((g) => questionTypeLabel(g.questionType)).filter(Boolean))];
  const part = Object.values(LISTENING_PARTS).find((p) => p.part === passage?.listeningPart) || null;
  return { questionCount, typeLabels, part };
}

function joinLabels(labels) {
  if (labels.length <= 1) return labels[0] || '';
  return `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
}

export default function ListeningTestAbout({ passage, className = '' }) {
  const { questionCount, typeLabels, part } = listeningTestFacts(passage);
  const tip = tipsForPassage(passage, 'listening')[0] || null;
  if (!questionCount && !part) return null;

  return (
    <section
      aria-labelledby="listening-test-about"
      className={`rounded-lg border border-border bg-card p-6 text-sm leading-7 text-slate-700 shadow-sm ${className}`}
    >
      <h2 id="listening-test-about" className="text-lg font-semibold text-foreground">
        About this Listening test
      </h2>
      <p className="mt-2">
        &ldquo;{passage.title}&rdquo; is an original IELTS Listening practice test
        {part ? ` in the style of ${part.label}` : ''}
        {questionCount ? ` with ${questionCount} question${questionCount === 1 ? '' : 's'}` : ''}
        {typeLabels.length ? ` (${joinLabels(typeLabels)})` : ''}. Play the recording, answer as you
        listen, then submit to have every answer marked instantly and read the transcript.
      </p>
      {part && <p className="mt-2">{part.guide.answer}</p>}
      {tip && (
        <>
          <h3 className="mt-4 font-semibold text-foreground">How to approach it</h3>
          <ul className="mt-1 list-disc space-y-1 pl-6">
            {tip.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
            {tip.trap && (
              <li>
                <strong className="font-semibold text-foreground">Common trap:</strong> {tip.trap}
              </li>
            )}
          </ul>
          <p className="mt-3">
            <NextLink href={tip.href} className="text-primary underline-offset-2 hover:underline">
              Read the full {tip.label} strategy guide
            </NextLink>{' '}
            ·{' '}
            <NextLink href="/editorial-policy" className="text-primary underline-offset-2 hover:underline">
              How we write and check our tests
            </NextLink>
          </p>
        </>
      )}
    </section>
  );
}
