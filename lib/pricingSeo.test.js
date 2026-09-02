import { describe, expect, it } from 'vitest';
import { PRICING_SEO } from './pricingSeo';

describe('pricing SEO', () => {
  it('publishes a complete canonical social-card contract', () => {
    expect(PRICING_SEO.title).toContain('IELTS Bank Pro');
    expect(PRICING_SEO.description.length).toBeGreaterThan(120);
    expect(PRICING_SEO.canonical).toBe('https://www.ielts-bank.com/pricing');
    expect(PRICING_SEO.ogImage).toBe(
      'https://www.ielts-bank.com/api/og?title=Know%20exactly%20what%20is%20holding%20your%20IELTS%20band%20back&type=pricing&subtitle=Pro'
    );
    expect(PRICING_SEO.imageAlt).toContain('IELTS Bank Pro');
  });

  it('describes the three plans actually on sale and no expired promotion', () => {
    const description = PRICING_SEO.description;
    expect(description).toContain('monthly');
    expect(description).toContain('annually');
    expect(description).toContain('Exam Pass');
    expect(description).toContain('30-day');
    expect(description).toContain('14-day money-back guarantee');
    // The retired plans and the ended Summer Sale must not linger in metadata.
    expect(description).not.toMatch(/3 months|three months|6 months|six months/i);
    expect(description).not.toMatch(/sale/i);
  });

  it('keeps every dynamic image parameter URL-safe', () => {
    const url = new URL(PRICING_SEO.ogImage);

    expect(url.origin).toBe('https://www.ielts-bank.com');
    expect(url.pathname).toBe('/api/og');
    expect(url.searchParams.get('type')).toBe('pricing');
    expect(url.searchParams.get('subtitle')).toBe('Pro');
  });
});
