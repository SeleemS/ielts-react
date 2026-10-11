// Carry navigation context only. Never include answers, prompts, audio paths,
// arbitrary query parameters, or external URLs in checkout return links.
const UPGRADES = new Set(['writing', 'speaking', 'mock', 'practice']);
const STAGES = new Set(['saved', 'sample']);
const RETURN_PATHS = {
  writing: /^(?:\/writingquestion\/[a-z0-9_-]+|\/ielts-writing-checker|\/band-estimator|\/writing-report\/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i,
  speaking: /^\/speakingquestion\/[a-z0-9_-]+$/i,
  mock: /^(?:\/mock\/[a-z0-9_-]+|\/mock-test)$/i,
  practice: /^\/(?:reading|listening)question\/[a-z0-9_-]+$/i,
};

export function normalizeUpgradeContext(input = {}) {
  const context = {};
  if (!UPGRADES.has(input?.upgrade)) return context;
  context.upgrade = input.upgrade;
  if (STAGES.has(input.stage)) context.stage = input.stage;
  if (typeof input.return_to === 'string' && input.return_to.length <= 250
    && RETURN_PATHS[context.upgrade].test(input.return_to)) {
    context.return_to = input.return_to;
  }
  return context;
}

export function buildUpgradeHref(input = {}) {
  const query = new URLSearchParams(normalizeUpgradeContext(input)).toString();
  return `/pricing${query ? `?${query}` : ''}`;
}

export function checkoutReturnUrls(origin, input = {}) {
  const context = new URLSearchParams(normalizeUpgradeContext(input)).toString();
  const suffix = context ? `&${context}` : '';
  return {
    success_url: `${origin}/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}${suffix}`,
    cancel_url: `${origin}/pricing?checkout=canceled${suffix}`,
  };
}
