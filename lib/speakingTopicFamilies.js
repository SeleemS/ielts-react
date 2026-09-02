// lib/speakingTopicFamilies.js
// Single source of truth for the IELTS Speaking TOPIC FAMILY hub pages
// (pages/speaking/topics/[family].js), mirroring lib/listeningQuestionTypes.js.
//
// The family list MUST stay in sync with TOPIC_FAMILIES in
// scripts/content/speaking/topic-schema.mjs (the cue-card generator writes the
// family slug as the FIRST entry of passages.topic_tags). A vitest test asserts
// the two lists match.
//
// Older, hand-authored speaking items pre-date the family tag, so
// classifySpeakingFamily() falls back to tag aliases and then to keywords in
// the title — that way all 80 legacy items land on a hub too.

import { SITE_URL } from './site';

export const SPEAKING_TOPIC_FAMILIES = {
  people: {
    slug: 'people',
    label: 'People',
    h1: 'IELTS Speaking Cue Cards About People',
    title: 'IELTS Speaking Cue Cards: People Topics | IELTS-Bank',
    description:
      'Free IELTS Speaking Part 2 cue cards about people — friends, family, neighbours, colleagues and people you admire — with examiner audio and Band 8–9 model answers.',
    blurb:
      'Cards that ask you to describe a person. Examiners want a clear identity, two or three concrete details about the relationship, and a reason the person matters to you.',
    aliases: ['person', 'friends', 'friendship', 'family', 'relationships', 'role-models', 'admiration', 'neighbours', 'community', 'leadership', 'influence'],
    keywords: ['person', 'people', 'friend', 'family', 'neighbour', 'child', 'couple', 'someone', 'teacher', 'leader', 'stranger', 'classmate', 'colleague'],
  },
  places: {
    slug: 'places',
    label: 'Places',
    h1: 'IELTS Speaking Cue Cards About Places',
    title: 'IELTS Speaking Cue Cards: Places | IELTS-Bank',
    description:
      'Free IELTS Speaking Part 2 cue cards about places — cafés, parks, libraries, markets, cities and buildings — with examiner audio and Band 8–9 model answers.',
    blurb:
      'Cards that ask you to describe a place. Strong answers locate the place quickly, then spend the time on atmosphere, what happens there and why you go back.',
    aliases: ['place', 'places', 'buildings', 'city', 'hometown', 'architecture', 'home', 'cities', 'public-spaces', 'heritage', 'parks', 'green-spaces'],
    keywords: ['place', 'city', 'town', 'village', 'park', 'garden', 'library', 'café', 'cafe', 'market', 'shop', 'room', 'street', 'building', 'centre'],
  },
  objects: {
    slug: 'objects',
    label: 'Objects & possessions',
    h1: 'IELTS Speaking Cue Cards About Objects and Possessions',
    title: 'IELTS Speaking Cue Cards: Objects & Possessions | IELTS-Bank',
    description:
      'Free IELTS Speaking Part 2 cue cards about objects and possessions — clothes, gifts, furniture, tools and keepsakes — with examiner audio and Band 8–9 model answers.',
    blurb:
      'Cards about a thing you own, made, borrowed or lost. Describe it physically for a few seconds, then move to the story attached to it — that is where the band comes from.',
    aliases: ['possessions', 'objects', 'object', 'value', 'gifts', 'clothes', 'colours', 'fashion'],
    keywords: ['object', 'possession', 'clothing', 'furniture', 'bag', 'toy', 'tool', 'gift', 'machine', 'art', 'photograph'],
  },
  events: {
    slug: 'events',
    label: 'Events & occasions',
    h1: 'IELTS Speaking Cue Cards About Events and Occasions',
    title: 'IELTS Speaking Cue Cards: Events & Occasions | IELTS-Bank',
    description:
      'Free IELTS Speaking Part 2 cue cards about events — weddings, parties, concerts, ceremonies and exhibitions — with examiner audio and Band 8–9 model answers.',
    blurb:
      'Cards about an occasion you attended or organised. Narrate in past tense, keep the sequence clear, and finish with why the day stayed with you.',
    aliases: ['events', 'event', 'celebrations', 'ceremony', 'party'],
    keywords: ['wedding', 'party', 'event', 'concert', 'ceremony', 'exhibition', 'celebration', 'performance', 'competition', 'meeting', 'occasion'],
  },
  experiences: {
    slug: 'experiences',
    label: 'Experiences & memories',
    h1: 'IELTS Speaking Cue Cards About Experiences and Memories',
    title: 'IELTS Speaking Cue Cards: Experiences & Memories | IELTS-Bank',
    description:
      'Free IELTS Speaking Part 2 cue cards about experiences and memories — a time you were late, got lost, changed your mind or worked in a team — with model answers.',
    blurb:
      '"Describe a time when…" cards. These reward a proper narrative: set the scene, tell what happened, then reflect on what you took away from it.',
    aliases: ['experience', 'experiences', 'memories', 'memory', 'helping', 'kindness', 'personal-growth', 'decisions', 'advice'],
    keywords: ['time', 'memory', 'experience', 'mistake', 'first', 'day', 'moment', 'occasion when'],
  },
  activities: {
    slug: 'activities',
    label: 'Activities & hobbies',
    h1: 'IELTS Speaking Cue Cards About Activities and Hobbies',
    title: 'IELTS Speaking Cue Cards: Activities & Hobbies | IELTS-Bank',
    description:
      'Free IELTS Speaking Part 2 cue cards about hobbies and free-time activities — sport, games, clubs, creative projects — with examiner audio and Band 8–9 model answers.',
    blurb:
      'Cards about what you do for pleasure. Use the present tense for habits and the past for one memorable session — mixing both shows grammatical range.',
    aliases: ['hobby', 'hobbies', 'leisure', 'sport', 'sports', 'games', 'daily-routine', 'free-time', 'photography'],
    keywords: ['hobby', 'activity', 'game', 'sport', 'club', 'relax', 'weekend', 'creative', 'course', 'class'],
  },
  media: {
    slug: 'media',
    label: 'Media, books & films',
    h1: 'IELTS Speaking Cue Cards About Books, Films and Media',
    title: 'IELTS Speaking Cue Cards: Books, Films & Media | IELTS-Bank',
    description:
      'Free IELTS Speaking Part 2 cue cards about books, films, TV, music, news and social media — with examiner audio and original Band 8–9 model answers.',
    blurb:
      'Cards about something you read, watched or listened to. Summarise the content briefly; the marks are in your reaction and the language you use to evaluate it.',
    aliases: ['books', 'reading', 'film', 'films', 'music', 'media', 'television', 'news'],
    keywords: ['book', 'film', 'series', 'podcast', 'news', 'magazine', 'documentary', 'advertisement', 'music', 'song', 'video', 'story', 'actor', 'cartoon', 'show'],
  },
  'work-study': {
    slug: 'work-study',
    label: 'Work & study',
    h1: 'IELTS Speaking Cue Cards About Work and Study',
    title: 'IELTS Speaking Cue Cards: Work & Study | IELTS-Bank',
    description:
      'Free IELTS Speaking Part 2 cue cards about work and study — jobs, projects, exams, presentations and courses — with examiner audio and Band 8–9 model answers.',
    blurb:
      'Cards about your working or studying life. Precise job and study vocabulary lifts Lexical Resource here more than in almost any other family.',
    aliases: ['work', 'study', 'education', 'career', 'jobs', 'school', 'skills', 'learning'],
    keywords: ['job', 'work', 'career', 'study', 'school', 'exam', 'course', 'project', 'presentation', 'deadline', 'interview', 'subject', 'skill'],
  },
  technology: {
    slug: 'technology',
    label: 'Technology',
    h1: 'IELTS Speaking Cue Cards About Technology',
    title: 'IELTS Speaking Cue Cards: Technology | IELTS-Bank',
    description:
      'Free IELTS Speaking Part 2 cue cards about technology — apps, devices, the internet, robots and online life — with examiner audio and Band 8–9 model answers.',
    blurb:
      'Cards about devices, apps and online life. Avoid drifting into a product review: the examiner wants your use of it and its effect on you.',
    aliases: ['technology', 'tech', 'internet', 'apps', 'devices', 'online', 'society', 'information'],
    keywords: ['app', 'technology', 'device', 'phone', 'computer', 'internet', 'online', 'website', 'robot', 'invention', 'social media', 'video call'],
  },
  nature: {
    slug: 'nature',
    label: 'Nature & environment',
    h1: 'IELTS Speaking Cue Cards About Nature and the Environment',
    title: 'IELTS Speaking Cue Cards: Nature & Environment | IELTS-Bank',
    description:
      'Free IELTS Speaking Part 2 cue cards about nature and the environment — animals, weather, parks, beaches and green issues — with Band 8–9 model answers.',
    blurb:
      'Cards about the natural world. Descriptive adjectives and environmental vocabulary do the heavy lifting, and Part 3 always turns to policy.',
    aliases: ['nature', 'environment', 'animals', 'weather', 'geography', 'seasons', 'green-spaces'],
    keywords: ['nature', 'tree', 'plant', 'animal', 'bird', 'insect', 'weather', 'season', 'beach', 'mountain', 'river', 'environment', 'green', 'countryside'],
  },
  food: {
    slug: 'food',
    label: 'Food & cooking',
    h1: 'IELTS Speaking Cue Cards About Food and Cooking',
    title: 'IELTS Speaking Cue Cards: Food & Cooking | IELTS-Bank',
    description:
      'Free IELTS Speaking Part 2 cue cards about food — meals you cooked, restaurants, snacks, traditional dishes — with examiner audio and Band 8–9 model answers.',
    blurb:
      'Cards about food and meals. Taste and texture vocabulary is the easy win; the risk is listing ingredients instead of telling the story of the meal.',
    aliases: ['food', 'cooking', 'meals', 'restaurant', 'drink', 'diet'],
    keywords: ['food', 'meal', 'dish', 'cook', 'restaurant', 'snack', 'drink', 'recipe', 'dessert', 'fruit', 'vegetable', 'eat'],
  },
  travel: {
    slug: 'travel',
    label: 'Travel & transport',
    h1: 'IELTS Speaking Cue Cards About Travel and Transport',
    title: 'IELTS Speaking Cue Cards: Travel & Transport | IELTS-Bank',
    description:
      'Free IELTS Speaking Part 2 cue cards about travel and transport — trips, journeys, hotels, airports and commuting — with examiner audio and Band 8–9 model answers.',
    blurb:
      'Cards about journeys and getting around. Keep the itinerary short and spend your two minutes on one vivid moment from the trip.',
    aliases: ['travel', 'transport', 'holiday', 'journey', 'trip', 'tourism', 'holidays', 'public-transport'],
    keywords: ['travel', 'trip', 'journey', 'holiday', 'train', 'transport', 'airport', 'hotel', 'traffic', 'route', 'commute', 'road', 'bridge'],
  },
  health: {
    slug: 'health',
    label: 'Health & fitness',
    h1: 'IELTS Speaking Cue Cards About Health and Fitness',
    title: 'IELTS Speaking Cue Cards: Health & Fitness | IELTS-Bank',
    description:
      'Free IELTS Speaking Part 2 cue cards about health and fitness — exercise, diet, sleep, habits and wellbeing — with examiner audio and Band 8–9 model answers.',
    blurb:
      'Cards about keeping well. Talk about routine and effect rather than giving medical advice — the examiner is listening for language, not health knowledge.',
    aliases: ['health', 'fitness', 'exercise', 'wellbeing', 'sleep'],
    keywords: ['health', 'fit', 'exercise', 'diet', 'sleep', 'ill', 'doctor', 'habit', 'tired', 'walk', 'screens'],
  },
  money: {
    slug: 'money',
    label: 'Money & shopping',
    h1: 'IELTS Speaking Cue Cards About Money and Shopping',
    title: 'IELTS Speaking Cue Cards: Money & Shopping | IELTS-Bank',
    description:
      'Free IELTS Speaking Part 2 cue cards about money and shopping — saving, bargains, purchases and subscriptions — with examiner audio and Band 8–9 model answers.',
    blurb:
      'Cards about buying, saving and spending. Exact figures are never required; what earns marks is the reasoning behind the decision.',
    aliases: ['money', 'shopping', 'buying', 'saving', 'prices', 'consumerism'],
    keywords: ['money', 'buy', 'bought', 'shop', 'shopping', 'save', 'saved', 'expensive', 'bargain', 'price', 'purchase', 'paid', 'subscription'],
  },
  culture: {
    slug: 'culture',
    label: 'Culture & festivals',
    h1: 'IELTS Speaking Cue Cards About Culture and Festivals',
    title: 'IELTS Speaking Cue Cards: Culture & Festivals | IELTS-Bank',
    description:
      'Free IELTS Speaking Part 2 cue cards about culture — festivals, customs, traditions, museums and history — with examiner audio and Band 8–9 model answers.',
    blurb:
      'Cards about traditions and cultural life. Explain the custom as though the examiner has never heard of it, then say what it means to people locally.',
    aliases: ['culture', 'festival', 'festivals', 'tradition', 'traditions', 'history', 'customs', 'languages', 'change'],
    keywords: ['culture', 'custom', 'tradition', 'festival', 'holiday', 'museum', 'monument', 'legend', 'historical', 'language', 'dialect', 'craft'],
  },
  'future-plans': {
    slug: 'future-plans',
    label: 'Plans & the future',
    h1: 'IELTS Speaking Cue Cards About Plans and the Future',
    title: 'IELTS Speaking Cue Cards: Plans & the Future | IELTS-Bank',
    description:
      'Free IELTS Speaking Part 2 cue cards about future plans — goals, trips, courses, habits and changes you expect — with examiner audio and Band 8–9 model answers.',
    blurb:
      'Cards about what you intend to do. These are the natural home of future forms: going to, planning to, hoping to, I would rather — use the range.',
    aliases: ['future', 'future-plans', 'plans', 'goals', 'ambition', 'success'],
    keywords: ['future', 'plan', 'would like to', 'want to', 'hope', 'achieve', 'next year', 'looking forward'],
  },
};

