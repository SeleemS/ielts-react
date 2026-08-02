export const config = { runtime: 'nodejs' };

import { createClient } from '@supabase/supabase-js';
import { getMockTest } from '../../../lib/supabase';
import { fetchPremiumStatus } from '../../../lib/premium';

let adminClient = null;
function getAdmin() {
  if (adminClient) return adminClient;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('supabase-admin-not-configured');
  adminClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return adminClient;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const match = /^Bearer\s+(.+)$/i.exec(String(req.headers.authorization || '').trim());
  if (!match) return res.status(401).json({ error: 'Sign in first.' });

  let admin;
  let data;
  let error;
  try {
    admin = getAdmin();
    ({ data, error } = await admin.auth.getUser(match[1].trim()));
  } catch (authError) {
    console.error('protected mock auth failed:', authError.message);
    return res.status(503).json({ error: 'Could not verify access. Please try again.' });
  }
  if (error || !data?.user) return res.status(401).json({ error: 'Sign in first.' });

  const slug = typeof req.query.slug === 'string' ? req.query.slug : '';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return res.status(400).json({ error: 'Invalid mock test.' });
  }

  // Entitlement resolves BEFORE the content fetch starts (protected content is
  // never even loaded for non-premium callers — tests pin this). The latency
  // win comes from getMockTest fetching its sections concurrently instead.
  const premium = await fetchPremiumStatus(admin, data.user.id);
  if (premium.error) {
    console.error('protected mock entitlement failed:', premium.error.message);
    return res.status(503).json({ error: 'Could not verify access. Please try again.' });
  }
  if (!premium.isPremium) {
    return res.status(402).json({ error: 'Premium is required.', reason: 'premium_required' });
  }
  try {
    const mock = await getMockTest(slug);
    if (!mock?.sections?.length) return res.status(404).json({ error: 'Mock test not found.' });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json({ mock });
  } catch (mockError) {
    console.error('protected mock load failed:', mockError.message);
    return res.status(503).json({ error: 'Could not load this mock test.' });
  }
}
