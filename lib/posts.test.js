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
  it('loads every legacy post from content/posts', () => {
    expect(posts.length).toBe(legacyPosts.length);
    expect([...postSlugs].sort()).toEqual([...legacyBySlug.keys()].sort());
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
    expect(posts[0].slug).toBe(
      [...legacyPosts].sort((a, b) => new Date(b.date) - new Date(a.date))[0].slug
    );
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
