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

  it.each(legacyPosts.map((post) => post.slug))(
    'reproduces %s exactly, including body HTML',
    (slug) => {
      expect(getPostBySlug(slug)).toEqual(legacyBySlug.get(slug));
    }
  );

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
