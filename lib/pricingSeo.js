import { SITE_URL } from './site';

const title = 'IELTS Bank Pro – AI Feedback, Examiner & Mock Tests';
const description =
  'IELTS Bank Pro unlocks full AI Writing feedback, Speaking scoring, live examiner practice, and timed mock tests — billed monthly, annually, or as a one-time 30-day Exam Pass that never renews. Every plan is covered by a 14-day money-back guarantee.';

export const PRICING_SEO = {
  title,
  description,
  canonical: `${SITE_URL}/pricing`,
  ogImage: `${SITE_URL}/api/og?title=${encodeURIComponent(
    'Know exactly what is holding your IELTS band back'
  )}&type=pricing&subtitle=Pro`,
  imageAlt: 'IELTS Bank Pro plans with AI feedback, examiner practice, and mock tests',
};
