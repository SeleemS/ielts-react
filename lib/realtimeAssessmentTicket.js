import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

function signature(body) {
  const key = process.env.REALTIME_ASSESSMENT_SECRET;
  if (!key || key.length < 32) throw new Error('assessment-signing-not-configured');
  return createHmac('sha256', key).update(body).digest('base64url');
}

export function issueAssessmentTicket({ userId, mode, durationSeconds }, now = Date.now()) {
  const claims = { userId, mode, durationSeconds, requestId: randomUUID(), expiresAt: now + 86400000 };
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return { ticket: `${body}.${signature(body)}`, ...claims };
}

export function verifyAssessmentTicket(ticket, { userId, mode, requestId }, now = Date.now()) {
  try {
    if (typeof ticket !== 'string' || ticket.length > 2000) return null;
    const [body, sig, extra] = ticket.split('.');
    if (!body || !sig || extra) return null;
    const expected = Buffer.from(signature(body));
    const actual = Buffer.from(sig);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
    const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
    return claims.userId === userId && claims.mode === mode && claims.requestId === requestId
      && claims.expiresAt > now && claims.expiresAt <= now + 86400000
      && Number.isInteger(claims.durationSeconds) && claims.durationSeconds > 0 && claims.durationSeconds <= 840
      ? claims : null;
  } catch { return null; }
}
