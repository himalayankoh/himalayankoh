import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hasProhibitedClaim } from '../products/claims';

/**
 * Guards the source files the blog guides are written from.
 *
 * `docs/content/*.html` is what actually gets pasted into a WordPress post, so a claim
 * that reaches one of those files reaches the live site and an AdSense review. The
 * catalogue side already has `claims.ts` and `productHonesty.test.ts`; editorial copy
 * had nothing, and "84 trace minerals" shipped that way once before. These assertions
 * are the rule, checked at the file the owner publishes from rather than at the page.
 *
 * Only files carrying a `GUIDE-DRAFT:` header are held to the drafting contract
 * (length, structure, no `<h1>`, metadata header). Already-published source files are
 * still scanned for prohibited claims, because those are the ones the reader sees today.
 */
const CONTENT_DIR = new URL('../../../docs/content/', import.meta.url);

function readGuides(): { name: string; source: string }[] {
  return readdirSync(fileURLToPath(CONTENT_DIR))
    .filter((name) => name.endsWith('.html'))
    .sort()
    .map((name) => ({
      name,
      source: readFileSync(fileURLToPath(new URL(name, CONTENT_DIR)), 'utf8'),
    }));
}

/** The body text a reader sees: header comment and tags removed, entities decoded. */
function bodyText(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&ndash;|&mdash;/g, '-')
    .replace(/&frac34;/g, '3/4')
    .replace(/&#8531;/g, '1/3')
    .replace(/&deg;/g, 'deg')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Every sentence that mentions a mineral count has to be about rejecting the count.
 *
 * The published analyses measured 25 elements across 31 retail pink salts and 12 in one
 * Himalayan sample; neither supports a fixed total, and the figure has been used on this
 * site as a selling point. A guide may explain why the claim fails. It may not repeat it
 * as a fact, which is what this checks, word by word.
 */
function assertingMineralCount(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => /\b84\b|\b84\s*\+/.test(sentence))
    .filter(
      (sentence) =>
        !/\bnot\b|\bno\b|\bnever\b|isn't|does not|doesn't|unsubstantiated|unsupported|cannot|can't/i.test(
          sentence
        )
    );
}

const GUIDES = readGuides();
const DRAFTS = GUIDES.filter((guide) => guide.source.includes('GUIDE-DRAFT:'));

describe('docs/content guides — prohibited claims never reach the published file', () => {
  it('finds the guide sources to check', () => {
    expect(GUIDES.length).toBeGreaterThanOrEqual(7);
    expect(DRAFTS.length).toBe(6);
  });

  it.each(GUIDES.map((guide) => guide.name))('has no prohibited claim: %s', (name) => {
    const guide = GUIDES.find((candidate) => candidate.name === name);
    expect(guide).toBeDefined();
    const text = bodyText(guide!.source);
    expect(text.length).toBeGreaterThan(200);

    // Paragraph by paragraph, so a failure names the copy rather than the whole file.
    for (const paragraph of guide!.source.split(/<\/p>|<li>|<h2>|<h3>/)) {
      const copy = bodyText(paragraph);
      if (!copy) continue;
      expect(hasProhibitedClaim(copy), `${name}: ${copy.slice(0, 120)}`).toBe(false);
    }
  });

  it.each(GUIDES.map((guide) => guide.name))(
    'does not restate an unsupported mineral count: %s',
    (name) => {
      const guide = GUIDES.find((candidate) => candidate.name === name);
      expect(assertingMineralCount(bodyText(guide!.source))).toEqual([]);
    }
  );
});

describe('docs/content guide drafts — the drafting contract holds', () => {
  it.each(DRAFTS.map((draft) => draft.name))('carries the metadata header: %s', (name) => {
    const draft = DRAFTS.find((candidate) => candidate.name === name);
    const source = draft!.source;
    expect(source).toMatch(/GUIDE-DRAFT: [a-z0-9-]+/);
    expect(source).toMatch(/SEO title: \S/);
    expect(source).toMatch(/Meta description: \S/);
    expect(source).toMatch(/Internal links used: \//);
    expect(source).toMatch(/Status: DRAFT/);
  });

  it.each(DRAFTS.map((draft) => draft.name))('states its length and structure: %s', (name) => {
    const draft = DRAFTS.find((candidate) => candidate.name === name);
    const source = draft!.source;
    const words = bodyText(source).split(' ').filter(Boolean).length;

    expect(words, `${name} has ${words} words`).toBeGreaterThanOrEqual(900);
    expect(words, `${name} has ${words} words`).toBeLessThanOrEqual(1300);

    // The WordPress post title supplies the h1; the body must not compete with it, and a
    // draft must not ship styles, scripts or images that the blog editor cannot carry.
    expect(source).not.toMatch(/<h1[\s>]/i);
    expect(source).not.toMatch(/<script|<style|<img|style=/i);

    // A bound rather than a target: enough headings that the guide is navigable, few
    // enough that no section is a single sentence. The upper limit is seven because a
    // guide with genuinely separate topics (intake, form, water, placement) earns one
    // heading each, and merging those to satisfy a style line would hurt the reader.
    const sections = source.match(/<h2>/g) ?? [];
    expect(sections.length).toBeGreaterThanOrEqual(3);
    expect(sections.length).toBeLessThanOrEqual(7);
  });

  it.each(DRAFTS.map((draft) => draft.name))(
    'links a source and an internal page: %s',
    (name) => {
      const draft = DRAFTS.find((candidate) => candidate.name === name);
      const source = draft!.source;

      const external = source.match(/href="https?:\/\/[^"]+"/g) ?? [];
      const internal = source.match(/href="\/[^"]*"/g) ?? [];
      expect(external.length, `${name} cites ${external.length} sources`).toBeGreaterThanOrEqual(3);
      expect(internal.length, `${name} links ${internal.length} internal pages`).toBeGreaterThanOrEqual(1);

      // An internal link is not allowed to be an absolute URL to the live domain: the
      // drafts get pasted into the CMS, where the path is what has to be right.
      for (const href of internal) {
        expect(href).not.toContain('himalayankoh.com');
      }
    }
  );

  it('keeps the promised SEO title and meta description inside the limits', () => {
    for (const draft of DRAFTS) {
      const title = /SEO title: (.+)/.exec(draft.source)?.[1].trim() ?? '';
      const description = /Meta description: (.+)/.exec(draft.source)?.[1].trim() ?? '';

      expect(title.length, `${draft.name} title`).toBeGreaterThan(30);
      expect(title.length, `${draft.name} title`).toBeLessThanOrEqual(60);
      expect(description.length, `${draft.name} description`).toBeGreaterThanOrEqual(110);
      expect(description.length, `${draft.name} description`).toBeLessThanOrEqual(160);

      // A claim must not ride in on the headline, which is the part that gets indexed
      // as a link and read in a search result with no context around it.
      expect(title).not.toMatch(/\b(?:cures?|heals?|treats?|prevents?|benefits?|84)\b/i);
    }
  });
});
