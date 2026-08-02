import { ImageResponse } from '@vercel/og';
import { ogTypeLabel } from '../../lib/ogCard';

// Edge runtime is required by @vercel/og (Satori) for on-the-fly image rendering.
export const config = { runtime: 'edge' };

// ---------------------------------------------------------------------------
// Brand tokens
// ---------------------------------------------------------------------------
const NAVY = '#0A2540'; // deep navy background
const NAVY_DEEP = '#071B2E'; // slightly darker for the vignette base
const EMERALD = '#059669'; // brand accent
const EMERALD_LIGHT = '#34D399'; // brighter emerald for glow / highlights
const WHITE = '#FFFFFF';
const SLATE = '#94A6BC'; // muted footer / wordmark tail

const DEFAULT_TITLE = 'Master IELTS with real, auto-scored practice';

// Keep incoming user text sane: coerce to string, strip control chars, clamp
// length so a hostile / absurd query param can never blow up rendering.
function clean(value, max) {
  if (value == null) return '';
  let s = String(value);
  // Strip control characters (keep normal printable + accented text).
  // eslint-disable-next-line no-control-regex
  s = s.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim();
  if (s.length > max) s = s.slice(0, max - 1).trimEnd() + '…';
  return s;
}

// Fetch Inter (bold + regular) at runtime. Satori supports ttf/otf/woff (not
// woff2), so we pull the woff builds fontsource ships. Any failure resolves to
// null and we fall back to @vercel/og's bundled default font — never throws.
async function loadFont(url) {
  try {
    const res = await fetch(url, { cache: 'force-cache' });
    if (!res.ok) return null;
    return await res.arrayBuffer();
  } catch {
    return null;
  }
}

// Band scores arrive as a query param on shared result cards. Snap to the real
// IELTS half-band scale and reject anything outside it so a hostile param can
// only ever render a legitimate-looking band.
function cleanBand(value) {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return null;
  const snapped = Math.round(parsed * 2) / 2;
  if (snapped < 1 || snapped > 9) return null;
  return snapped;
}

const BAND_SKILLS = new Set(['reading', 'listening', 'writing', 'speaking', 'overall', 'mock']);

function bandDescriptorLabel(band) {
  if (band >= 8.5) return 'Expert user';
  if (band >= 7.5) return 'Very good user';
  if (band >= 6.5) return 'Good user';
  if (band >= 5.5) return 'Competent user';
  if (band >= 4.5) return 'Modest user';
  return 'Limited user';
}

// 1200x630 card for a shared band result: big ring + band number, skill label,
// and an honest "estimated on IELTS-Bank" footer.
function bandCard({ band, skill, fontFamily }) {
  const skillLabel =
    skill === 'mock'
      ? 'Timed mock test'
      : skill === 'overall'
        ? 'Overall estimate'
        : `${skill.charAt(0).toUpperCase()}${skill.slice(1)}`;
  return (
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        position: 'relative',
        backgroundColor: NAVY,
        backgroundImage: `radial-gradient(900px circle at 88% 8%, ${EMERALD}55, transparent 42%), radial-gradient(700px circle at 6% 100%, ${EMERALD_LIGHT}22, transparent 40%), linear-gradient(140deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`,
        padding: '64px 72px',
        fontFamily,
        color: WHITE,
      }}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 14,
          backgroundImage: `linear-gradient(180deg, ${EMERALD_LIGHT}, ${EMERALD})`,
        }}
      />
      {/* Left column: wordmark + copy */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 34, fontWeight: 700 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 52,
              height: 52,
              borderRadius: 14,
              backgroundColor: EMERALD,
              color: WHITE,
              fontSize: 30,
              fontWeight: 700,
              marginRight: 18,
            }}
          >
            IB
          </div>
          <span style={{ color: WHITE }}>IELTS</span>
          <span style={{ color: EMERALD_LIGHT }}>-Bank</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              backgroundColor: EMERALD,
              color: WHITE,
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: 2,
              padding: '10px 22px',
              borderRadius: 999,
            }}
          >
            {skillLabel.toUpperCase()}
          </div>
          <div style={{ display: 'flex', marginTop: 30, fontSize: 64, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1 }}>
            Can you beat this band?
          </div>
          <div style={{ display: 'flex', marginTop: 22, fontSize: 30, color: SLATE }}>
            Free practice with instant marking
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 26, color: SLATE }}>
          <div style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: EMERALD_LIGHT, marginRight: 14 }} />
          Estimated on ielts-bank.com
        </div>
      </div>
      {/* Right column: the band ring */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 420 }}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: 360,
            height: 360,
            borderRadius: 999,
            border: `18px solid ${EMERALD}`,
            backgroundColor: `${NAVY_DEEP}CC`,
            boxShadow: `0 0 120px ${EMERALD}66`,
          }}
        >
          <div style={{ display: 'flex', fontSize: 130, fontWeight: 700, lineHeight: 1, color: WHITE }}>
            {band.toFixed(1)}
          </div>
          <div style={{ display: 'flex', marginTop: 8, fontSize: 26, fontWeight: 700, letterSpacing: 3, color: EMERALD_LIGHT }}>
            BAND
          </div>
          <div style={{ display: 'flex', marginTop: 6, fontSize: 22, color: SLATE }}>
            {bandDescriptorLabel(band)}
          </div>
        </div>
      </div>
    </div>
  );
}

