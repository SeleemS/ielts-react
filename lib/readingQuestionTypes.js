// lib/readingQuestionTypes.js
// Single source of truth for the IELTS Reading question-type hub pages
// (pages/reading/[type].js) and the "Practice by question type" cross-links on
// the Reading section landing page.
//
// Each entry maps a URL slug -> the database `question_type` enum value (see
// supabase/migrations/0001_extensions_and_enums.sql) plus the SEO metadata and
// a genuinely-useful, UNIQUE strategy guide (this prose is the SEO payload).
//
// Guide shape:
//   { intro, tests, steps: [], traps: [], timing }
// rendered by the hub page into an <h1>, a strategy article and lists.

import { SITE_URL } from './site';

export const READING_QUESTION_TYPES = {
  'true-false-not-given': {
    slug: 'true-false-not-given',
    questionType: 'true_false_notgiven',
    label: 'True / False / Not Given',
    h1: 'IELTS True/False/Not Given Practice Questions',
    title: 'IELTS True/False/Not Given Practice Questions & Strategy | IELTS-Bank',
    description:
      'Free IELTS True/False/Not Given practice with a step-by-step strategy, common traps and how to tell "False" from "Not Given". Timed, auto-scored passages.',
    guide: {
      answer:
        'Write TRUE if the passage confirms the statement, FALSE if it directly contradicts it, and NOT GIVEN if the passage says nothing either way. The key distinction: False means the text disagrees; Not Given means the text is silent.',
      intro:
        'True/False/Not Given is the question type that trips up more test-takers than any other, because it asks you to judge a statement against the writer’s factual claims — and to separate what the passage contradicts from what it simply never mentions. Mastering the difference between "False" and "Not Given" is the single biggest score lever in IELTS Reading.',
      tests:
        'These questions test whether you can match a statement to information in the text. "True" means the statement agrees with the information in the passage. "False" means the passage states the opposite. "Not Given" means there is no information in the passage to confirm or deny the statement — you cannot verify it either way.',
      steps: [
        'Read the statement first and underline the key idea, especially any qualifiers like "all", "only", "never", "always", "more than" or dates and numbers.',
        'Because the questions follow the order of the passage, scan for the paragraph that deals with the same topic rather than re-reading everything.',
        'Locate the sentence(s) in the passage that address the same fact, and read them carefully — the answer hinges on precise meaning, not on matching words.',
        'Decide: does the passage confirm the statement (True), directly contradict it (False), or say nothing that lets you judge it (Not Given)?',
        'Trust the text, never your own background knowledge — if the passage does not state it, it is Not Given even if you know it to be true in real life.',
      ],
      traps: [
        'Confusing "False" with "Not Given": choose False only when the passage actively contradicts the statement; if the passage is silent, it is Not Given.',
        'Being fooled by word-matching — a statement can repeat words from the text but reverse or exaggerate the meaning.',
        'Missing qualifiers: "some scientists believe" is not the same claim as "scientists have proven", and swapping one for the other flips the answer.',
        'Over-thinking with outside knowledge instead of judging strictly against the passage.',
      ],
      timing:
        'Aim for under a minute per question. Because these questions run in passage order, resist the urge to jump around — work top to bottom and if you are stuck for more than 90 seconds, mark your best guess (statistically "Not Given" is often under-chosen) and move on.',
    },
  },

  'yes-no-not-given': {
    slug: 'yes-no-not-given',
    questionType: 'yes_no_notgiven',
    label: 'Yes / No / Not Given',
    h1: 'IELTS Yes/No/Not Given Practice Questions',
    title: 'IELTS Yes/No/Not Given Practice Questions & Strategy | IELTS-Bank',
    description:
      'Free IELTS Yes/No/Not Given practice questions. Learn to match statements to the writer’s opinions and claims, avoid the classic traps and score higher.',
    guide: {
      answer:
        'Yes/No/Not Given works like True/False/Not Given but tests the writer\u2019s opinions rather than facts: YES agrees with the writer\u2019s view, NO contradicts it, and NOT GIVEN means the writer never takes a position on that point.',
      intro:
        'Yes/No/Not Given looks identical to True/False/Not Given, but there is a crucial difference: instead of testing facts, it tests the writer’s opinions, views and claims. Your job is to decide whether a statement agrees with what the author thinks, not with what is objectively true.',
      tests:
        'These questions target the writer’s stance. "Yes" means the statement agrees with the writer’s opinion or claim. "No" means the statement contradicts the writer’s view. "Not Given" means the writer never expresses an opinion on that point, so you cannot say whether they would agree or disagree.',
      steps: [
        'Identify the claim in the statement and, crucially, whose opinion it represents — these passages often quote several people, so track who is speaking.',
        'Scan the passage for opinion signals: verbs like "argues", "believes", "suggests", "claims", and phrases such as "in the author’s view".',
        'Read the relevant sentences and decide whether the writer would agree (Yes), disagree (No), or has simply not offered a view (Not Given).',
        'Distinguish the writer’s own opinion from opinions they merely report — the answer follows the writer’s position, not a quoted third party unless the writer endorses it.',
      ],
      traps: [
        'Treating a reported opinion (someone else’s view mentioned by the writer) as the writer’s own conclusion.',
        'Choosing "No" when the writer is neutral or silent — that is Not Given.',
        'Missing hedging language ("may", "could", "it is possible") that softens a claim so it no longer matches an absolute statement.',
        'Assuming the writer must hold an opinion just because the topic is discussed.',
      ],
      timing:
        'Budget roughly a minute per question. Opinion questions reward careful reading over speed, so spend your time understanding the writer’s attitude in the target sentences rather than skimming for keywords.',
    },
  },

  'matching-headings': {
    slug: 'matching-headings',
    questionType: 'matching_headings',
    label: 'Matching Headings',
    h1: 'IELTS Matching Headings Practice Questions',
    title: 'IELTS Matching Headings Practice Questions & Strategy | IELTS-Bank',
    description:
      'Free IELTS Matching Headings practice. Learn to identify the main idea of each paragraph, avoid detail traps and match headings quickly and accurately.',
    guide: {
      answer:
        'Match each paragraph (A\u2013F) to the heading that captures its main idea \u2014 not a detail it merely mentions. There are always more headings than paragraphs, so expect two or three distractors that echo minor points.',
      intro:
        'Matching Headings asks you to choose the heading that best captures the main idea of each paragraph or section. There are always more headings than paragraphs, so some are never used. The skill being tested is your ability to summarise — to distinguish a paragraph’s central point from its supporting details.',
      tests:
        'This type tests skimming for gist and identifying topic sentences. A correct heading reflects what the whole paragraph is about, not just a fact, name or example mentioned within it.',
      steps: [
        'Read the list of headings first so you know the options, and notice how they differ from one another — often two headings are deliberately similar.',
        'Read the first paragraph and ask yourself: "In one sentence, what is this paragraph mainly saying?" before you look back at the headings.',
        'Match your own summary to the closest heading; the topic sentence (frequently the first or last sentence) usually signals the main idea.',
        'Cross out each heading as you use it, and if two paragraphs seem to fit the same heading, re-read both to find the finer distinction.',
        'Leave the hardest paragraphs until last — solving the easy ones first removes options and narrows the choices for the difficult ones.',
      ],
      traps: [
        'Picking a heading because it repeats a word from the paragraph, when that word only appears in a minor detail.',
        'Choosing a heading that describes just one example or sentence rather than the paragraph’s overall point.',
        'Being caught between two similar headings — the examiner writes them to test whether you grasp the precise emphasis.',
        'Forgetting that some headings are distractors and will never be correct.',
      ],
      timing:
        'Skim each paragraph in about a minute; do not read every word. Because headings do not run in a fixed order, tackle the paragraphs whose main idea is clearest first and use elimination for the rest.',
    },
  },

  'matching-information': {
    slug: 'matching-information',
    questionType: 'matching_information',
    label: 'Matching Information',
    h1: 'IELTS Matching Information Practice Questions',
    title: 'IELTS Matching Information Practice Questions & Strategy | IELTS-Bank',
    description:
      'Free IELTS Matching Information practice. Learn to locate specific details, examples and explanations in the right paragraph and avoid the time-sink traps.',
    guide: {
      answer:
        'Find which paragraph contains a specific piece of information and write that paragraph\u2019s letter. Answers do not follow passage order, and a paragraph can be used twice or not at all.',
      intro:
        'Matching Information gives you a set of statements and asks which paragraph (A, B, C…) each piece of information appears in. Unlike Matching Headings, this is about locating a specific detail — an example, a reason, a comparison, a definition — somewhere in the text, and any paragraph may be used more than once or not at all.',
      tests:
        'This type tests scanning for specific information rather than gist. You are hunting for where a particular fact, cause, example or description is stated, so paragraph-level main ideas matter less than precise detail.',
      steps: [
        'Read each statement and identify exactly what kind of information you are looking for — a reason, a result, an example, a definition, a contrast.',
        'Note that the statements do NOT follow paragraph order, so treat each one as an independent search.',
        'Scan the paragraphs for the specific detail, paraphrased rather than copied, and confirm the paragraph actually contains that exact information.',
        'Because a paragraph can be the answer to more than one statement, do not eliminate paragraphs after using them once.',
        'Do the statements you can find quickly first, then return to the tougher ones with fewer paragraphs left to check.',
      ],
      traps: [
        'Assuming the questions run in order — they do not, which makes linear reading inefficient.',
        'Matching on a keyword that appears in several paragraphs instead of confirming the full idea.',
        'Spending too long on one hard statement; this is the most time-consuming Reading type, so pace yourself.',
        'Forgetting a paragraph can be reused, and wrongly ruling it out.',
      ],
      timing:
        'This is often the slowest question type — budget your time carefully and do it after the more predictable, in-order question types on the same passage so you are not rushed on those.',
    },
  },

  'matching-features': {
    slug: 'matching-features',
    questionType: 'matching_features',
    label: 'Matching Features',
    h1: 'IELTS Matching Features Practice Questions',
    title: 'IELTS Matching Features Practice Questions & Strategy | IELTS-Bank',
    description:
      'Free IELTS Matching Features practice. Learn to match statements to people, dates, categories or theories accurately and manage the reused-option trap.',
    guide: {
      answer:
        'Match each statement to the correct person, theory or category from a lettered list. Scan the passage for names and dates first \u2014 they are the fastest anchors to the right sentences.',
      intro:
        'Matching Features asks you to connect a list of statements to a set of options — typically researchers, people, dates, places, theories or categories. For example, you might match findings to the scientists who made them. Some options may be used more than once, and some may not be used at all.',
      tests:
        'This type tests your ability to scan for named features and understand what the passage says about each one. It rewards careful tracking of who did or said what, especially in passages that discuss several people or studies.',
      steps: [
        'Read the list of options (the features) and locate each one in the passage, underlining every place it appears — names and dates are easy to spot.',
        'Read the statements and identify the claim or characteristic each one describes.',
        'Match each statement to the option the passage links it to, checking the surrounding sentences rather than relying on proximity alone.',
        'Watch for options that appear in several places; the passage may attribute different points to the same person, so an option can be reused.',
        'Confirm each match by re-reading the relevant sentence — the connection must be stated, not implied by nearby text.',
      ],
      traps: [
        'Assuming each option is used exactly once — some are reused and some are distractors.',
        'Linking a statement to the nearest name rather than the name the sentence actually credits.',
        'Confusing what the writer says about a person with what that person claims themselves.',
        'Overlooking pronouns ("he", "she", "they", "her work") that carry the attribution across sentences.',
      ],
      timing:
        'Locating and marking every option in the passage first saves time overall. Spend the first minute mapping the features, then match statements quickly against that map.',
    },
  },

  'multiple-choice': {
    slug: 'multiple-choice',
    questionType: 'multiple_choice',
    label: 'Multiple Choice',
    h1: 'IELTS Multiple Choice Reading Practice Questions',
    title: 'IELTS Multiple Choice Reading Practice Questions & Strategy | IELTS-Bank',
    description:
      'Free IELTS Reading Multiple Choice practice. Learn to eliminate distractors, spot paraphrased answers and choose the option the passage truly supports.',
    guide: {
      answer:
        'Choose the correct letter (A\u2013D) for each question. Wrong options usually recycle words from the passage with a twisted meaning, so judge by meaning, never by word overlap.',
      intro:
        'Multiple Choice in IELTS Reading gives you a question or an unfinished sentence with three or four options, and you choose the one the passage supports. The correct option is almost always a paraphrase of the text, while the wrong options are carefully engineered to look tempting — so elimination is your best friend.',
      tests:
        'This type tests detailed understanding of a specific part of the passage: a fact, an inference, the writer’s opinion or the main idea of a section. It rewards close reading and the ability to reject plausible-but-wrong distractors.',
      steps: [
        'Read the question stem carefully before the options so you know exactly what is being asked.',
        'Because multiple-choice questions follow passage order, locate the relevant section and read it in full — the answer usually depends on more than one sentence.',
        'Read all the options and treat each as a claim to test against the text, rather than picking the first that "sounds right".',
        'Eliminate options that are contradicted, only partly true, or not mentioned; the remaining option should be fully supported by the passage.',
        'Choose the answer that matches the meaning of the text, not the one that reuses the most words from it.',
      ],
      traps: [
        'Distractors that use exact words from the passage but distort the meaning.',
        'Options that are true in the real world but not stated in this passage.',
        'Options that are partly correct — one clause matches, another does not — which still makes them wrong.',
        'Extreme wording ("always", "never", "the only") that the passage does not actually support.',
      ],
      timing:
        'Allow a little over a minute per question, as each often requires reading a short section closely. Use elimination aggressively so you spend time confirming one answer rather than re-reading all four.',
    },
  },

  'short-answer': {
    slug: 'short-answer',
    questionType: 'short_answer',
    label: 'Short Answer',
    h1: 'IELTS Short Answer Reading Practice Questions',
    title: 'IELTS Short Answer Reading Practice Questions & Strategy | IELTS-Bank',
    description:
      'Free IELTS Reading Short Answer practice. Learn to find exact answers, respect the word limit and avoid losing marks on spelling and grammar.',
    guide: {
      answer:
        'Answer each question with words taken directly from the passage, within the stated limit (e.g. NO MORE THAN THREE WORDS AND/OR A NUMBER). Going over the word limit scores zero even when the fact is right.',
      intro:
        'Short Answer questions ask you to answer a question using words taken directly from the passage, within a strict word limit (for example "NO MORE THAN THREE WORDS AND/OR A NUMBER"). They are among the most reliable marks in Reading because the answer is usually stated explicitly — provided you obey the word limit and copy accurately.',
      tests:
        'This type tests scanning for specific factual detail — names, numbers, places, things — and your ability to extract a precise answer without exceeding the word limit or changing the words.',
      steps: [
        'Read the instructions and note the exact word limit; going over it means zero marks even if the meaning is right.',
        'Turn each question into a set of keywords and predict what kind of answer it needs (a person, a date, a place, a noun).',
        'Scan the passage — questions usually follow passage order — for the sentence that answers the question.',
        'Copy the answer straight from the text; do not paraphrase, and do not add extra words that push you over the limit.',
        'Check your spelling and that the answer grammatically fits the question, since misspelled answers are marked wrong.',
      ],
      traps: [
        'Exceeding the word limit (writing four words when only three are allowed).',
        'Rephrasing the answer in your own words instead of using the passage’s exact words.',
        'Copying a misspelling or transcribing a number incorrectly.',
        'Choosing the first keyword match without checking it actually answers the specific question asked.',
      ],
      timing:
        'These are quick marks — aim for well under a minute each. Bank the time you save here for the slower Matching Information questions elsewhere in the paper.',
    },
  },

  'sentence-completion': {
    slug: 'sentence-completion', questionType: 'sentence_completion', label: 'Sentence Completion',
    h1: 'IELTS Sentence Completion Practice Questions',
    title: 'IELTS Sentence Completion Practice & Strategy | IELTS-Bank',
    description: 'Free IELTS Sentence Completion practice with word-limit tactics, grammar checks and passage-order scanning.',
    guide: {
      answer:
        'Complete each sentence with words copied exactly from the passage, within the word limit. The finished sentence must be grammatical \u2014 that is your built-in check that you found the right words.',
      intro: 'Sentence Completion asks you to finish statements with exact words from the passage. The questions normally follow text order, so careful prediction and scanning turn this into a dependable source of marks.',
      tests: 'It tests precise detail, vocabulary paraphrase recognition and whether you can select words that fit both the passage meaning and the sentence grammar.',
      steps: ['Circle the word limit before reading anything else.', 'Predict the missing word class: noun, verb, adjective, number or short phrase.', 'Scan in question order for a paraphrase of the sentence.', 'Copy only the necessary passage words, then read the completed sentence for grammar and meaning.'],
      traps: ['Exceeding the word limit.', 'Copying nearby words that do not fit grammatically.', 'Changing a passage word unnecessarily.', 'Missing plural endings, units or hyphens.'],
      timing: 'Aim for about 45–60 seconds each. Use the ordered questions to keep moving forward through the passage rather than rescanning from the top.',
    },
  },

  'summary-completion': {
    slug: 'summary-completion', questionType: 'summary_completion', label: 'Summary Completion',
    h1: 'IELTS Summary Completion Practice Questions',
    title: 'IELTS Summary Completion Practice & Strategy | IELTS-Bank',
    description: 'Free IELTS Summary Completion practice. Follow the argument, predict grammar and avoid vocabulary-list distractors.',
    guide: {
      answer:
        'Fill the gaps in a short summary of one section of the passage, using words from the text (or from a lettered word bank). The summary paraphrases the passage, so hunt for synonyms rather than identical wording.',
      intro: 'Summary Completion condenses one part of a passage and removes key words. You must follow the summary as a connected explanation, not solve each blank as an isolated vocabulary puzzle.',
      tests: 'It tests your understanding of a section’s main ideas, logical flow and paraphrasing, along with grammatical fit.',
      steps: ['Read the full summary first and identify which passage section it covers.', 'Predict the grammar and meaning required in every blank.', 'If a word list is supplied, group options by part of speech before matching.', 'Confirm each choice against the passage and then reread the entire completed summary.'],
      traps: ['Choosing an option only because it repeats a passage word.', 'Ignoring articles, verb agreement or singular/plural fit.', 'Looking across the entire passage when the summary covers one compact section.', 'Using the same option twice unless instructions allow it.'],
      timing: 'Spend one minute mapping the summary to the passage, then about 45 seconds per blank. Context often resolves two neighbouring blanks together.',
    },
  },

  'note-completion': {
    slug: 'note-completion', questionType: 'note_completion', label: 'Note Completion',
    h1: 'IELTS Note Completion Practice Questions',
    title: 'IELTS Note Completion Practice & Strategy | IELTS-Bank',
    description: 'Free IELTS Note Completion practice with keyword mapping, word-limit control and fast scanning strategies.',
    guide: {
      answer:
        'Complete the notes with words from the passage, within the word limit. Notes follow the passage\u2019s order, and the words around each gap tell you what type of answer to look for \u2014 a name, a number, a noun.',
      intro: 'Note Completion presents compressed headings and bullet points rather than full sentences. The layout reveals the information hierarchy, while the missing entries usually target concrete facts.',
      tests: 'It tests scanning for names, features, causes, examples and numbers and understanding how details sit under broader headings.',
      steps: ['Use headings and indentation to identify the topic of each blank.', 'Predict the answer type and mark the word limit.', 'Scan for the heading idea, then read its supporting sentences closely.', 'Copy the shortest exact phrase that completes the note accurately.'],
      traps: ['Treating bullets as unrelated when they belong to one passage section.', 'Adding explanatory words that break the limit.', 'Missing units or qualifiers attached to numbers.', 'Choosing a broad category when the note requests a specific example.'],
      timing: 'The compact layout makes these relatively quick: target 40–55 seconds per blank after locating the correct section.',
    },
  },

  'table-completion': {
    slug: 'table-completion', questionType: 'table_completion', label: 'Table Completion',
    h1: 'IELTS Table Completion Practice Questions',
    title: 'IELTS Table Completion Practice & Strategy | IELTS-Bank',
    description: 'Free IELTS Table Completion practice. Decode rows and columns, locate comparisons and preserve exact units.',
    guide: {
      answer:
        'Complete the table with words from the passage, within the word limit. Use the row and column headers to jump straight to the right section of the text instead of re-reading everything.',
      intro: 'Table Completion reorganises passage information into rows and columns. Reading both headers before searching is essential because a blank is defined by two categories at once.',
      tests: 'It tests classification, comparison and retrieval of precise facts such as dates, quantities, characteristics or outcomes.',
      steps: ['Read the table title, row labels and column headings aloud as a combined question.', 'Predict the data type and note any units already printed outside the blank.', 'Find the passage section describing that row, then verify the relevant column relationship.', 'Enter only the missing content and check that you have not repeated a printed unit.'],
      traps: ['Reading only the row label and ignoring the column.', 'Writing “20 percent” when the table already supplies the percent sign.', 'Confusing adjacent categories with similar data.', 'Breaking the stated word/number limit.'],
      timing: 'Budget roughly a minute per blank; once the table’s source section is found, complete neighbouring cells together.',
    },
  },

  'flow-chart-completion': {
    slug: 'flow-chart-completion', questionType: 'flowchart_completion', label: 'Flow-Chart Completion',
    h1: 'IELTS Flow-Chart Completion Practice Questions',
    title: 'IELTS Flow-Chart Completion Practice & Strategy | IELTS-Bank',
    description: 'Free IELTS Flow-Chart Completion practice. Learn to follow a process through the passage, track sequence language and fill each stage within the word limit.',
    guide: {
      answer:
        'Complete the stages of a flow-chart with words from the passage (or from a word bank), within the word limit. The chart summarises a process or sequence, so follow the arrows: each box is one stage, and the passage describes the stages in order somewhere in the text.',
      intro:
        'Flow-Chart Completion turns one section of the passage — usually a process, procedure, sequence of events or cause-and-effect chain — into a diagram of boxes joined by arrows, with key words removed. Your task is to restore the missing words. Because the chart mirrors the logical order of the process, it is one of the more predictable completion types once you have located the right part of the text.',
      tests:
        'This type tests whether you can follow a sequence: how one stage leads to the next, what happens first, next and last, and which detail belongs to which step. It rewards recognising sequence signals in the passage — "first", "then", "once", "after", "as a result", "the next stage" — and matching them to positions in the chart.',
      steps: [
        'Read the chart title and skim every box before searching the passage, so you know what process is being described and which details are missing.',
        'Note the word limit and, if there is a lettered word bank, whether options can be reused.',
        'Locate the passage section that describes the process — it is usually contained in one or two paragraphs, not spread across the whole text.',
        'Work through the boxes in arrow order, matching each stage to the passage using sequence words as signposts; the chart order almost always follows the text order.',
        'Copy the exact words that complete each stage, then reread the finished chart from top to bottom to check the process still makes logical sense.',
      ],
      traps: [
        'Filling a box with a detail from the wrong stage — neighbouring steps often mention similar objects or actions.',
        'Missing that the passage describes a stage out of order (for example, a flashback or a summary sentence) even though the chart is strictly sequential.',
        'Exceeding the word limit by copying a whole phrase when only one or two words are missing.',
        'Ignoring the words already printed around a gap, which tell you the answer’s grammatical form and often its exact location in the text.',
      ],
      timing:
        'Once you have found the process section, the chart usually completes quickly — budget about a minute of locating time, then 30–45 seconds per box. If a single box resists, fill the others first; a completed chart often reveals the stubborn stage by elimination.',
    },
  },

  'diagram-label': {
    slug: 'diagram-label', questionType: 'diagram_label', label: 'Diagram Label Completion',
    h1: 'IELTS Diagram Label Completion Practice Questions',
    title: 'IELTS Diagram Label Completion Practice & Strategy | IELTS-Bank',
    description: 'Free IELTS Diagram Label Completion practice. Learn to match parts of a diagram to the passage’s description, use location language and label accurately.',
    guide: {
      answer:
        'Label the parts of a diagram using words from the passage, within the word limit. The diagram shows something the text describes — a machine, structure, organism or invention — and each label points to a part explained somewhere in the description.',
      intro:
        'Diagram Label Completion pairs a technical drawing with the passage section that describes it. The diagram might show a piece of equipment, a natural structure, a building or a historical invention, with arrows pointing at unnamed parts. You supply the missing names or descriptions from the text. The type looks intimidating — especially with unfamiliar technical subjects — but you never need outside knowledge: everything is in the passage.',
      tests:
        'This type tests whether you can connect a written description to its visual counterpart. It rewards understanding language of location and structure ("above", "attached to", "at the base", "inside which", "connected by") and tracking how the passage moves around the object part by part.',
      steps: [
        'Study the diagram first: read its title, the labels already printed, and where each empty label’s arrow points — printed labels are your anchors in the text.',
        'Note the word limit before writing anything.',
        'Find the descriptive section of the passage; diagrams are almost always drawn from one concentrated block of text rather than the whole passage.',
        'For each blank, use the nearest printed label to locate the right sentences, then read carefully for the part in that position — the text will describe it relative to parts you can already see.',
        'Copy the answer exactly as spelled in the passage and check it names the part the arrow actually points to, not a neighbouring component.',
      ],
      traps: [
        'Labelling a nearby part instead of the one indicated — arrows are precise, and the examiner places similar components close together.',
        'Being intimidated by technical vocabulary; the answer is always stated in the text, and unfamiliar terms are usually defined or described around their first mention.',
        'Misspelling a technical word when copying it — a copied answer must be letter-perfect.',
        'Assuming the description follows the diagram top-to-bottom; the passage may describe the object from the inside out or in order of function.',
      ],
      timing:
        'Spend the first minute orienting: diagram, printed labels, then the descriptive paragraph. After that, each label should take about 45 seconds. These questions cluster in one part of the passage, so they are efficient once located — do not let an early hard label stall the whole set.',
    },
  },

  'plan-map-diagram-labelling': {
    slug: 'plan-map-diagram-labelling', questionType: 'plan_map_diagram_label', label: 'Plan / Map Labelling',
    h1: 'IELTS Plan and Map Labelling Practice Questions',
    title: 'IELTS Plan & Map Labelling Practice & Strategy | IELTS-Bank',
    description: 'Free IELTS Plan and Map Labelling practice. Learn to follow directions across a plan or map, master location language and place every label correctly.',
    guide: {
      answer:
        'Match locations on a plan or map to a list of options (or to words from the text), following the directions the passage gives. Fix the labelled reference points first — entrances, roads, named buildings — then trace each route or position from them.',
      intro:
        'Plan and Map Labelling presents a drawn layout — a building floor plan, a town map, a site or campus — with several locations unnamed. Using the passage’s description, you identify what belongs at each marked position. The type is really a test of spatial language: whoever can convert "just beyond the entrance, on your left, opposite the fountain" into a position on the drawing wins the marks.',
      tests:
        'This type tests comprehension of direction and position vocabulary: left and right, north and south, opposite, adjacent, beyond, alongside, in the corner, at the junction. It also tests whether you can keep your orientation as the description moves through the space, since "left" depends on the direction of travel.',
      steps: [
        'Orient yourself on the plan before reading: find the entrance or starting point, any compass rose, and every location that is already labelled.',
        'Read the description and move through the space exactly as the text does, tracing the route on the plan with your finger or cursor.',
        'Anchor each answer to a fixed labelled feature ("opposite the library", "north of the car park") rather than judging positions by eye.',
        'Re-check perspective at every turn: after "turn right", the left side of the page may now be the speaker’s right.',
        'Confirm each label by reading one sentence past the answer — descriptions often add a second clue that verifies or corrects your placement.',
      ],
      traps: [
        'Losing orientation after a change of direction, so every subsequent left/right is reversed.',
        'Confusing similar prepositions: "beside", "beyond" and "behind" put a feature in three different places.',
        'Placing an answer at the first plausible spot instead of following the full description to its endpoint.',
        'Ignoring the compass when the description uses north/south rather than left/right.',
      ],
      timing:
        'Allow around a minute per label, slightly more for the first while you orient. The description normally covers the locations in a single continuous route, so once you are correctly oriented the later labels come faster — which makes early accuracy worth the extra seconds.',
    },
  },

  'matching-sentence-endings': {
    slug: 'matching-sentence-endings', questionType: 'matching_sentence_endings', label: 'Matching Sentence Endings',
    h1: 'IELTS Matching Sentence Endings Practice Questions',
    title: 'IELTS Matching Sentence Endings Practice & Strategy | IELTS-Bank',
    description: 'Free IELTS Matching Sentence Endings practice with grammar-first elimination and paraphrase matching.',
    guide: {
      answer:
        'Match each sentence beginning to the ending (from a lettered list) that completes it according to the passage. Grammar rules out some endings, but the passage \u2014 not logic \u2014 decides the answer.',
      intro: 'Matching Sentence Endings gives sentence beginnings and a longer list of possible endings. Correct pairs must be both grammatically complete and faithful to the passage.',
      tests: 'It tests detailed comprehension, relationships such as cause and effect, and recognition of paraphrased conclusions.',
      steps: ['Read each beginning and predict its grammatical and logical continuation.', 'Eliminate endings that cannot fit grammatically before consulting the text.', 'Locate the beginning’s idea in passage order and identify what the text says next.', 'Test the complete sentence for exact meaning, not merely a plausible general statement.'],
      traps: ['Choosing an ending that is grammatically smooth but unsupported.', 'Matching repeated vocabulary while missing a reversed cause or comparison.', 'Assuming every ending is used.', 'Forgetting that beginnings usually follow passage order.'],
      timing: 'Use grammar to shrink the option list quickly, then spend about one minute confirming each match in the passage.',
    },
  },

  'multiple-choice-multiple-answers': {
    slug: 'multiple-choice-multiple-answers', questionType: 'multiple_choice_multi', label: 'Multiple Choice — Multiple Answers',
    h1: 'IELTS Multiple Choice Multiple-Answer Practice',
    title: 'IELTS Multiple Choice Multiple Answers Practice & Strategy | IELTS-Bank',
    description: 'Free IELTS multi-select Reading practice. Verify every option independently and avoid partly true distractors.',
    guide: {
      intro: 'Multiple-answer questions ask for two or more choices from a longer list. Treat every option as a separate True/False claim; do not stop when the first convincing answer appears.',
      tests: 'They test synthesis across a paragraph or section and your ability to distinguish several supported points from related distractors.',
      steps: ['Underline exactly how many answers are required.', 'Locate the relevant passage section and read its full scope.', 'Test each option independently: supported, contradicted or absent.', 'Select only fully supported options and perform a final count before moving on.'],
      traps: ['Choosing too many or too few answers.', 'Selecting two options that express the same single point.', 'Accepting partly true options.', 'Letting one strong answer bias your judgement of the remaining options.'],
      timing: 'Allow two to three minutes for a set because all options need checking. Eliminate contradicted choices decisively instead of repeatedly rereading them.',
    },
  },
};

