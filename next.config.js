/** @type {import('next').NextConfig} */

// ---------------------------------------------------------------------------
// Content-Security-Policy
// ---------------------------------------------------------------------------
// Inventory of every external origin the app actually loads (see pages/_app.js,
// pages/_document.js, lib/supabase.js, pages/api/score/*):
//   * Next.js runtime            -> 'self' + inline bootstrap ('unsafe-inline')
//   * Google AdSense             -> pagead2.googlesyndication.com and the wider
//                                   googlesyndication / doubleclick /
//                                   googletagservices / adtrafficquality set
//                                   (script, frame, img, connect)
//   * Google Analytics (gtag)    -> googletagmanager.com + google-analytics.com,
//                                   both DIRECT and via the first-party /gt proxy
//                                   ('self' covers the proxied path)
//   * Vercel Analytics/Speed     -> va.vercel-scripts.com (script),
//                                   vitals.vercel-insights.com (connect)
//   * Supabase                   -> the project origin, in connect-src (data +
//                                   auth) AND media-src (audio from Storage)
//   * MediaRecorder playback     -> blob: in media-src and worker-src
//
// 'unsafe-eval' is added ONLY in development (React Fast Refresh / Next dev
// tooling needs it); production script-src does not include it.
const SUPABASE_ORIGIN = 'https://nnqbagvknskqyrxkbyct.supabase.co';
const isDev = process.env.NODE_ENV !== 'production';

const cspDirectives = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-inline'", // Next.js inline runtime + inline gtag-init in _app.js
    ...(isDev ? ["'unsafe-eval'"] : []),
    'https://pagead2.googlesyndication.com',
    'https://*.googlesyndication.com',
    'https://googleads.g.doubleclick.net',
    'https://*.g.doubleclick.net',
    'https://www.googletagservices.com',
    'https://adservice.google.com',
    'https://www.googletagmanager.com',
    'https://www.google-analytics.com',
    'https://ssl.google-analytics.com',
    'https://va.vercel-scripts.com',
  ],
  'script-src-elem': [
    "'self'",
    "'unsafe-inline'",
    'https://pagead2.googlesyndication.com',
    'https://*.googlesyndication.com',
    'https://googleads.g.doubleclick.net',
    'https://*.g.doubleclick.net',
    'https://www.googletagservices.com',
    'https://adservice.google.com',
    'https://www.googletagmanager.com',
    'https://www.google-analytics.com',
    'https://ssl.google-analytics.com',
    'https://va.vercel-scripts.com',
  ],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': [
    "'self'",
    'data:',
    'blob:',
    'https:', // AdSense/analytics pull tracking pixels + creatives from many hosts
  ],
  'font-src': ["'self'", 'data:'],
  'media-src': [
    "'self'",
    'blob:', // MediaRecorder recording playback
    'data:',
    SUPABASE_ORIGIN, // listening/speaking audio from Supabase Storage
  ],
  'worker-src': ["'self'", 'blob:'],
  'connect-src': [
    "'self'",
    SUPABASE_ORIGIN,
    'https://api.openai.com', // Realtime examiner: SDP exchange + ephemeral session (speaking-examiner)
    'https://vitals.vercel-insights.com',
    'https://www.google-analytics.com',
    'https://*.google-analytics.com',
    'https://analytics.google.com',
    'https://region1.google-analytics.com',
    'https://www.googletagmanager.com',
    'https://pagead2.googlesyndication.com',
    'https://*.googlesyndication.com',
    'https://googleads.g.doubleclick.net',
    'https://*.g.doubleclick.net',
    'https://*.adtrafficquality.google',
  ],
  'frame-src': [
    "'self'",
    'https://googleads.g.doubleclick.net',
    'https://*.g.doubleclick.net',
    'https://tpc.googlesyndication.com',
    'https://*.googlesyndication.com',
    'https://www.google.com',
    'https://*.adtrafficquality.google',
  ],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'self'"],
  'upgrade-insecure-requests': [],
  'report-uri': ['/api/csp-report'],
  'report-to': ['csp-endpoint'],
};

function buildCsp(directives) {
  return Object.entries(directives)
    .map(([key, values]) =>
      values.length ? `${key} ${values.join(' ')}` : key
    )
    .join('; ');
}

const CSP = buildCsp(cspDirectives);

// Enforced headers applied to every route. Violations are reported to the
// same-origin endpoint so policy regressions are observable in server logs.
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  {
    key: 'Permissions-Policy',
    // Speaking practice uses MediaRecorder -> same-origin microphone MUST stay
    // allowed. Camera and geolocation are fully disabled.
    value: 'camera=(), geolocation=(), microphone=(self)',
  },
  { key: 'Reporting-Endpoints', value: 'csp-endpoint="/api/csp-report"' },
  { key: 'Content-Security-Policy', value: CSP },
];

const nextConfig = {
  reactStrictMode: true,
  // lib/posts.js reads content/posts/*.md with fs.readdirSync. Next's tracer
  // cannot follow a dynamic directory read, so the two routes that load posts
  // at REQUEST time (rather than only at build time) would ship without the
  // markdown files and throw ENOENT on Vercel. The blog pages are SSG and bake
  // their content in at build, so they need no entry here.
  outputFileTracingIncludes: {
    '/sitemap.xml': ['./content/posts/**'],
    '/api/cron/lifecycle-emails': ['./content/posts/**'],
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // Static brand assets change only when the files themselves are
        // replaced in a deploy, so let browsers keep them for a year.
        source: '/:asset(favicon.ico|image.png|logo192.png|logo512.png)',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      // First-party proxy for Google Analytics so ad blockers that block
      // googletagmanager.com / analytics.google.com don't drop hits.
      {
        source: '/gt/js',
        destination: 'https://www.googletagmanager.com/gtag/js',
      },
      {
        source: '/gt/g/collect',
        destination: 'https://analytics.google.com/g/collect',
      },
    ];
  },
};

module.exports = nextConfig;
