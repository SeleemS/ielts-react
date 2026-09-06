// src/lib/reviewQueue.js
// Pure queue-building for /review: for each practised passage take the LATEST
// attempt's per_question and keep the questions that were wrong or skipped.
// Re-answering on /review records a fresh attempt, so getting them right
// clears the passage from the queue on the next build.

export function buildQueue(attempts) {
  // Latest attempt per passage wins (attempts arrive newest-first).
  const byPassage = new Map();
  for (const attempt of attempts || []) {
    const passage = Array.isArray(attempt.passages) ? attempt.passages[0] : attempt.passages;
    if (!passage?.slug || byPassage.has(passage.slug)) continue;
    byPassage.set(passage.slug, { attempt, passage });
  }
  const queue = [];
  for (const { attempt, passage } of byPassage.values()) {
    const missed = [];
    const types = new Set();
    for (const [number, item] of Object.entries(attempt.per_question || {})) {
      if (item?.correct) continue;
      missed.push(Number(number));
      if (item?.questionType) types.add(item.questionType);
    }
    if (!missed.length) continue;
    queue.push({
      slug: passage.slug,
      title: passage.title || 'Practice passage',
      skill: attempt.skill,
      missed: missed.sort((a, b) => a - b),
      types: [...types],
      date: attempt.submitted_at || attempt.created_at,
    });
  }
  // Most mistakes first — the weakest material is the best use of a session.
  queue.sort((a, b) => b.missed.length - a.missed.length);
  return queue;
}


// Keep shared reading/completion context and options, but only render and grade
// missed inputs. QuestionGroup renders inputs from questions; instructions HTML
// is display-only and does not require retaining already-correct questions.
export function selectReviewGroups(passage, missedNumbers) {
  const missed = new Set((missedNumbers || []).map(Number));
  return (passage?.groups || passage?.questionGroups || [])
    .map(group => ({ ...group, questions: (group.questions || [])
      .filter(question => missed.has(Number(question.number))) }))
    .filter(group => group.questions.length > 0);
}
