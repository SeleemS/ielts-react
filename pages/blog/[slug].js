import Head from "next/head";
import NextLink from "next/link";
import { ArrowLeft, ArrowRight, CalendarCheck, PenLine } from "lucide-react";
import Navbar from "../../src/components/Navbar";
import Footer from "../../src/components/Footer";
import NewsletterSignup from "../../src/components/NewsletterSignup";
import { posts, formatMonthYear, toIsoDate } from "../../lib/posts";
import { sanitizeHtml } from "../../lib/sanitize";
import AdUnit from "../../src/components/AdUnit";
import ShareRow from "../../src/components/ShareRow";
import { track } from "../../src/lib/analytics";

import { SITE_URL } from "../../lib/site";

// Explicit "prose"-like typography via arbitrary child selectors. The
// @tailwindcss/typography plugin is intentionally NOT used; Tailwind Preflight
// is also off, so every element the CMS HTML can emit is styled here directly.
const PROSE = [
  "max-w-none text-base leading-8 text-slate-700",
  "[&_h2]:mt-10 [&_h2]:mb-4 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:tracking-tight [&_h2]:text-foreground",
  "[&_h3]:mt-8 [&_h3]:mb-3 [&_h3]:text-xl [&_h3]:font-semibold [&_h3]:text-foreground",
  "[&_p]:mb-5",
  "[&_ul]:mb-5 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-5 [&_ol]:list-decimal [&_ol]:pl-6",
  "[&_li]:mb-2 [&_li]:pl-1 [&_li]:marker:text-accent",
  "[&_strong]:font-semibold [&_strong]:text-foreground",
  "[&_em]:italic",
  "[&_a]:font-medium [&_a]:text-accent [&_a]:underline [&_a]:underline-offset-2 hover:[&_a]:text-accent/80",
  "[&_blockquote]:my-6 [&_blockquote]:border-l-4 [&_blockquote]:border-accent/40 [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-muted-foreground",
  // Tables: comparison tables are among the most quotable things a guide can
  // publish, so they get first-class styling here rather than rendering as
  // unstyled rows. The wrapper below supplies the horizontal scroll on mobile.
  "[&_table]:my-6 [&_table]:w-full [&_table]:border-collapse [&_table]:text-left [&_table]:text-sm",
  "[&_caption]:mb-2 [&_caption]:text-left [&_caption]:text-sm [&_caption]:font-semibold [&_caption]:text-foreground",
  "[&_th]:border [&_th]:border-border [&_th]:bg-muted/40 [&_th]:px-3 [&_th]:py-2 [&_th]:align-top [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground",
  "[&_td]:border [&_td]:border-border [&_td]:px-3 [&_td]:py-2 [&_td]:align-top",
].join(" ");

