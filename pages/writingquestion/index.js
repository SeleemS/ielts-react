import SectionLanding from '../../src/components/SectionLanding';
import { SKILLS, listPassages } from '../../lib/supabase';

export default function WritingIndex({ items }) {
  return (
    <SectionLanding
      section="writing"
      heading="IELTS Writing Practice Questions"
      intro="Practise real IELTS Writing Task 2 prompts and get instant AI-powered feedback scored against the official IELTS rubric. Choose a prompt below to begin."
      title="IELTS Writing Practice Questions with AI Feedback | IELTS-Bank"
      description="Free IELTS Writing practice questions with AI-powered grading. Practise real Task 2 prompts and get instant feedback on your essay against the official IELTS criteria."
      items={items}
    />
  );
}

export async function getStaticProps() {
  const items = await listPassages(SKILLS.writing);
  return { props: { items }, revalidate: 3600 };
}
