import ListeningQuestion from '../../src/pages/ListeningQuestion';
import {
  SKILLS,
  getLegacyIdSlugMap,
  getPassageSlugs,
  getStructuredPassage,
  getRelatedPractice,
  toMetaDescription,
} from '../../lib/supabase';

export default ListeningQuestion;

export async function getStaticPaths() {
  // Canonical URL only per passage (legacy id when present, else slug); the
  // other variant renders via blocking fallback.
  const [legacyMap, slugs] = await Promise.all([
    getLegacyIdSlugMap(SKILLS.listening),
    getPassageSlugs(SKILLS.listening),
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
  const passage = await getStructuredPassage(SKILLS.listening, params.id);
  if (!passage) return { notFound: true };
  const related = await getRelatedPractice(
    SKILLS.listening,
    passage.slug,
    passage.groups?.[0]?.questionType
  );

  const description =
    toMetaDescription(passage.bodyHtml) ||
    `Practise IELTS Listening with "${passage.title}". Listen to the audio and answer the questions.`;

  return {
    props: {
      id: params.id,
      passage,
      description,
      related,
    },
    revalidate: 3600,
  };
}
