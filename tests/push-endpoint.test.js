import { describe, expect, it, vi } from 'vitest';
import { validPushEndpoint } from '../lib/pushEndpoint';
import { sendPush } from '../lib/webPush';

const allowed = [
  'https://fcm.googleapis.com/fcm/send/opaque',
  'https://fcm.googleapis.com/wp/opaque',
  'https://updates.push.services.mozilla.com/wpush/v2/opaque',
  'https://push.services.mozilla.com/wpush/opaque',
  'https://updates-push.services.mozaws.net/push/opaque',
  'https://web.push.apple.com/opaque',
  'https://region.web.push.apple.com/opaque',
  'https://wns2-db5p.notify.windows.com/w/?token=opaque%2Ftoken',
];
const blocked = [
  'https://attacker.example/collect', 'https://localhost/x', 'https://127.0.0.1/x',
  'https://169.254.169.254/x', 'https://[::1]/x', 'http://fcm.googleapis.com/wp/x',
  'https://fcm.googleapis.com.attacker.example/x', 'https://evilpush.apple.com/x',
  'https://push.apple.com.attacker.example/x', 'https://notify.windows.com.attacker.example/x',
  'https://fcm.googleapis.com:443/x', 'https://fcm.googleapis.com:8443/x',
  'https://user:pass@fcm.googleapis.com/x', 'https://fcm.googleapis.com@attacker.example/x',
  'https://fcm.googleapis.com/x#fragment', 'https://fcm.googleapis.com/x#',
  ' https://fcm.googleapis.com/x', 'https://fcm.googleapis.com/\nx',
  'https://fcm.googleapis.com\\@attacker.example/x', 'https://fcm.googleapis.com./x',
  'https://%66cm.googleapis.com/x', 'https://.push.apple.com/x',
];
describe('push endpoint trust boundary', () => {
  it.each(allowed)('preserves supported opaque endpoint %s', (endpoint) => {
    expect(validPushEndpoint(endpoint)).toBe(endpoint);
  });
  it.each(blocked)('rejects untrusted or ambiguous endpoint %s', async (endpoint) => {
    expect(validPushEndpoint(endpoint)).toBe('');
    const webPush = { setVapidDetails: vi.fn(), sendNotification: vi.fn() };
    expect(await sendPush({ endpoint }, {}, { webPush })).toEqual({ sent: false, gone: true, reason: 'invalid-push-endpoint' });
    expect(webPush.setVapidDetails).not.toHaveBeenCalled();
    expect(webPush.sendNotification).not.toHaveBeenCalled();
  });
});
