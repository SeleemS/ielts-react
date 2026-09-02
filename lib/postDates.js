// lib/postDates.js
// Date formatting for blog post metadata.
//
// WHY THIS IS NOT IN lib/posts.js: lib/posts.js reads the filesystem, so it may
// only ever be imported from getStaticProps / getStaticPaths / API routes —
// Next strips those, and the module with them, from the client bundle. These
// two helpers are used inside the rendered component, so importing them from
// lib/posts.js would pin that module (and `fs`) into the browser build and fail
// `next build` with "Module not found: Can't resolve 'fs'". Keeping them here
// keeps the server-only boundary honest.

// "August 2, 2026" -> "August 2026". The visible freshness line under the H1
// shows month precision on purpose: a day-level "Updated" stamp invites the
// reader to expect daily revision, which is not what `updated` means here.
export function formatMonthYear(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

// ISO-8601 for <time dateTime> and JSON-LD. Returns null for an unparseable
// value so callers can omit the attribute rather than emit garbage.
export function toIsoDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
