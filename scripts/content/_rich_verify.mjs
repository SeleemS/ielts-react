// Parity verifier for rich-* passages.
// Reads each imported passage back through lib/supabase.js getStructuredPassage
// (the LIVE read path, via the anon key + RLS) and grades it with the REAL
// src/components/question/grade.js. For every passage it submits (a) all correct
// answers -> expects 100%, and (b) all wrong answers -> expects 0%.
import { loadEnv } from './_env.mjs';

const env = loadEnv();
// getSupabase() reads these at module-load time, so set them BEFORE importing.
process.env.NEXT_PUBLIC_SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const { getStructuredPassage } = await import('../../lib/supabase.js');
const { gradeAll, typeConfig, booleanChoices } = await import('../../src/components/question/grade.js');

const SLUGS = [
  'the-silent-grammar-of-gesture-1ccplz',
  'esperanto-and-the-universal-language-dream-1wu2s4',
  'the-birth-of-nicaraguan-sign-language-78q419',
  'the-design-of-the-everyday-chair-1gviv2',
  'how-bridges-stand-up-5f8l7r',
  'the-reinvention-of-the-bicycle-1u50dt',
  'mapping-the-ocean-floor-zl98pl',
  'lost-cities-of-the-amazon-rqb71t',
  'finding-the-way-across-the-pacific-ymf2z4',
  'sourdough-bread-that-is-alive-1ewd00',
  'the-global-spread-of-the-chilli-1m4n1l',
  'the-marathon-and-the-limits-of-endurance-n8hed',
  'how-the-world-agreed-on-the-time-uax3tw',
  'the-box-that-changed-the-world-16tw6l',
  'a-history-of-the-world-in-board-games-b6h4wz',
  'the-invention-of-the-supermarket-u7ngl4',
  'the-science-of-waiting-in-line-51cqfo',
  'rethinking-the-psychology-of-crowds-cljgwo',
  'from-bean-to-bar-the-making-of-chocolate-1ywyqt',
  'the-trombe-wall-heating-buildings-with-sunlight-1bdolv',
];

function correctAnswerFor(group, q) {
  const cfg = typeConfig(group.questionType);
  const ak = q.answerKey;
  if (cfg.grade === 'optionKeySet') return (ak.correctOptionKeys || []).slice();
  if (cfg.grade === 'optionKeySingle') return ak.correctOptionKeys[0];
  if (cfg.input === 'boolean') return ak.accepted[0];
  return ak.accepted[0];
}

function wrongAnswerFor(group, q) {
  const cfg = typeConfig(group.questionType);
  const ak = q.answerKey;
  if (cfg.grade === 'optionKeySet') {
    const correct = new Set(ak.correctOptionKeys || []);
    const others = (group.options || []).map((o) => o.key).filter((k) => !correct.has(k));
    return others.length ? [others[0]] : []; // different-sized/different set -> wrong
  }
  if (cfg.grade === 'optionKeySingle') {
    const correct = ak.correctOptionKeys[0];
    const other = (group.options || []).map((o) => o.key).find((k) => k !== correct);
    return other ?? '__none__';
  }
  if (cfg.input === 'boolean') {
    const accepted = new Set((ak.accepted || []).map((a) => String(a).toLowerCase()));
    const choice = booleanChoices(group.questionType).map((c) => c.value).find((v) => !accepted.has(v));
    return choice ?? 'not given';
  }
  return '__definitely_wrong__';
}

const perType = {}; // type -> { total, allCorrectOk, allWrongOk }
function bump(t) { if (!perType[t]) perType[t] = { total: 0, correctRight: 0, wrongZero: 0 }; return perType[t]; }

let passagesOk = 0;
const failures = [];

for (const slug of SLUGS) {
  const p = await getStructuredPassage('reading', slug);
  if (!p) { failures.push(`${slug}: NOT FOUND via getStructuredPassage (RLS?)`); continue; }

  const correctAnswers = {};
  const wrongAnswers = {};
  for (const g of p.groups) {
    for (const q of g.questions) {
      correctAnswers[q.number] = correctAnswerFor(g, q);
      wrongAnswers[q.number] = wrongAnswerFor(g, q);
    }
  }

  const rCorrect = gradeAll(p.groups, correctAnswers);
  const rWrong = gradeAll(p.groups, wrongAnswers);

  // per-type tallies from the all-correct and all-wrong runs
  for (const g of p.groups) {
    for (const q of g.questions) {
      const t = bump(g.questionType);
      t.total += 1;
      if (rCorrect.byNumber[q.number].correct === true) t.correctRight += 1;
      if (rWrong.byNumber[q.number].correct === false) t.wrongZero += 1;
    }
  }

  const okCorrect = rCorrect.score === rCorrect.total;
  const okWrong = rWrong.score === 0;
  if (okCorrect && okWrong) {
    passagesOk += 1;
  } else {
    // report exactly which question numbers misbehaved
    const bad = [];
    for (const g of p.groups) for (const q of g.questions) {
      if (!rCorrect.byNumber[q.number].correct) bad.push(`Q${q.number}(${g.questionType}) correct-answer graded WRONG; expected ${JSON.stringify(correctAnswers[q.number])}; correctDisplay=${rCorrect.byNumber[q.number].correctDisplay}`);
      if (rWrong.byNumber[q.number].correct) bad.push(`Q${q.number}(${g.questionType}) wrong-answer graded CORRECT`);
    }
    failures.push(`${slug}: correct=${rCorrect.score}/${rCorrect.total} wrong=${rWrong.score}/${rWrong.total}\n    ` + bad.join('\n    '));
  }
}

console.log(`\nPassages fully verified (100% correct AND 0% wrong): ${passagesOk}/${SLUGS.length}`);
console.log('\nPer-type parity (correctRight/total should equal total; wrongZero/total should equal total):');
for (const [t, v] of Object.entries(perType).sort()) {
  const allC = v.correctRight === v.total ? 'ALL-CORRECT OK' : `FAIL ${v.correctRight}/${v.total}`;
  const allW = v.wrongZero === v.total ? 'ALL-WRONG OK' : `FAIL ${v.wrongZero}/${v.total}`;
  console.log(`  ${t.padEnd(26)} n=${String(v.total).padStart(3)}  ${allC.padEnd(16)} ${allW}`);
}
if (failures.length) {
  console.log('\nFAILURES:\n' + failures.join('\n'));
  process.exit(1);
} else {
  console.log('\nALL PASSAGES + ALL TYPES PASS PARITY.');
}