export default function BlogPost({ post }) {
  const canonical = `${SITE_URL}/blog/${post.slug}`;
  const ogImage = `${SITE_URL}/api/og?title=${encodeURIComponent(
    post.title
  )}&type=blog&subtitle=${encodeURIComponent("IELTS Blog")}`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: post.title,
    description: post.excerpt,
    image: [ogImage],
    datePublished: toIsoDate(post.date),
    // Honest freshness signal: posts carry `updated` only when actually revised,
    // so dateModified falls back to the publish date rather than "today".
    dateModified: toIsoDate(post.updated || post.date),
    // The Quick answer capsule is the article's own summary of its answer, so
    // it is the correct `abstract` — assistants quoting the page get the
    // reviewed sentence rather than a scrape of the opening paragraph.
    ...(post.answer ? { abstract: post.answer } : {}),
    mainEntityOfPage: {
      "@type": "WebPage",
      "@id": canonical,
    },
    author: {
      "@type": "Organization",
      name: "IELTS-Bank",
      url: SITE_URL,
    },
    publisher: {
      "@type": "Organization",
      name: "IELTS-Bank",
      url: SITE_URL,
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/logo512.png`,
      },
    },
  };

  // Emitted only when the post actually carries FAQ entries; the rendered
  // section below is built from the same array.
  const faqJsonLd = post.faq?.length
    ? {
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: post.faq.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      }
    : null;

  return (
    <>
      <Head>
        <title>{`${post.title} | IELTS-Bank`}</title>
        <meta name="description" content={post.excerpt} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={canonical} />

        <meta property="og:type" content="article" />
        <meta property="og:title" content={post.title} />
        <meta property="og:description" content={post.excerpt} />
        <meta property="og:url" content={canonical} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={ogImage} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:alt" content={`IELTS-Bank Blog — ${post.title}`} />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={post.title} />
        <meta name="twitter:description" content={post.excerpt} />
        <meta name="twitter:image" content={ogImage} />
        <meta name="twitter:image:alt" content={`IELTS-Bank Blog — ${post.title}`} />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
        {faqJsonLd ? (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(faqJsonLd).replace(/</g, "\\u003c"),
            }}
          />
        ) : null}
      </Head>

      <div className="flex min-h-screen flex-col bg-secondary/40">
        <Navbar />

        <main className="flex-1">
          <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 md:py-14 lg:px-8">
            <NextLink
              href="/blog"
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent no-underline hover:text-accent/80"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Blog
            </NextLink>

            <article className="mt-6 rounded-xl border border-border bg-card p-6 shadow-sm sm:p-10">
              <header className="mb-8 border-b border-border pb-8">
                <time
                  dateTime={toIsoDate(post.date) || undefined}
                  className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                >
                  {post.date}
                </time>
                <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight text-foreground sm:text-4xl">
                  {post.title}
                </h1>

                {/* Visible freshness line, shown only for genuinely revised
                    articles. It mirrors the JSON-LD dateModified above, so a
                    reader and a crawler never see different claims. */}
                {post.updated ? (
                  <p className="mt-3 flex items-center gap-1.5 text-sm text-muted-foreground">
                    <CalendarCheck className="h-4 w-4" />
                    Updated{' '}
                    <time dateTime={toIsoDate(post.updated) || undefined}>
                      {formatMonthYear(post.updated)}
                    </time>
                  </p>
                ) : null}

                {/* Quick answer capsule: the direct answer to the question the
                    title implies, before the article, so a reader (or an
                    assistant citing the page) gets it without scrolling. */}
                {post.answer ? (
                  <div className="mt-6 rounded-xl border border-accent/30 bg-accent/10 p-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-accent">
                      Quick answer
                    </p>
                    <p className="mt-2 leading-relaxed text-foreground">{post.answer}</p>
                  </div>
                ) : null}
              </header>

              {/* overflow-x-auto so a wide comparison table scrolls inside the
                  article instead of forcing the page to scroll sideways. */}
              <div
                className={`${PROSE} overflow-x-auto`}
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.content) }}
              />

              {/* Optional per-post FAQ. Rendered from the SAME array that feeds
                  the FAQPage JSON-LD above, so the structured data can never
                  describe questions the reader cannot see. */}
              {post.faq?.length ? (
                <section className="mt-10 border-t border-border pt-8">
                  <h2 className="text-2xl font-bold tracking-tight text-foreground">
                    Frequently asked questions
                  </h2>
                  <div className="mt-5 space-y-4">
                    {post.faq.map((item) => (
                      <div
                        key={item.q}
                        className="rounded-xl border border-border bg-card p-5 shadow-sm"
                      >
                        <h3 className="text-base font-semibold text-foreground">{item.q}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                          {item.a}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}
              <ShareRow
                className="mt-8 justify-start border-t border-border pt-6"
                label="Share this guide"
                source="blog_post"
                path={`/blog/${post.slug}`}
                text={post.title}
              />
            </article>
            <AdUnit />

            <section className="mt-8 rounded-2xl bg-slate-950 p-6 text-white sm:p-8">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
                  <PenLine className="h-5 w-5" />
                </span>
                <div>
                  <h2 className="text-xl font-bold">Turn this strategy into a scored essay</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">
                    Try your first AI Writing sample score free, then use the criterion feedback to
                    choose your next practice target.
                  </p>
                  <NextLink
                    href={`/ielts-writing-checker?source=blog&article=${encodeURIComponent(post.slug)}`}
                    onClick={() => track("product_cta_click", { source: "blog", article: post.slug, product: "writing_checker" })}
                    className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white no-underline hover:bg-emerald-400"
                  >
                    Check my essay <ArrowRight className="h-4 w-4" />
                  </NextLink>
                </div>
              </div>
            </section>

            <div className="mt-10">
              <NewsletterSignup source={`blog:${post.slug}`} variant="full" />
            </div>

            <div className="mt-8 text-center">
              <NextLink
                href="/blog"
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent no-underline hover:text-accent/80"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to all articles
              </NextLink>
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}

export async function getStaticPaths() {
  return {
    paths: posts.map((post) => ({ params: { slug: post.slug } })),
    fallback: false,
  };
}

export async function getStaticProps({ params }) {
  const post = posts.find((p) => p.slug === params.slug) || null;

  if (!post) {
    return { notFound: true };
  }

  return { props: { post } };
}