export default async function handler(req) {
  const { searchParams } = new URL(req.url);

  const title = clean(searchParams.get('title'), 120) || DEFAULT_TITLE;
  const rawType = clean(searchParams.get('type'), 20).toLowerCase();
  const subtitle = clean(searchParams.get('subtitle'), 40);
  const band = cleanBand(searchParams.get('band'));
  const bandSkill = clean(searchParams.get('skill'), 12).toLowerCase();
  const pill = ogTypeLabel(rawType);

  const [interBold, interRegular] = await Promise.all([
    loadFont(
      'https://cdn.jsdelivr.net/npm/@fontsource/inter@4.5.15/files/inter-latin-700-normal.woff'
    ),
    loadFont(
      'https://cdn.jsdelivr.net/npm/@fontsource/inter@4.5.15/files/inter-latin-400-normal.woff'
    ),
  ]);

  const fonts = [];
  if (interRegular) fonts.push({ name: 'Inter', data: interRegular, weight: 400, style: 'normal' });
  if (interBold) fonts.push({ name: 'Inter', data: interBold, weight: 700, style: 'normal' });
  const fontFamily = fonts.length ? 'Inter' : undefined;

  // Band-result layout: /api/og?band=7.0&skill=reading (shared score cards).
  if (band !== null && BAND_SKILLS.has(bandSkill)) {
    return new ImageResponse(bandCard({ band, skill: bandSkill, fontFamily }), {
      width: 1200,
      height: 630,
      ...(fonts.length ? { fonts } : {}),
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control':
          'public, immutable, no-transform, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800',
      },
    });
  }

  // Scale the title down a touch when it is long so wrapping stays graceful.
  const titleSize = title.length > 72 ? 58 : title.length > 44 ? 68 : 78;

  const image = (
    <div
      style={{
        height: '100%',
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        backgroundColor: NAVY,
        backgroundImage: `radial-gradient(900px circle at 88% 8%, ${EMERALD}55, transparent 42%), radial-gradient(700px circle at 6% 100%, ${EMERALD_LIGHT}22, transparent 40%), linear-gradient(140deg, ${NAVY} 0%, ${NAVY_DEEP} 100%)`,
        padding: '64px 72px',
        fontFamily,
        color: WHITE,
      }}
    >
      {/* Decorative emerald accent bar down the left edge */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          bottom: 0,
          width: 14,
          backgroundImage: `linear-gradient(180deg, ${EMERALD_LIGHT}, ${EMERALD})`,
        }}
      />

      {/* Header: wordmark */}
      <div style={{ display: 'flex', alignItems: 'center', fontSize: 34, fontWeight: 700 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 52,
            height: 52,
            borderRadius: 14,
            backgroundColor: EMERALD,
            color: WHITE,
            fontSize: 30,
            fontWeight: 700,
            marginRight: 18,
          }}
        >
          IB
        </div>
        <span style={{ color: WHITE }}>IELTS</span>
        <span style={{ color: EMERALD_LIGHT }}>-Bank</span>
      </div>

      {/* Middle: pill + title */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          justifyContent: 'center',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: EMERALD,
              color: WHITE,
              fontSize: 24,
              fontWeight: 700,
              letterSpacing: 2,
              padding: '10px 22px',
              borderRadius: 999,
            }}
          >
            {pill}
          </div>
          {subtitle ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                marginLeft: 16,
                border: `2px solid ${EMERALD_LIGHT}88`,
                color: EMERALD_LIGHT,
                fontSize: 22,
                fontWeight: 700,
                letterSpacing: 1,
                padding: '8px 20px',
                borderRadius: 999,
              }}
            >
              {subtitle.toUpperCase()}
            </div>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            marginTop: 34,
            fontSize: titleSize,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: -1,
            color: WHITE,
            // Satori line-clamp: cap at 3 lines with an ellipsis.
            lineClamp: 3,
          }}
        >
          {title}
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          fontSize: 26,
          color: SLATE,
          fontWeight: 400,
        }}
      >
        <div style={{ width: 12, height: 12, borderRadius: 999, backgroundColor: EMERALD_LIGHT, marginRight: 14 }} />
        Free IELTS practice · ielts-bank.com
      </div>
    </div>
  );

  return new ImageResponse(image, {
    width: 1200,
    height: 630,
    ...(fonts.length ? { fonts } : {}),
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, immutable, no-transform, max-age=86400, s-maxage=31536000, stale-while-revalidate=604800',
    },
  });
}
