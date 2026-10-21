import { SITE_URL } from './site';

const title = 'Contact Us | IELTS-Bank';
const description =
  'Get in touch with the IELTS-Bank team. Email us at hello@ielts-bank.com or use our contact form for questions about IELTS practice and preparation.';

export const CONTACT_SEO = {
  title,
  description,
  canonical: `${SITE_URL}/contactus`,
  ogImage: `${SITE_URL}/api/og?title=${encodeURIComponent(
    'Questions about IELTS-Bank?'
  )}&type=contact&subtitle=Contact Us`,
  imageAlt: 'Contact the IELTS-Bank team',
};