// Ordered slugs for getStaticPaths, cross-links and the sitemap.
export const SPEAKING_FAMILY_SLUGS = Object.keys(SPEAKING_TOPIC_FAMILIES);

export function getSpeakingFamilySeo(familySlug) {
  const config = SPEAKING_TOPIC_FAMILIES[familySlug];
  if (!config) return null;
  const canonical = `${SITE_URL}/speaking/topics/${familySlug}`;
  return {
    title: config.title,
    description: config.description,
    canonical,
    ogImage: `${SITE_URL}/api/og?title=${encodeURIComponent(
      config.h1
    )}&type=speaking&subtitle=${encodeURIComponent(config.label)}`,
    imageAlt: `${config.h1} — IELTS-Bank`,
  };
}

// Which family does a speaking item belong to?
//   1. an explicit family slug in topic_tags (batch-generated cards)
//   2. a known alias tag (legacy hand-authored items)
//   3. keyword hit in the title / cue-card topic
//   4. null (item is not shown on a family hub)
export function classifySpeakingFamily({ title = '', topic = '', topicTags = [] } = {}) {
  const tags = (Array.isArray(topicTags) ? topicTags : []).map((t) => String(t).toLowerCase());

  for (const tag of tags) {
    if (SPEAKING_TOPIC_FAMILIES[tag]) return tag;
  }
  for (const tag of tags) {
    const hit = SPEAKING_FAMILY_SLUGS.find((slug) => SPEAKING_TOPIC_FAMILIES[slug].aliases.includes(tag));
    if (hit) return hit;
  }

  const haystack = `${title} ${topic}`
    .toLowerCase()
    // Strip the boilerplate of legacy titles so it cannot produce false hits
    // (the "art" keyword used to match "Part 1").
    .replace(/ielts speaking (cue card|part \d)\s*:?/g, ' ')
    .replace(/\b(questions?|discussion|describe)\b/g, ' ');
  const hasWord = (keyword) => new RegExp(`(^|[^a-z])${keyword}([^a-z]|$)`).test(haystack);
  let best = null;
  let bestScore = 0;
  for (const slug of SPEAKING_FAMILY_SLUGS) {
    const score = SPEAKING_TOPIC_FAMILIES[slug].keywords.reduce(
      (acc, keyword) => acc + (hasWord(keyword) ? 1 : 0),
      0
    );
    if (score > bestScore) {
      best = slug;
      bestScore = score;
    }
  }
  return best;
}

// Lightweight [{ slug, label }] for navigation blocks.
export const SPEAKING_FAMILY_LINKS = SPEAKING_FAMILY_SLUGS.map((slug) => ({
  slug,
  label: SPEAKING_TOPIC_FAMILIES[slug].label,
}));
