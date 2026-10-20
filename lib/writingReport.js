export const REPORT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function writingReportPath(id) {
  return typeof id === 'string' && REPORT_ID_RE.test(id) ? `/writing-report/${id}` : null;
}

// Total actionable issues across the full report — sent as a bare NUMBER to free
// users so the upgrade CTA can say "N fixable issues" without shipping the
// underlying (paid) feedback text.
function countWritingIssues(result) {
  const criterionIssues = Object.values(result.criteria || {}).reduce(
    (n, c) => n + (Array.isArray(c?.improvements) ? c.improvements.length : 0),
    0
  );
  return (
    criterionIssues +
    (Array.isArray(result.improvements) ? result.improvements.length : 0) +
    (Array.isArray(result.correctedExamples) ? result.correctedExamples.length : 0)
  );
}

// Rewrites are a single paragraph by prompt instruction; this is a defensive
// ceiling so a verbose model can never balloon the stored/returned payload.
const MAX_REWRITE_CHARS = 900;

export function normalizeRewrite(rewrite) {
  if (!rewrite || typeof rewrite !== 'object') return null;
  const text = typeof rewrite.text === 'string' ? rewrite.text.trim() : '';
  if (!text) return null;
  return {
    focus: typeof rewrite.focus === 'string' ? rewrite.focus.trim().slice(0, 160) : '',
    text: text.slice(0, MAX_REWRITE_CHARS),
  };
}

// The free sample is a real diagnostic, not a stub: the overall band and the
// FIRST criterion in full (Task Response / Task Achievement: band, strengths,
// improvements) plus one real correction. Since Oct 18 2026 the other three
// criteria are withheld too — the free report used to answer most of what a
// learner came for, and the gate converted ~1 in 125 free writers. Premium
// buys every criterion, the examiner summary, the prioritised plan, every
// corrected example and the band-8 rewrite.
//
// The withheld text is removed HERE rather than blurred in the browser: a CSS
// filter over real text is a paywall bypass (see WritingScoreReport, which
// renders shaped placeholders for criteria with no band). The counts below are
// bare numbers so the upgrade CTA can be specific without leaking content.
// The full result is still persisted server-side for the user's own history,
// and unlocks after purchase.
const FREE_CRITERIA = ['taskResponse', 'taskAchievement'];

export function reduceForFree(result) {
  const corrected = Array.isArray(result.correctedExamples) ? result.correctedExamples : [];
  const rewrite = normalizeRewrite(result.rewrite);
  return {
    overallBand: result.overallBand,
    criteria: Object.fromEntries(
      Object.entries(result.criteria || {}).filter(([key]) => FREE_CRITERIA.includes(key))
    ),
    lockedCriteriaCount: Object.keys(result.criteria || {}).filter((key) => !FREE_CRITERIA.includes(key)).length,
    // Per locked criterion, how many fixes the examiner found in THIS essay —
    // bare numbers, so the locked cards can be specific without the text.
    lockedCriteriaIssues: Object.fromEntries(
      Object.entries(result.criteria || {})
        .filter(([key]) => !FREE_CRITERIA.includes(key))
        .map(([key, c]) => [key, Array.isArray(c?.improvements) ? c.improvements.length : 0])
    ),
    // One real correction, so the preview shows the genuine article.
    correctedExamples: corrected.slice(0, 1),
    lockedCorrectionCount: Math.max(0, corrected.length - 1),
    // Presence flag only — never the rewrite text itself.
    rewriteLocked: Boolean(rewrite),
    lockedIssueCount: countWritingIssues(result),
  };
}

