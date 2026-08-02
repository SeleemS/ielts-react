const AD_FREE_ROUTE =
  /^\/(?:dashboard|auth|band-estimator|ielts-writing-checker|pricing|billing(?:\/|$)|mock(?:\/|$)|r(?:\/|$|\?)|(?:reading|writing|listening|speaking)question\/)/;

export function adsAllowedForPath(asPath = '') {
  return !AD_FREE_ROUTE.test(String(asPath));
}

export function adsAllowedForConsent(optionalConsent) {
  return optionalConsent === 'granted';
}
