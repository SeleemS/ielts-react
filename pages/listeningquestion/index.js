import SectionLanding from '../../src/components/SectionLanding';
import { SKILLS, listPassages } from '../../lib/supabase';

export default function ListeningIndex({ items }) {
  return (
    <SectionLanding
      section="listening"
      heading="IELTS Listening Practice Questions"
      intro="Practise authentic IELTS Listening recordings with real exam-style questions and instant scoring. Choose a recording below to get started."
      title="IELTS Listening Practice Questions | IELTS-Bank"
      description="Free IELTS Listening practice questions with authentic audio recordings, real exam-style questions and instant scoring to help you raise your Listening band score."
      items={items}
    />
  );
}

export async function getStaticProps() {
  const items = await listPassages(SKILLS.listening);
  return { props: { items }, revalidate: 3600 };
}
