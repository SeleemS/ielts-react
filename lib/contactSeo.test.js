import { describe, expect, it } from 'vitest';
import { CONTACT_SEO } from './contactSeo';

describe('contact page SEO', () => {
  it('publishes a complete canonical social-card contract', () => {
    expect(CONTACT_SEO.title).toBe('Contact Us | IELTS-Bank');
    expect(CONTACT_SEO.description).toContain('hello@ielts-bank.com');
    expect(CONTACT_SEO.canonical).toBe('https://www.ielts-bank.com/contactus');
    expect(CONTACT_SEO.imageAlt).toContain('IELTS-Bank');
  });

  it('encodes every dynamic social-card parameter safely', () => {
    const url = new URL(CONTACT_SEO.ogImage);

    expect(url.pathname).toBe('/api/og');
    expect(url.searchParams.get('title')).toBe('Questions about IELTS-Bank?');
    expect(url.searchParams.get('type')).toBe('contact');
    expect(url.searchParams.get('subtitle')).toBe('Contact Us');
  });
});
