// lib/task2TopicsSeo.js
// Canonical title/description/OG contract for the monthly Task 2 roundup pages
// (/ielts-writing-task-2-topics/<month>). Kept out of the page component so the
// 70-character title budget and the canonical shape are unit-testable.

import { SITE_URL } from './site';

export const TASK2_TOPICS_PATH = '/ielts-writing-task-2-topics';

/**
 * @param {{ label: string, slug: string }} month  from parseMonthSlug()
 * @param {number} count  how many prompts the page actually lists
 */
export function monthlyTask2Seo(month, count) {
  // Budget: "IELTS Writing Task 2 Topics: September 2026 | IELTS-Bank" is 55
  // characters at the longest month name, comfortably inside the 70-char limit.
  const title = `IELTS Writing Task 2 Topics: ${month.label} | IELTS-Bank`;
  const description =
    `${count} IELTS Writing Task 2 practice questions grouped by essay frame — opinion, ` +
    `discussion, advantages and disadvantages, problem and solution, positive or negative, ` +
    `and two-part. Updated ${month.label}.`;

  return {
    title,
    description,
    canonical: `${SITE_URL}${TASK2_TOPICS_PATH}/${month.slug}`,
    ogImage: `${SITE_URL}/api/og?title=${encodeURIComponent(
      `Task 2 Topics — ${month.label}`
    )}&type=guide&subtitle=${encodeURIComponent('Grouped by essay frame')}`,
    imageAlt: `IELTS Writing Task 2 practice questions for ${month.label}, grouped by essay frame`,
  };
}
