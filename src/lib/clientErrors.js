// src/lib/clientErrors.js
// Two jobs, both invisible when nothing is wrong:
//
// 1. RECOVER — after a deploy, a tab opened on the previous build requests
//    hashed chunk files that no longer exist on its next SPA navigation
//    (ChunkLoadError). Next.js has no built-in recovery: the visitor lands on
//    the "Application error: a client-side exception has occurred" screen.
//    We detect the stale-chunk signature and hard-navigate once, which loads
//    the current deployment; a per-URL sessionStorage guard prevents reload
//    loops when the failure is anything other than staleness.
//
// 2. REPORT — surviving unhandled exceptions send a rate-limited
//    `client_error` event through track() (consent-gated like every other
//    event), so real user-facing crashes are visible in activity_events with
//    a message and path instead of only as mystery "Application error" page
//    titles in GA.

const RELOADED_KEY = 'ib_chunk_reload';
const MAX_REPORTS_PER_PAGE = 3;
let reportsSent = 0;

const CHUNK_RE =
  /ChunkLoadError|Loading chunk [^ ]* ?failed|Loading CSS chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i;

export function isStaleChunkError(error) {
  if (!error) return false;
  if (typeof error === 'string') return CHUNK_RE.test(error);
  return CHUNK_RE.test(`${error.name || ''} ${error.message || ''}`);
}

function alreadyReloadedFor(url) {
  try {
    return window.sessionStorage.getItem(RELOADED_KEY) === url;
  } catch {
    // Storage unavailable: we cannot guard against a loop, so don't reload.
    return true;
  }
}

function markReloadedFor(url) {
  try {
    window.sessionStorage.setItem(RELOADED_KEY, url);
  } catch {
    /* best effort */
  }
}

// Hard-navigate to the target (or current) URL so the browser fetches the
// live build. Returns whether a reload was actually issued.
export function recoverFromStaleChunk(targetUrl) {
  const url = targetUrl || window.location.href;
  if (alreadyReloadedFor(url)) return false;
  markReloadedFor(url);
  window.location.assign(url);
  return true;
}

export function reportClientError(message, source) {
  if (reportsSent >= MAX_REPORTS_PER_PAGE) return;
  reportsSent += 1;
  try {
    // Late import: this module must stay parse-time dependency-free so the
    // error path can never be the thing that crashes.
    import('./analytics')
      .then(({ track }) =>
        track('client_error', {
          message: String(message || 'unknown').slice(0, 300),
          source: String(source || 'unknown').slice(0, 120),
          path: window.location.pathname,
        })
      )
      .catch(() => {});
  } catch {
    /* never throw from an error handler */
  }
}

// Installs the route-error recovery plus window-level reporting. Returns a
// cleanup function (used by the _app effect).
export function installClientErrorHandlers(router) {
  const onRouteError = (error, url) => {
    if (error?.cancelled) return;
    if (isStaleChunkError(error) && recoverFromStaleChunk(url)) return;
    reportClientError(error?.message || String(error), 'routeChangeError');
  };
  const onWindowError = (event) => {
    const error = event?.error || { message: event?.message };
    if (isStaleChunkError(error)) {
      recoverFromStaleChunk();
      return;
    }
    reportClientError(event?.message, event?.filename || 'window.onerror');
  };
  const onRejection = (event) => {
    const reason = event?.reason;
    if (isStaleChunkError(reason)) {
      recoverFromStaleChunk();
      return;
    }
    reportClientError(
      reason && typeof reason === 'object' ? reason.message : String(reason),
      'unhandledrejection'
    );
  };

  router.events.on('routeChangeError', onRouteError);
  window.addEventListener('error', onWindowError);
  window.addEventListener('unhandledrejection', onRejection);
  return () => {
    router.events.off('routeChangeError', onRouteError);
    window.removeEventListener('error', onWindowError);
    window.removeEventListener('unhandledrejection', onRejection);
  };
}
