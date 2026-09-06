// Browser push services only. See docs/audit-2026-09-06/README.md
// for the audit and provider trust policy.
const EXACT_HOSTS = new Set([
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'updates-push.services.mozaws.net',
]);
const PROVIDER_SUFFIXES = ['.push.apple.com', '.notify.windows.com'];

export function validPushEndpoint(value) {
  if (typeof value !== 'string' || value.length > 1000) return '';
  // Check the raw authority as well as URL parsing: URL normalizes :443,
  // backslashes and whitespace, while web-push uses Node's legacy parser.
  const match = /^https:\/\/([a-z0-9.-]+)(?:[/?][^#]*)?$/i.exec(value);
  if (!match || /[\s\\\u0000-\u001f\u007f]/.test(value)) return '';
  const host = match[1].toLowerCase();
  if (!host.split('.').every((label) => /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(label))) return '';
  if (!EXACT_HOSTS.has(host) && !PROVIDER_SUFFIXES.some((suffix) => host.endsWith(suffix))) return '';
  try {
    const url = new URL(value);
    if (url.hostname !== host || url.protocol !== 'https:' || url.username || url.password || url.port || url.hash) return '';
    return value; // Subscription paths/query tokens are opaque; never rewrite them.
  } catch {
    return '';
  }
}
