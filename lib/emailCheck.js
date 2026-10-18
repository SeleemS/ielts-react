// Sign-up email checks shared by SignInDialog (client) and
// /api/auth/signup-check (server).
//
//   suggestEmailFix(email)   -> 'name@gmail.com' when the domain looks like a
//                               typo of a common provider ("gamil.com",
//                               "gmail.con", "gmail.comgv"), else null.
//   isDisposableEmail(email) -> true for throwaway inbox domains.
//   emailAliasKey(email)     -> one key per real inbox: Gmail ignores dots and
//                               "+tags", the other big providers ignore +tags.
//                               Keep in step with public.email_alias_key().
//
// Oct 2026: 29% of accounts never verified, many of them typo domains whose
// code email could never arrive.

const COMMON_DOMAINS = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'live.com',
  'aol.com',
  'qq.com',
  '163.com',
  'mail.ru',
  'yandex.ru',
  'proton.me',
  'protonmail.com',
  'yahoo.co.in',
  'rediffmail.com',
];

// Real providers that sit one or two edits from a common one — never "fix" them.
const LOOKALIKE_REAL_DOMAINS = new Set(['email.com', 'mail.com', 'gmx.com', 'ymail.com', 'zoho.com', 'live.co.uk', 'me.com']);

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);
const PLUS_TAG_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'icloud.com',
  'me.com',
  'proton.me',
  'protonmail.com',
  'fastmail.com',
]);

// The throwaway-inbox services that show up in sign-up abuse. Subdomains match
// too (e.g. "x.mailinator.com").
const DISPOSABLE_DOMAINS = new Set([
  '10minutemail.com',
  '10minutemail.net',
  '1secmail.com',
  '1secmail.net',
  '1secmail.org',
  'burnermail.io',
  'discard.email',
  'dispostable.com',
  'emailondeck.com',
  'fakeinbox.com',
  'getairmail.com',
  'getnada.com',
  'guerrillamail.biz',
  'guerrillamail.com',
  'guerrillamail.de',
  'guerrillamail.info',
  'guerrillamail.net',
  'guerrillamail.org',
  'guerrillamailblock.com',
  'grr.la',
  'harakirimail.com',
  'inboxkitten.com',
  'mailcatch.com',
  'maildrop.cc',
  'mailinator.com',
  'mailnesia.com',
  'mailpoof.com',
  'mintemail.com',
  'moakt.com',
  'mohmal.com',
  'mytemp.email',
  'nada.email',
  'sharklasers.com',
  'spamgourmet.com',
  'temp-mail.io',
  'temp-mail.org',
  'tempail.com',
  'tempmail.com',
  'tempmail.net',
  'tempmailo.com',
  'tempr.email',
  'throwawaymail.com',
  'trashmail.com',
  'trashmail.de',
  'yopmail.com',
  'yopmail.fr',
  'yopmail.net',
]);

function splitEmail(email) {
  const value = String(email || '').trim().toLowerCase();
  const at = value.lastIndexOf('@');
  if (at <= 0 || at === value.length - 1) return null;
  return { local: value.slice(0, at), domain: value.slice(at + 1) };
}

// Optimal-string-alignment distance: insert, delete, substitute, or swap two
// neighbouring letters ("gmial") each cost one edit.
function editDistance(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j += 1) d[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      }
    }
  }
  return d[a.length][b.length];
}

export function suggestEmailFix(email) {
  const parts = splitEmail(email);
  if (!parts) return null;
  const { local, domain } = parts;
  if (COMMON_DOMAINS.includes(domain) || GMAIL_DOMAINS.has(domain) || LOOKALIKE_REAL_DOMAINS.has(domain)) return null;

  // "gmail.comgv" — a known domain with stray letters after it. A country
  // suffix ("yahoo.com.hk") is a real domain, not a typo.
  for (const known of COMMON_DOMAINS) {
    const tail = domain.slice(known.length);
    if (domain.startsWith(known) && tail.length <= 3 && !/^\.[a-z]{2}$/.test(tail)) return `${local}@${known}`;
  }

  let best = null;
  let bestDistance = Infinity;
  for (const known of COMMON_DOMAINS) {
    const distance = editDistance(domain, known);
    if (distance < bestDistance) {
      best = known;
      bestDistance = distance;
    }
  }
  // Two edits for long names ("gmaill.con"), one for short ones ("qq.co").
  const allowed = best && best.length >= 8 ? 2 : 1;
  return best && bestDistance <= allowed ? `${local}@${best}` : null;
}

export function isDisposableEmail(email) {
  const parts = splitEmail(email);
  if (!parts) return false;
  const labels = parts.domain.split('.');
  for (let i = 0; i < labels.length - 1; i += 1) {
    if (DISPOSABLE_DOMAINS.has(labels.slice(i).join('.'))) return true;
  }
  return false;
}

export function emailAliasKey(email) {
  const parts = splitEmail(email);
  if (!parts) return null;
  let { local, domain } = parts;
  if (PLUS_TAG_DOMAINS.has(domain)) local = local.split('+')[0];
  if (GMAIL_DOMAINS.has(domain)) {
    local = local.replace(/\./g, '');
    domain = 'gmail.com';
  }
  return `${local}@${domain}`;
}

// "jane.smith@gmail.com" -> "ja•••@gmail.com": enough for the owner to
// recognise their address without exposing it to anyone probing.
export function maskEmail(email) {
  const parts = splitEmail(email);
  if (!parts) return '';
  const shown = parts.local.slice(0, Math.min(2, Math.max(1, parts.local.length - 1)));
  return `${shown}•••@${parts.domain}`;
}
