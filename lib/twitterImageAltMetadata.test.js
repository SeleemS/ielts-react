import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const templates = [
  '../src/pages/HomePage.js',
  '../src/pages/AboutUs.js',
  '../src/pages/ContactUs.jsx',
  '../src/pages/PrivacyPolicy.js',
  '../src/pages/TermsOfService.js',
  '../pages/pricing.jsx',
  '../pages/speaking-examiner.js',
  '../pages/ielts-writing-checker.jsx',
  '../pages/band-calculator.js',
  '../pages/mock-test.js',
  '../pages/mock/[slug].js',
  '../pages/blog/index.js',
  '../pages/blog/[slug].js',
  '../pages/reading/[type].js',
];

describe.each(templates)('%s', (path) => {
  it('gives the Twitter image an accessible description', () => {
    const source = readFileSync(new URL(path, import.meta.url), 'utf8');

    expect(source).toContain('name="twitter:image:alt"');
  });
});
