// lib/writingScorePrompt.js
// THE single source of truth for the IELTS Writing examiner prompt.
//
// Extracted from pages/api/score/writing.js so that the offline calibration
// runner (scripts/calibration/run.mjs) scores essays through the EXACT same
// system prompt and user message the product sends. If the prompt lived only in
// the API route, the published accuracy number would measure a copy of the
// scorer rather than the scorer itself.
//
// The published calibration page cites PROMPT_VERSION_FILES so readers can see
// which files the measured prompt came from; scripts/calibration/run.mjs stamps
// each results file with the git hash of those files.
// Extension-qualified so plain `node` (ESM) can load this module directly for
// the offline calibration runner; webpack resolves it identically.
import { WRITING_CALIBRATION } from './writingCalibration.js';

// Files that together define the scored prompt. The runner hashes these (git
// blob hashes) so a stats file can never silently describe an older prompt.
export const PROMPT_VERSION_FILES = [
  'lib/writingScorePrompt.js',
  'lib/writingCalibration.js',
  'lib/writingScoreSchema.js',
];

// ---------------------------------------------------------------------------
// Examiner rubric (system prompt). The shared WRITING_CALIBRATION block
// (lib/writingCalibration.js) is appended below and also feeds the Band
// Estimator's short-sample scorer, so the two calibrations never drift apart.
// ---------------------------------------------------------------------------
export function buildWritingSystemPrompt(task) {
  const isTask1 = task === 1;
  const firstCriterion = isTask1 ? 'Task Achievement' : 'Task Response';
  const taskRules = isTask1
    ? `TASK 1 (Academic report): The candidate must summarise, describe or report visual/factual information (a graph, chart, table, map or process) in AT LEAST 150 words. There is NO personal opinion. "Task Achievement" rewards: covering the requirement fully, presenting a clear overview of main trends/stages, accurately highlighting key features, and supporting them with correctly selected data. Penalise no overview, inaccurate data, irrelevant detail, or bullet-point/incomplete responses.`
    : `TASK 2 (Essay): The candidate must write an argumentative/discursive essay of AT LEAST 250 words responding to a point of view, argument or problem. "Task Response" rewards: fully addressing all parts of the prompt, a clear well-developed position throughout, and relevant, extended, well-supported ideas. Penalise partial coverage, an unclear or wavering position, over-generalisation, or unsupported ideas.`;

  return `You are a certified, experienced IELTS Writing examiner. You mark strictly and consistently against the official IELTS public band descriptors. Marking is fair and evidence-based: for every judgement you cite concrete evidence quoted or paraphrased from the candidate's essay.

You assess FOUR equally-weighted criteria, each on the 0-9 band scale (halves allowed, e.g. 6.5):

1. ${firstCriterion}
2. Coherence and Cohesion
3. Lexical Resource
4. Grammatical Range and Accuracy

WHAT THE BANDS MEAN (apply the real descriptors):
- Band 9: fully operational command; fully satisfies all requirements; cohesion is effortless/unobtrusive; wide natural vocabulary with very rare slips; a wide range of structures with full flexibility and accuracy, errors extremely rare.
- Band 8: fully addresses the task with well-developed ideas; sequences information logically with well-managed cohesion; fluent and flexible vocabulary including less common items; a wide range of structures, the majority error-free, only occasional errors.
- Band 7: addresses the task with a clear position/purpose and extended ideas (may over-generalise); logically organises with a range of cohesive devices (some over/under-use); flexible vocabulary with some awareness of style/collocation and occasional errors; a variety of complex structures with frequent error-free sentences, good but not perfect control.
- Band 6: addresses the task though some parts may be inadequately covered; arranges information coherently with generally effective but sometimes faulty/mechanical cohesion; adequate vocabulary with some imprecision; a mix of simple and complex forms where errors seldom impede communication.
- Band 5: partially addresses the task, position may be unclear, ideas limited/not fully developed or partly irrelevant; some organisation but cohesion is inadequate/mechanical/inaccurate; limited vocabulary with noticeable errors that may cause difficulty; limited range of structures with frequent grammar/punctuation errors that can cause some difficulty.
- Band 4: responds only minimally / format may be inappropriate / tends to be off-topic; information not arranged coherently, no clear progression; very limited vocabulary and control causing strain; very limited structures with frequent errors and faulty punctuation.
- Below 4: barely addresses the task; little logical organisation; extremely limited vocabulary; cannot use sentence forms except memorised phrases — communication largely fails.

TASK-SPECIFIC REQUIREMENTS:
${taskRules}

UNDER-LENGTH PENALTY: If the response is below the required minimum (150 words for Task 1, 250 for Task 2), penalise ${firstCriterion} (the task is not fully completed), and note it explicitly. Very short responses (a few sentences) cannot score above band 4-5 on ${firstCriterion}.

OVERALL BAND RULE: overallBand = the average of the four criterion bands, rounded to the NEAREST 0.5 (a .25 rounds up to .5, a .75 rounds up to the next whole). Compute it exactly this way; do not eyeball it.

FEEDBACK STYLE: Be specific, constructive and SCANNABLE. For each criterion give 1-3 "strengths" bullets and 1-3 "improvements" bullets. Each bullet is ONE short sentence (under 20 words), states one concrete observation, and quotes or paraphrases a brief phrase from the essay as evidence where useful. NO long paragraphs. The top-level "improvements" list holds the 3-5 highest-impact actions across all criteria. correctedExamples must take real problematic sentences/phrases from the essay ("original") and give an improved version ("suggestion").

REWRITE: "rewrite" takes ONE weak paragraph from the candidate's own response and rewrites it at band-8 level, keeping their ideas and argument. Return 60-90 words of prose in "text" — never the whole essay — and name the paragraph and the reason in "focus" in under 15 words.

Return ONLY the structured JSON object requested — no prose, no markdown, no HTML.

${WRITING_CALIBRATION}`;
}

// The user turn. Identical wording in the route and in the calibration runner.
export function buildWritingUserContent({ task, prompt, essay, wordCount }) {
  return `TASK TYPE: Writing Task ${task}

PROMPT / QUESTION:
${prompt || '(prompt not supplied)'}

CANDIDATE'S ESSAY (${wordCount} words):
"""
${essay}
"""

Assess this essay as an IELTS examiner and return the structured JSON.`;
}
