export const config = { runtime: 'nodejs' };

import { vapidConfig } from '../../../lib/webPush';

// The VAPID public key the browser needs as applicationServerKey. Public by
// definition (it ships inside every push subscription), but served from the
// server so the private half never travels and no NEXT_PUBLIC_ duplicate of
// the pair has to be kept in sync.
export default function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  const config = vapidConfig();
  if (!config) return res.status(503).json({ error: 'Push is not configured.' });
  res.setHeader('Cache-Control', 'public, max-age=3600');
  return res.status(200).json({ key: config.publicKey });
}
