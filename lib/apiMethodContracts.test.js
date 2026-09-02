import { describe, expect, it } from 'vitest';
import cleanupHandler from '../pages/api/cron/cleanup';
import dailyReportHandler from '../pages/api/cron/daily-report';
import lifecycleEmailsHandler from '../pages/api/cron/lifecycle-emails';
import unsubscribeHandler from '../pages/api/newsletter/unsubscribe';

// [name, handler, rejectedMethod, expectedAllow]. The unsubscribe route also
// accepts POST — RFC 8058 one-click unsubscribe — so its rejected method is a
// different one.
const handlers = [
  ['cleanup cron', cleanupHandler, 'POST', 'GET'],
  ['daily-report cron', dailyReportHandler, 'POST', 'GET'],
  ['lifecycle-emails cron', lifecycleEmailsHandler, 'POST', 'GET'],
  ['newsletter unsubscribe', unsubscribeHandler, 'PUT', 'GET, POST'],
];

function responseRecorder() {
  return {
    headers: {},
    statusCode: null,
    ended: false,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

describe.each(handlers)('%s method contract', (_name, handler, rejectedMethod, allow) => {
  it('returns 405 with the supported method in Allow', async () => {
    const response = responseRecorder();

    await handler({ method: rejectedMethod, headers: {} }, response);

    expect(response.statusCode).toBe(405);
    expect(response.headers.allow).toBe(allow);
    expect(response.ended).toBe(true);
  });
});
