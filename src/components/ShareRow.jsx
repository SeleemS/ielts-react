import * as React from 'react';
import { Share2, Link2, Check } from 'lucide-react';
import { track } from '../lib/analytics';
import { SITE_URL } from '../../lib/site';
import { cn } from '../lib/utils';

// Share affordance for result moments (mock band, estimator, calculator,
// writing report, dashboard trend) and content pages. The audience is
// WhatsApp/Telegram-first, so those channels are always visible; the native
// share sheet (which surfaces WhatsApp on top on mobile) leads when the
// browser supports it. Every link is UTM-tagged so shared traffic stops
// landing as "direct", and every tap emits share_click.
//
// Honesty rule: `text` must describe a real result or real page — never
// invented numbers.

function shareUrl(path, channel, campaign) {
  const base = path.startsWith('http') ? path : `${SITE_URL}${path}`;
  const sep = base.includes('?') ? '&' : '?';
  return `${base}${sep}utm_source=share&utm_medium=${encodeURIComponent(channel)}&utm_campaign=${encodeURIComponent(campaign)}`;
}

export default function ShareRow({
  text,
  path = '/',
  source = 'result',
  label = 'Share',
  className = '',
}) {
  const [canNative, setCanNative] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    // navigator.share is detected after mount so SSR and hydration agree.
    setCanNative(typeof navigator !== 'undefined' && typeof navigator.share === 'function');
  }, []);

  const fire = (channel) => track('share_click', { channel, source });

  const onNative = async () => {
    fire('native');
    try {
      await navigator.share({ text, url: shareUrl(path, 'native', source) });
    } catch {
      // User dismissed the sheet — nothing to do.
    }
  };

  const onCopy = async () => {
    fire('copy');
    try {
      await navigator.clipboard.writeText(`${text} ${shareUrl(path, 'copy', source)}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (permissions); leave the button as-is.
    }
  };

  const encodedFor = (channel) => {
    const url = shareUrl(path, channel, source);
    return { url: encodeURIComponent(url), text: encodeURIComponent(text), both: encodeURIComponent(`${text} ${url}`) };
  };

  const pill =
    'inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 py-1.5 text-xs font-semibold text-foreground no-underline transition-colors hover:bg-accent/10';

  const wa = encodedFor('whatsapp');
  const tg = encodedFor('telegram');
  const x = encodedFor('x');

  return (
    <div className={cn('flex flex-wrap items-center justify-center gap-2', className)}>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {canNative ? (
        <button type="button" onClick={onNative} className={cn(pill, 'border-accent/40 text-accent')}>
          <Share2 className="h-3.5 w-3.5" /> Share
        </button>
      ) : null}
      <a
        href={`https://wa.me/?text=${wa.both}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => fire('whatsapp')}
        className={pill}
      >
        WhatsApp
      </a>
      <a
        href={`https://t.me/share/url?url=${tg.url}&text=${tg.text}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => fire('telegram')}
        className={pill}
      >
        Telegram
      </a>
      <a
        href={`https://twitter.com/intent/tweet?text=${x.text}&url=${x.url}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => fire('x')}
        className={pill}
      >
        X
      </a>
      <button type="button" onClick={onCopy} className={pill}>
        {copied ? <Check className="h-3.5 w-3.5 text-accent" /> : <Link2 className="h-3.5 w-3.5" />}
        {copied ? 'Copied' : 'Copy link'}
      </button>
    </div>
  );
}
