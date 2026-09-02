#!/usr/bin/env node
/**
 * One-off migration helper: freeze the pre-migration `lib/posts.js` array to
 * JSON so the new content/posts/*.md loader can be proved lossless.
 *
 * Run BEFORE deleting the inlined post objects:
 *   node scripts/content/dump-legacy-posts.mjs            # writes the fixture
 *   node scripts/content/dump-legacy-posts.mjs --emit-md  # also writes the .md files
 *
 * The fixture it produces (tests/fixtures/legacy-posts.json) is committed and
 * is the assertion target of lib/posts.test.js, so any future change that
 * silently mangles an existing post's HTML fails CI. The script keeps working
 * against a legacy file passed as --from=<path> (e.g. a `git show` export),
 * which is how you would regenerate the fixture from history.
 *
 * `lib/posts.js` was ESM-in-a-.js-file in a CommonJS package, so it cannot be
 * imported directly by a .mjs script; we copy it to a temp .mjs first.
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { stringifyFrontmatter } from '../../lib/frontmatter.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const fromArg = args.find((a) => a.startsWith('--from='));
const legacyPath = fromArg ? fromArg.slice('--from='.length) : join(root, 'lib', 'posts.js');
const emitMd = args.includes('--emit-md');

if (!existsSync(legacyPath)) {
  throw new Error(`Legacy posts file not found: ${legacyPath}`);
}

const source = readFileSync(legacyPath, 'utf8');
if (!source.includes('export const posts = [')) {
  throw new Error(
    `${legacyPath} no longer contains the inlined post array. Pass --from=<path> ` +
      'with a copy exported from git history (git show <rev>:lib/posts.js > /tmp/posts.js).'
  );
}

// Import the legacy ESM module through a temp .mjs copy.
const shim = join(tmpdir(), `legacy-posts-${process.pid}.mjs`);
copyFileSync(legacyPath, shim);
let posts;
try {
  ({ posts } = await import(pathToFileURL(shim).href));
} finally {
  rmSync(shim, { force: true });
}

const fixtureDir = join(root, 'tests', 'fixtures');
mkdirSync(fixtureDir, { recursive: true });
const fixturePath = join(fixtureDir, 'legacy-posts.json');
writeFileSync(fixturePath, `${JSON.stringify(posts, null, 2)}\n`);
console.log(`[posts] wrote ${posts.length} legacy posts to ${fixturePath}`);

if (!emitMd) process.exit(0);

// ---------------------------------------------------------------------------
// Emit content/posts/<slug>.md. The body is written VERBATIM: the loader does
// not trim it, so the round trip is byte-exact.
// ---------------------------------------------------------------------------
const outDir = join(root, 'content', 'posts');
mkdirSync(outDir, { recursive: true });

const ORDER = ['title', 'date', 'updated', 'excerpt', 'answer', 'tags'];

posts.forEach((post) => {
  const { slug, content, ...rest } = post;
  if (!slug) throw new Error('Legacy post is missing a slug.');
  const file = stringifyFrontmatter(rest, content, { order: ORDER });
  writeFileSync(join(outDir, `${slug}.md`), file);
});
console.log(`[posts] wrote ${posts.length} markdown files to ${outDir}`);
