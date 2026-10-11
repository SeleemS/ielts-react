// lib/questionBank.js
// Pure builders for the /ielts-question-bank hub: turns the raw counts that
// lib/questionBankData.js loads (the same lists the skill hubs render) into
// the page's sections, headline number and structured data. No I/O here, so
// the counting rules are unit-testable offline.
//
// COUNTING RULE (stated on the page): every Reading and Listening question is
// counted individually; every Writing prompt and every Speaking practice set
// (a Part 1 topic, a Part 2 cue card or a Part 3 discussion) counts once. So
// the headline never inflates a Speaking set into its sub-questions.

import { SITE_URL } from './site';
import { READING_QUESTION_TYPE_LINKS } from './readingQuestionTypes';
import { LISTENING_PART_LINKS } from './listeningQuestionTypes';
import { SPEAKING_PART_LINKS } from './speakingParts';
import { answersPath } from './answerKeys';
import { practiceAllowanceCopy } from './practiceAllowance';

export const QUESTION_BANK_PATH = '/ielts-question-bank';
export const QUESTION_BANK_CANONICAL = `${SITE_URL}${QUESTION_BANK_PATH}`;

const toCount = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.floor(Number(value)) : 0);

export function formatCount(n) {
  return toCount(n).toLocaleString('en-US');
}

export function questionBankTotal({ readingQuestions, listeningQuestions, writingPrompts, speakingSets } = {}) {
  return toCount(readingQuestions) + toCount(listeningQuestions) + toCount(writingPrompts) + toCount(speakingSets);
}

export function questionBankTitle(total) {
  return total > 0
    ? `IELTS Question Bank: ${formatCount(total)} Free Practice Questions with Answers`
    : 'IELTS Question Bank: Free Practice Questions with Answers';
}

export function questionBankDescription(summary) {
  const { skills } = summary;
  return `A free IELTS question bank and test database: ${formatCount(skills.reading.questions)} Reading and ${formatCount(skills.listening.questions)} Listening questions with answers, ${formatCount(skills.writing.items)} Writing prompts with model answers and ${formatCount(skills.speaking.items)} Speaking sets. Original practice material.`;
}

// raw: {
//   readingItems:   [{ id, title, questionTypes[] }]   listPassages(reading, { withQuestionTypes })
//   listeningItems: [{ id, title }]                     listPassages(listening)
//   writingItems:   [{ id, title }]                     listPassages(writing)
//   speakingItems:  [{ slug, part }]                    listSpeakingHubItems()
//   readingQuestions, listeningQuestions: number        per-skill question counts
//   listeningPartCounts: { 1: n, 2: n, 3: n, 4: n }
//   answerKeySlugs: { reading: [slug], listening: [slug] }
//   essayBankCount: number   (authored samples + catalogued model answers, as the hub counts)
//   mockTestCount: number
// }
export function buildQuestionBankSummary(raw = {}) {
  const readingItems = raw.readingItems || [];
  const listeningItems = raw.listeningItems || [];
  const writingItems = raw.writingItems || [];
  const speakingItems = raw.speakingItems || [];

  const typeCounts = new Map();
  for (const item of readingItems) {
    for (const type of new Set(item.questionTypes || [])) typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
  }
  const readingTypes = READING_QUESTION_TYPE_LINKS.map(({ slug, label, questionType }) => ({
    href: `/reading/${slug}`,
    label,
    count: typeCounts.get(questionType) || 0,
  })).filter((type) => type.count > 0);

  const partCounts = raw.listeningPartCounts || {};
  const listeningParts = LISTENING_PART_LINKS.map(({ slug, label }) => ({
    href: `/listening/${slug}`,
    label: `Listening ${label}`,
    count: toCount(partCounts[Number(slug.replace('part-', ''))]),
  }));

  const speakingParts = SPEAKING_PART_LINKS.map(({ slug, label }) => ({
    href: `/speaking/${slug}`,
    label: `Speaking ${label}`,
    count: speakingItems.filter((item) => `part-${item.part}` === slug).length,
  }));
  const cueCards = speakingItems.filter((item) => item.part === 2).length;

  const answerKeys = ['reading', 'listening'].map((skill) => {
    const slugs = (raw.answerKeySlugs || {})[skill] || [];
    const items = skill === 'reading' ? readingItems : listeningItems;
    const titles = new Map(items.map((item) => [item.id, item.title]));
    return {
      skill,
      count: slugs.length,
      // A short, stable sample of answer-key pages (A–Z by title); every
      // practice page also links its own key.
      links: slugs
        .filter((slug) => titles.has(slug))
        .map((slug) => ({ href: answersPath(skill, slug), label: `${titles.get(slug)} answers` }))
        .sort((a, b) => a.label.localeCompare(b.label))
        .slice(0, 12),
    };
  });

  const skills = {
    reading: {
      label: 'Reading',
      href: '/readingquestion',
      items: readingItems.length,
      questions: toCount(raw.readingQuestions),
      unit: 'passages',
    },
    listening: {
      label: 'Listening',
      href: '/listeningquestion',
      items: listeningItems.length,
      questions: toCount(raw.listeningQuestions),
      unit: 'recordings',
    },
    writing: {
      label: 'Writing',
      href: '/writingquestion',
      items: writingItems.length,
      questions: writingItems.length,
      unit: 'prompts',
    },
    speaking: {
      label: 'Speaking',
      href: '/speakingquestion',
      items: speakingItems.length,
      questions: speakingItems.length,
      unit: 'practice sets',
    },
  };

  const total = questionBankTotal({
    readingQuestions: skills.reading.questions,
    listeningQuestions: skills.listening.questions,
    writingPrompts: skills.writing.items,
    speakingSets: skills.speaking.items,
  });

  return {
    total,
    skills,
    readingTypes,
    listeningParts,
    speakingParts,
    cueCards,
    answerKeys,
    essayBankCount: toCount(raw.essayBankCount),
    mockTestCount: toCount(raw.mockTestCount),
  };
}

