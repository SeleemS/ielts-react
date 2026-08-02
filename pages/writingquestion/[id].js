import WritingQuestion from '../../src/pages/WritingQuestion';
import {
  SKILLS,
  getLegacyIdSlugMap,
  getPassageSlugs,
  getStructuredPassage,
  getRelatedPractice,
  toMetaDescription,
} from '../../lib/supabase';

export default WritingQuestion;

export async function getStaticPaths() {
  // Canonical URL only per passage (legacy Firestore id when present — some
  // contain spaces — else slug); the other variant renders via blocking
  // fallback. Building both doubled question-page build time.
  const [legacyMap, slugs] = await Promise.all([
    getLegacyIdSlugMap(SKILLS.writing),
    getPassageSlugs(SKILLS.writing),
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
  const passage = await getStructuredPassage(SKILLS.writing, params.id);
  if (!passage) return { notFound: true };
  const related = await getRelatedPractice(SKILLS.writing, passage.slug);

  return {
    props: {
      id: params.id,
      passage,
      description: toMetaDescription(passage.bodyHtml),
      related,
    },
    revalidate: 3600,
  };
}
