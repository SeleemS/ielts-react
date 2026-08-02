#!/usr/bin/env node
/**
 * indexnow-ping.mjs
 * -----------------
 * Submit site URLs to IndexNow (instant Bing/Copilot/Yandex/Naver/Seznam
 * indexing; Google does not consume IndexNow). The key is self-issued and
 * proven by hosting public/<key>.txt at the site root — no account needed.
 *
 * Usage:
 *   node scripts/indexnow-ping.mjs                  # submit every sitemap URL
 *   node scripts/indexnow-ping.mjs /blog/foo /pricing   # submit specific paths
 *   node scripts/indexnow-ping.mjs --dry-run
 *
 * Run after publishing new content (blog posts, new passages) or a large
 * content change. Batch limit per IndexNow spec: 10,000 URLs per POST.
 */
const SITE = 'https://www.ielts-bank.com';
const KEY = '01984fdbff8e84fd2dcbf3a29275d300'; // public by design; proven via /<key>.txt

const args = process.argv.slice(2).filter((a) => a !== '--dry-run');
const DRY_RUN = process.argv.includes('--dry-run');

async function sitemapUrls() {
  const response = await fetch(`${SITE}/sitemap.xml`);
  if (!response.ok) throw new Error(`sitemap fetch: ${response.status}`);
  const xml = await response.text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
}

async function main() {
  const urlList = args.length
    ? args.map((p) => (p.startsWith('http') ? p : `${SITE}${p.startsWith('/') ? '' : '/'}${p}`))
    : await sitemapUrls();
  console.log(`[indexnow] submitting ${urlList.length} URLs${DRY_RUN ? ' (dry run)' : ''}`);
  if (DRY_RUN) {
    console.log(urlList.slice(0, 5).join('\n') + (urlList.length > 5 ? `\n… +${urlList.length - 5} more` : ''));
    return;
  }
  const response = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: new URL(SITE).host,
      key: KEY,
      keyLocation: `${SITE}/${KEY}.txt`,
      urlList,
    }),
  });
  // 200 = submitted, 202 = accepted (key validation pending) — both fine.
  console.log(`[indexnow] response: ${response.status} ${response.statusText}`);
  if (response.status >= 400) {
    console.error(await response.text());
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('[indexnow] fatal:', error.message);
  process.exit(1);
});
