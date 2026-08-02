import React from 'react';
import QuestionItem from './QuestionItem';
import { typeConfig, stripOptionKeyPrefix, cleanGroupPrompt } from './grade';
import { sanitizeHtml, sanitizeSvg } from '../../../lib/sanitize';

// Renders one question_group: heading + instructions (+ an options legend for
// matching types) followed by its questions. DB-sourced instructionsHtml and
// the display-only image SVG (maps/plans) are sanitized via lib/sanitize
// (DOMPurify) before being injected with dangerouslySetInnerHTML.

export default function QuestionGroup({
  group,
  answers,
  onChange,
  submitted,
  results,
  flagged = [],
  onToggleFlag,
}) {
  const cfg = typeConfig(group.questionType);
  const showLegend = cfg.input === 'select' && (group.options || []).length > 0;
  const imageLabel =
    group.questionType === 'flowchart_completion'
      ? 'Flow-chart'
      : group.questionType === 'diagram_label'
        ? 'Diagram'
        : /\bplan\b/i.test(group.prompt || '')
          ? 'Plan'
          : 'Map';

  const first = group.questions[0]?.number;
  const last = group.questions[group.questions.length - 1]?.number;
  const range =
    group.questions.length > 1 ? `Questions ${first}–${last}` : `Question ${first}`;
  // The range eyebrow above already names the question number(s) — drop a
  // redundant "Question N:" lead-in baked into imported prompts.
  const prompt = cleanGroupPrompt(group.prompt);

  return (
    <section className="mb-8">
      <div className="mb-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-accent">{range}</div>
        {prompt ? (
          <h3 className="mt-1 text-base font-bold text-foreground">{prompt}</h3>
        ) : null}
      </div>

      {group.instructionsHtml ? (
        <div
          className="mb-4 rounded-md border border-border bg-secondary/50 p-3 text-sm leading-relaxed text-foreground [&_p]:mb-2 [&_strong]:font-semibold [&_table]:w-full [&_td]:border [&_td]:border-border [&_td]:p-2 [&_th]:border [&_th]:border-border [&_th]:p-2"
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(group.instructionsHtml) }}
        />
      ) : null}

      {group.imageSvg ? (
        <figure className="mb-4 overflow-x-auto rounded-md border border-border bg-card p-3">
          <figcaption className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {imageLabel}
          </figcaption>
          <div
            className="[&_svg]:h-auto [&_svg]:max-w-full [&_svg]:min-w-[480px] sm:[&_svg]:min-w-0"
            dangerouslySetInnerHTML={{ __html: sanitizeSvg(group.imageSvg) }}
          />
        </figure>
      ) : null}

      {showLegend ? (
        <div className="mb-4 rounded-md border border-border bg-card p-3">
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Options
          </div>
          <ul className="grid gap-1 text-sm text-foreground">
            {group.options.map((opt) => (
              <li key={opt.key}>
                <span className="font-semibold">{opt.key}.</span>{' '}
                {stripOptionKeyPrefix(opt.key, opt.text)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid gap-3">
        {group.questions.map((question) => (
          <QuestionItem
            key={question.number}
            group={group}
            question={question}
            value={answers[question.number]}
            onChange={onChange}
            submitted={submitted}
            result={results ? results.byNumber[question.number] : null}
            flagged={flagged.includes(question.number)}
            onToggleFlag={onToggleFlag}
          />
        ))}
      </div>
    </section>
  );
}
