import { describe, expect, it } from 'vitest';
import { posts, getPostBySlug, postSlugs } from './posts';
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter.mjs';
import legacyPosts from '../tests/fixtures/legacy-posts.json';

// tests/fixtures/legacy-posts.json is a frozen dump of the post objects as they
// existed when they were inlined in lib/posts.js (produced by
// scripts/content/dump-legacy-posts.mjs). Asserting the content/posts/*.md
// loader reproduces it byte-for-byte is what makes the migration provably
// lossless, and it keeps catching accidental content mangling afterwards.
const legacyBySlug = new Map(legacyPosts.map((post) => [post.slug, post]));

describe('blog post loader', () => {
  it('still loads every post that existed before the migration', () => {
    // Posts written after the fixture was frozen are expected and fine; a
    // legacy slug going MISSING is the regression this guards against.
    expect(posts.length).toBeGreaterThanOrEqual(legacyPosts.length);
    const slugs = new Set(postSlugs);
    legacyBySlug.forEach((_post, slug) => expect(slugs.has(slug), `${slug} disappeared`).toBe(true));
    expect(new Set(postSlugs).size, 'duplicate slug').toBe(postSlugs.length);
  });

  // `answer` is the ONE field added since the fixture was frozen (the Quick
  // answer capsules). Everything else — above all the body HTML — must still
  // match the pre-migration objects byte for byte, so this strips only the
  // capsule and compares the rest exactly. Adding another key to this list
  // should require a deliberate decision, not a passing test.
  const ADDED_SINCE_FIXTURE = ['answer'];

  function withoutAddedFields(post) {
    const copy = { ...post };
    ADDED_SINCE_FIXTURE.forEach((key) => delete copy[key]);
    return copy;
  }

  it.each(legacyPosts.map((post) => post.slug))(
    'reproduces %s exactly, including body HTML',
    (slug) => {
      expect(withoutAddedFields(getPostBySlug(slug))).toEqual(legacyBySlug.get(slug));
    }
  );

  it('carries a Quick answer capsule on every post', () => {
    posts.forEach((post) => {
      expect(typeof post.answer, `${post.slug} has no answer capsule`).toBe('string');
      // Long enough to be a real answer, short enough to stay a capsule.
      expect(post.answer.length, `${post.slug} capsule is too short`).toBeGreaterThan(120);
      expect(post.answer.length, `${post.slug} capsule is too long`).toBeLessThan(700);
      // Plain text only: it renders as a <p>, never as markup.
      expect(post.answer, `${post.slug} capsule contains markup`).not.toMatch(/[<>]/);
    });
  });

  it('never claims the Writing Checker is unconditionally free in a capsule', () => {
    // Product rule: one free sample score after signup, then Premium. A capsule
    // is quotable out of context, so the phrasing matters more here than in body
    // copy that carries its own qualification.
    posts.forEach((post) => {
      expect(post.answer, `${post.slug}`).not.toMatch(/free (?:ielts )?writing checker/i);
      expect(post.answer, `${post.slug}`).not.toMatch(/unlimited free/i);
    });
  });

  it('never offers past papers or predicted questions in a capsule', () => {
    posts.forEach((post) => {
      expect(post.answer, `${post.slug}`).not.toMatch(/past papers?/i);
      expect(post.answer, `${post.slug}`).not.toMatch(/leaked/i);
      expect(post.answer, `${post.slug}`).not.toMatch(/real (?:exam|test) questions/i);
    });
  });

  it('orders posts newest first so the lifecycle cron mails the latest article', () => {
    const dates = posts.map((post) => new Date(post.date).getTime());
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
    // posts[0] is whatever is genuinely newest, legacy or not.
    const newest = [...posts].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
    expect(posts[0].slug).toBe(newest.slug);
  });

  it('requires a title, date and excerpt on every post', () => {
    posts.forEach((post) => {
      expect(post.title.trim()).not.toBe('');
      expect(post.excerpt.trim()).not.toBe('');
      expect(Number.isNaN(new Date(post.date).getTime())).toBe(false);
      expect(post.content.trim()).not.toBe('');
    });
  });

  it('only carries an `updated` date when it is later than the publish date', () => {
    posts
      .filter((post) => post.updated)
      .forEach((post) => {
        expect(new Date(post.updated).getTime()).toBeGreaterThanOrEqual(
          new Date(post.date).getTime()
        );
      });
  });

  it('returns null for an unknown slug', () => {
    expect(getPostBySlug('not-a-real-post')).toBeNull();
  });
});

describe('optional per-post FAQ', () => {
  const withFaq = posts.filter((post) => post.faq);

  it('parses the writing-checker listicle FAQ into q/a pairs', () => {
    const post = getPostBySlug('best-free-ielts-writing-checkers-2026');
    expect(post).not.toBeNull();
    expect(post.faq.length).toBeGreaterThanOrEqual(3);
  });

  it('gives every FAQ entry a real question and a real answer', () => {
    withFaq.forEach((post) => {
      post.faq.forEach((item) => {
        expect(item.q.trim().length, `${post.slug}`).toBeGreaterThan(10);
        expect(item.a.trim().length, `${post.slug}`).toBeGreaterThan(40);
        // Rendered as text in a <p> and mirrored into FAQPage JSON-LD.
        expect(item.q, `${post.slug}`).not.toMatch(/[<>]/);
        expect(item.a, `${post.slug}`).not.toMatch(/[<>]/);
      });
    });
  });

  it('dates every third-party claim in the listicle so it can be re-verified', () => {
    const post = getPostBySlug('best-free-ielts-writing-checkers-2026');
    // Third-party free tiers and prices change; the page must say when it was
    // checked rather than presenting them as standing facts.
    expect(post.content).toContain('2 September 2026');
    expect(post.content).toMatch(/Disclosure: this one is our own tool/);
    // Product rule: the Writing Checker's free tier is one sample score.
    expect(post.content).toMatch(/one AI (?:Writing )?sample score after signup/);
    expect(post.content).toMatch(/Premium/);
    expect(post.content).not.toMatch(/past papers\b(?!, and nobody)/);
  });
});

describe('frontmatter parser', () => {
  it('round-trips values that would break a naive split(":") parser', () => {
    const data = {
      title: 'IELTS Writing Task 1: Bar Charts — "grouping" & comparison',
      date: 'August 31, 2026',
      tags: ['writing', 'task-1'],
    };
    const body = '\n  <p>Body with a --- line inside it.</p>\n';
    const parsed = parseFrontmatter(stringifyFrontmatter(data, body, { order: ['title', 'date'] }));

    expect(parsed.data).toEqual(data);
    expect(parsed.content).toBe(body);
  });

  it('preserves the body verbatim, including leading and trailing whitespace', () => {
    const body = '\n\n  <p>x</p>  \n  ';
    expect(parseFrontmatter(stringifyFrontmatter({ title: 'x' }, body)).content).toBe(body);
  });

  it('throws on a file with no frontmatter block', () => {
    expect(() => parseFrontmatter('<p>no header</p>')).toThrow(/frontmatter block/);
  });

  it('throws on an unclosed frontmatter block', () => {
    expect(() => parseFrontmatter('---\ntitle: x\n')).toThrow(/never closed/);
  });
});