// Ordered list of slugs for getStaticPaths and cross-link blocks.
export const READING_QUESTION_TYPE_SLUGS = Object.keys(READING_QUESTION_TYPES);

export function getReadingTypeSeo(typeKey) {
  const config = READING_QUESTION_TYPES[typeKey];
  if (!config) return null;

  const canonical = `${SITE_URL}/reading/${typeKey}`;
  return {
    title: config.title,
    description: config.description,
    canonical,
    ogImage: `${SITE_URL}/api/og?title=${encodeURIComponent(
      config.h1
    )}&type=reading&subtitle=${encodeURIComponent(config.label)}`,
    imageAlt: `${config.h1} — IELTS-Bank`,
  };
}

// Lightweight [{ slug, label }] list for navigation / cross-link UI.
export const READING_QUESTION_TYPE_LINKS = READING_QUESTION_TYPE_SLUGS.map((slug) => ({
  slug,
  label: READING_QUESTION_TYPES[slug].label,
  questionType: READING_QUESTION_TYPES[slug].questionType,
}));

// Advertise practice categories only when the published reading bank has a
// matching question group. Direct strategy-guide URLs remain available.
export function availableReadingTypeLinks(items = []) {
  const available = new Set(items.flatMap((item) => item.questionTypes || []));
  return READING_QUESTION_TYPE_LINKS.filter(({ questionType }) => available.has(questionType));
}

// [{ value: <db question_type enum>, label }] for the Reading list's
// question-type filter dropdown. `value` matches passages' question_groups
// question_type so the list can filter client-side without re-fetching.
export const READING_QUESTION_TYPE_OPTIONS = READING_QUESTION_TYPE_SLUGS.map((slug) => ({
  value: READING_QUESTION_TYPES[slug].questionType,
  label: READING_QUESTION_TYPES[slug].label,
}));
