// lib/scoreRequirementsSeo.js
// Title/description/OG contract for the per-country score-requirement pages
// (/ielts-score-requirements/<country>). Kept out of the page component so the
// 70-character title budget is unit-testable rather than eyeballed.

import { SITE_URL } from './site';

export const SCORE_REQUIREMENTS_PATH = '/ielts-score-requirements';

export function countryScoreRequirementsSeo(country) {
  // Longest name in the set is "the United Arab Emirates" (24 chars), which
  // puts the worst case at 66 characters including the site suffix.
  const title = `IELTS Score Requirements for ${country.shortName} | IELTS-Bank`;
  const description =
    `Typical IELTS bands for ${country.shortName} — student visa, skilled migration, ` +
    `undergraduate and postgraduate study, and professional registration — with the ` +
    `official source for each figure and university minimums, checked ${country.verifiedOn}.`;

  return {
    title,
    description,
    canonical: `${SITE_URL}${SCORE_REQUIREMENTS_PATH}/${country.slug}`,
    ogImage: `${SITE_URL}/api/og?title=${encodeURIComponent(
      `IELTS Scores for ${country.shortName}`
    )}&type=guide&subtitle=${encodeURIComponent('Visas, universities & registration')}`,
    imageAlt: `IELTS score requirements for ${country.name} — visas, universities and professional registration`,
  };
}
