import SpeakingQuestion from '../../src/pages/SpeakingQuestion';
import {
  SKILLS,
  getLegacyIdSlugMap,
  getPassageSlugs,
  getSpeakingItem,
  getRelatedPractice,
} from '../../lib/supabase';

export default SpeakingQuestion;

// Build a short meta description from the item's topic/theme.
function describe(item) {
  const topic = item?.topic || item?.title || 'IELTS Speaking';
  return `Practise IELTS Speaking Part ${item?.part} — "${topic}". Hear the examiner, record your answer, and get instant AI band feedback.`;
}

export async function getStaticPaths() {
  // Canonical URL only per passage (legacy id when present, else slug); the
  // other variant renders via blocking fallback.
  const [legacyMap, slugs] = await Promise.all([
    getLegacyIdSlugMap(SKILLS.speaking),
    getPassageSlugs(SKILLS.speaking),
  ]);
  const slugsWithLegacyId = new Set(Object.values(legacyMap));
  const ids = Array.from(
    new Set([...Object.keys(legacyMap), ...slugs.filter((s) => !slugsWithLegacyId.has(s))])
  );
  return {
    paths: ids.map((id) => ({ params: { id } })),
    fallback: 'blocking',
  };
}

export async function getStaticProps({ params }) {
  const item = await getSpeakingItem(params.id);
  if (!item) return { notFound: true };
  const related = await getRelatedPractice(SKILLS.speaking, item.slug, item.part);

  return {
    props: {
      id: params.id,
      item,
      description: describe(item),
      related,
    },
    revalidate: 3600,
  };
}
