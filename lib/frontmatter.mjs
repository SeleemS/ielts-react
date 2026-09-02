// lib/frontmatter.mjs
// A deliberately tiny YAML-frontmatter reader/writer for content/posts/*.md.
//
// WHY NOT gray-matter / js-yaml: neither is a direct dependency of this app,
// and blog frontmatter needs exactly four value shapes — string, number,
// boolean and array-of-strings. A ~60-line parser we own is cheaper to reason
// about at build time than a YAML engine, and it keeps `npm install` unchanged.
//
// FILE SHAPE (byte-exact round-trip is a hard requirement — lib/posts.test.js
// asserts the loader reproduces the pre-migration post objects exactly):
//
//   ---
//   title: "IELTS Writing Task 1: How to Describe a Bar Chart"
//   date: August 31, 2026
//   ---
//   <p>…the body, verbatim, including its leading newline…</p>
//
// Everything after the newline that closes the second `---` line is the body.
// It is NOT trimmed, so a post whose HTML begins with a blank line keeps it.
//
// QUOTING RULE: a scalar is written bare only when it is unambiguous YAML —
// alphanumerics, spaces, commas, dots and hyphens (which covers dates like
// "August 31, 2026"). Anything else — colons, quotes, em-dashes, entities —
// is written with JSON.stringify, whose output is a valid YAML double-quoted
// scalar, and read back with JSON.parse. This is why titles containing ": "
// survive a round trip when a naive `split(':')` parser would corrupt them.

const DELIMITER = '---';

// Bare scalars: must start alphanumeric, end alphanumeric or '.', and contain
// only characters that carry no YAML meaning in a flow context.
const BARE_SCALAR = /^[A-Za-z0-9][A-Za-z0-9 ,.-]*[A-Za-z0-9.]$/;
const KEY_LINE = /^([A-Za-z_][A-Za-z0-9_]*):[ \t]*(.*)$/;

function parseScalar(raw) {
  const value = raw.replace(/[ \t]+$/, '');
  if (value === '') return '';
  // JSON covers double-quoted strings, arrays and objects in one branch.
  if (value[0] === '"' || value[0] === '[' || value[0] === '{') {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`Frontmatter: value is not valid JSON/YAML: ${value.slice(0, 80)}`);
    }
  }
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (value === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value);
  return value;
}

function serializeScalar(value) {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  if (Array.isArray(value) || (value && typeof value === 'object')) return JSON.stringify(value);
  const str = String(value);
  return BARE_SCALAR.test(str) ? str : JSON.stringify(str);
}

/**
 * Split a `---`-delimited markdown file into its frontmatter object and its
 * verbatim body. Throws when the file has no frontmatter block, so a malformed
 * post fails the build loudly rather than rendering an empty page.
 */
export function parseFrontmatter(raw, { source = 'frontmatter' } = {}) {
  const text = String(raw).replace(/^﻿/, '');
  if (!text.startsWith(`${DELIMITER}\n`)) {
    throw new Error(`${source}: file does not start with a "---" frontmatter block.`);
  }
  const end = text.indexOf(`\n${DELIMITER}\n`, DELIMITER.length);
  if (end === -1) {
    throw new Error(`${source}: frontmatter block is never closed with "---".`);
  }

  const block = text.slice(DELIMITER.length + 1, end + 1);
  const content = text.slice(end + `\n${DELIMITER}\n`.length);

  const data = {};
  block.split('\n').forEach((line) => {
    if (!line.trim() || line.trimStart().startsWith('#')) return;
    const match = KEY_LINE.exec(line);
    if (!match) {
      throw new Error(`${source}: unparseable frontmatter line: ${line.slice(0, 80)}`);
    }
    data[match[1]] = parseScalar(match[2]);
  });

  return { data, content };
}

/**
 * Inverse of parseFrontmatter. `order` fixes the key order so regenerating a
 * post file produces a minimal diff; any keys not named in `order` follow in
 * insertion order. Keys whose value is undefined or null are omitted.
 */
export function stringifyFrontmatter(data, content, { order = [] } = {}) {
  const keys = [
    ...order.filter((key) => data[key] !== undefined && data[key] !== null),
    ...Object.keys(data).filter(
      (key) => !order.includes(key) && data[key] !== undefined && data[key] !== null
    ),
  ];
  const block = keys.map((key) => `${key}: ${serializeScalar(data[key])}`).join('\n');
  return `${DELIMITER}\n${block}\n${DELIMITER}\n${content}`;
}
