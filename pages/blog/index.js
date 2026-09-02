import Head from "next/head";
import NextLink from "next/link";
import { ArrowRight } from "lucide-react";
import Navbar from "../../src/components/Navbar";
import Footer from "../../src/components/Footer";
import { Card } from "../../components/ui/card";
import { posts } from "../../lib/posts";

import { SITE_URL } from "../../lib/site";
const PAGE_TITLE = "IELTS Blog: Tips, Strategies and Band Score Guides | IELTS-Bank";
const PAGE_DESCRIPTION =
  "Free IELTS preparation articles covering Reading, Writing, Listening and Speaking strategies, band score calculation, and proven tips to raise your score.";

const OG_IMAGE = `${SITE_URL}/api/og?title=${encodeURIComponent(
  "Strategies, tips and band score guides"
)}&type=blog&subtitle=${encodeURIComponent("IELTS Blog")}`;

export default function BlogIndex({ posts }) {
  const canonical = `${SITE_URL}/blog`;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "IELTS-Bank Blog",
    description: PAGE_DESCRIPTION,
    url: canonical,
    hasPart: posts.map((post) => ({
      "@type": "BlogPosting",
      headline: post.title,
      url: `${SITE_URL}/blog/${post.slug}`,
      datePublished: new Date(post.date).toISOString(),
    })),
  };

  return (
    <>
      <Head>
        <title>{PAGE_TITLE}</title>
        <meta name="description" content={PAGE_DESCRIPTION} />
        <meta name="robots" content="index, follow" />
        <link rel="canonical" href={canonical} />

        <meta property="og:type" content="website" />
        <meta property="og:title" content={PAGE_TITLE} />
        <meta property="og:description" content={PAGE_DESCRIPTION} />
        <meta property="og:url" content={canonical} />
        <meta property="og:site_name" content="IELTS-Bank" />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:type" content="image/png" />
        <meta
          property="og:image:alt"
          content="IELTS-Bank Blog — strategies, tips and band score guides"
        />

        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={PAGE_TITLE} />
        <meta name="twitter:description" content={PAGE_DESCRIPTION} />
        <meta name="twitter:image" content={OG_IMAGE} />
        <meta
          name="twitter:image:alt"
          content="IELTS-Bank Blog — strategies, tips and band score guides"
        />

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
        />
      </Head>

      <div className="flex min-h-screen flex-col bg-background">
        <Navbar />

        <main className="flex-1 bg-secondary/40">
          <div className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6 md:py-16 lg:px-8">
            <header className="mb-10 max-w-2xl">
              <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-accent">
                IELTS-Bank Blog
              </p>
              <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                Strategies, tips and band score guides
              </h1>
              <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
                Everything you need to prepare for every part of the IELTS exam,
                written to help you raise your band score faster.
              </p>
            </header>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {posts.map((post) => (
                <Card
                  key={post.slug}
                  className="group relative flex flex-col p-6 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-md"
                >
                  <time className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {post.date}
                  </time>
                  <h2 className="mt-2 text-xl font-bold leading-snug text-foreground">
                    <NextLink
                      href={`/blog/${post.slug}`}
                      className="no-underline outline-none after:absolute after:inset-0 group-hover:text-primary"
                    >
                      {post.title}
                    </NextLink>
                  </h2>
                  <p className="mt-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                    {post.excerpt}
                  </p>
                  <span className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-accent">
                    Read more
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </span>
                </Card>
              ))}
            </div>
          </div>
        </main>

        <Footer />
      </div>
    </>
  );
}

export async function getStaticProps() {
  // Project only the fields the cards and the CollectionPage JSON-LD use.
  // Passing whole posts shipped every article's full HTML body in the page's
  // __NEXT_DATA__ — 608 kB of payload for an index that renders four fields —
  // and Next warned about it at build time.
  const sorted = [...posts]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .map(({ slug, title, date, excerpt }) => ({ slug, title, date, excerpt }));

  return { props: { posts: sorted } };
}