// Visible on-page Q&As; FAQPage JSON-LD is generated from the same array.
export function questionBankFaq(summary) {
  return [
    {
      q: 'Are these official IELTS questions?',
      a: 'No. Every question is original practice material written by IELTS-Bank in the format of the IELTS test. Real IELTS papers are confidential and are never published, so no website can legitimately offer them. For papers released by the test owners themselves, use the official Cambridge IELTS books.',
    },
    {
      q: 'Is the question bank free?',
      a: `${practiceAllowanceCopy().bankFaq(formatCount(summary.skills.reading.questions + summary.skills.listening.questions))}. Every Writing prompt and Speaking set is free to practise. AI band scoring for your own Writing and Speaking answers includes a free sample; continued scoring is part of Pro.`,
    },
    {
      q: 'How are the questions counted?',
      a: 'Each Reading and Listening question is counted once, each Writing prompt once, and each Speaking practice set (a Part 1 topic, a Part 2 cue card or a Part 3 discussion) once. The counts update automatically as new material is published.',
    },
  ];
}

export function buildQuestionBankJsonLd(summary, title, description) {
  const hubs = [
    ...Object.values(summary.skills).map((s) => ({ name: `IELTS ${s.label} practice`, url: `${SITE_URL}${s.href}` })),
    { name: 'IELTS Essay Bank', url: `${SITE_URL}/ielts-essay-bank` },
    { name: 'IELTS Speaking cue cards', url: `${SITE_URL}/ielts-speaking-cue-cards` },
    { name: 'IELTS mock tests', url: `${SITE_URL}/mock-test` },
  ];
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${QUESTION_BANK_CANONICAL}#page`,
        url: QUESTION_BANK_CANONICAL,
        name: title,
        description,
        inLanguage: 'en',
        isPartOf: { '@type': 'WebSite', name: 'IELTS-Bank', url: SITE_URL },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: hubs.length,
          itemListElement: hubs.map((hub, i) => ({ '@type': 'ListItem', position: i + 1, name: hub.name, url: hub.url })),
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_URL}/` },
          { '@type': 'ListItem', position: 2, name: 'IELTS Question Bank', item: QUESTION_BANK_CANONICAL },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: questionBankFaq(summary).map((item) => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a },
        })),
      },
    ],
  };
}
