// src/lib/writingUpsell.js
// Visibility rules for the post-result Writing prompt shown after a Reading or
// Listening submission. Reading/Listening bring most of the traffic but used to
// dead-end at the answer key, while AI Writing scoring is what actually
// converts — this is the bridge between the two.
//
// Pure so the rules are unit-testable without rendering Supabase-backed hooks.
//
// Returns one of:
//   null        — show nothing (mock tests, unsupported skills, still loading)
//   'free'      — "paste an essay, free report" → the writing checker
//   'upgrade'   — free sample already spent and no Pro → /pricing?upgrade=writing
//   'premium'   — Pro subscriber: score another essay, already included

const SUPPORTED_SKILLS = new Set(['reading', 'listening']);

export function writingPromptVariant({
  skill,
  isMock = false,
  isPremium = false,
  planLoading = false,
  freeSampleUsed = null,
  sampleLoading = false,
} = {}) {
  // Mock tests have their own post-mock next-steps block and a paid gate of
  // their own; another upsell inside the results would be noise.
  if (isMock) return null;
  if (!SUPPORTED_SKILLS.has(skill)) return null;
  // Never flash the wrong offer while entitlements are still resolving.
  if (planLoading || sampleLoading) return null;
  if (isPremium) return 'premium';
  // `null` = signed out, or the quota row could not be read. Both mean we have
  // no evidence the sample is spent, so the honest offer is the free one.
  if (freeSampleUsed === true) return 'upgrade';
  return 'free';
}

// Human-readable score line for the card headline. Prefers the band estimate
// the results UI already shows; falls back to the raw fraction when a skill or
// module has no band table (per the report brief).
export function formatResultScore({ skill, band, score, total }) {
  const label = skill === 'listening' ? 'Listening' : 'Reading';
  if (typeof band === 'number' && Number.isFinite(band)) {
    return `Your ${label.toLowerCase()} is Band ${band}`;
  }
  if (Number.isFinite(score) && Number.isFinite(total) && total > 0) {
    return `You scored ${score}/${total} on ${label}`;
  }
  return `Nice work on ${label}`;
}
