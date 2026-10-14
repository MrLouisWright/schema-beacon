import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { check, isIsoDate, isIsoDuration, suggestType, microdata, RULES } from '../src/index.js';
import { parseHtml } from '../src/site.js';

const fx = (n) => new URL(`./fixtures/${n}`, import.meta.url).pathname;
const bin = new URL('../bin/schema-beacon.js', import.meta.url).pathname;
const run = (dir, opts = {}, config = {}) => check(dir, opts, config).findings;
const rules = (dir, o, c) => run(dir, o, c).map((f) => f.rule);
function site(files) { const d = mkdtempSync(join(tmpdir(), 'sb-')); for (const [p, c] of Object.entries(files)) { mkdirSync(join(d, p, '..'), { recursive: true }); writeFileSync(join(d, p), c); } return d; }
const ld = (o) => `<html><head><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', ...o })}</script></head><body></body></html>`;

test('good fixture is clean (JSON-LD graph, arrays and microdata)', () => { assert.deepEqual(rules(fx('good')), []); });
test('bad fixture reports every planted problem', () => {
  const r = new Set(rules(fx('bad')));
  for (const x of ['jsonld-parse-error', 'rich-result-required-missing', 'schema-context-missing', 'schema-unknown-type', 'schema-invalid-date', 'schema-invalid-duration', 'schema-invalid-price', 'schema-invalid-currency', 'schema-invalid-enum', 'schema-rating-out-of-range', 'schema-breadcrumb-position', 'rich-result-recommended-missing', 'schema-relative-url', 'schema-author-format', 'schema-empty-value', 'schema-unresolved-id', 'rich-result-deprecated', 'schema-none']) assert.ok(r.has(x), x);
});
test('did-you-mean for unknown types', () => { assert.equal(suggestType('Prodcut'), 'Product'); assert.equal(suggestType('BlogPost'), 'BlogPosting'); assert.equal(suggestType('Zzzzzzzzzzzz'), null); });
test('ISO 8601 dates and durations', () => {
  for (const ok of ['2026', '2026-10', '2026-10-14', '2026-10-14T09:30', '2026-10-14T09:30:00Z', '2026-10-14T09:30:00.5+01:00']) assert.ok(isIsoDate(ok), ok);
  for (const bad of ['14/10/2026', '2026-13-01', '2026-02-30', 'Oct 14 2026', '2026-10-14T25:00']) assert.ok(!isIsoDate(bad), bad);
  assert.ok(isIsoDuration('PT1H30M')); assert.ok(isIsoDuration('P1DT2H')); assert.ok(!isIsoDuration('PT')); assert.ok(!isIsoDuration('90 minutes'));
});
test('@id references are resolved across a @graph', () => {
  const d = site({ 'index.html': ld({ '@graph': [{ '@type': 'Product', name: 'X', image: 'https://e.com/x.jpg', description: 'd', sku: '1', brand: { '@id': '#b' }, offers: { '@id': '#o' } }, { '@type': 'Brand', '@id': '#b', name: 'B' }, { '@type': 'Offer', '@id': '#o', price: 5, priceCurrency: 'EUR', availability: 'https://schema.org/InStock' }] }) });
  assert.deepEqual(rules(d), []);
});
test('nested nodes are not held to top-level requirements', () => {
  const d = site({ 'index.html': ld({ '@type': 'BlogPosting', headline: 'h', image: 'https://e.com/i.jpg', datePublished: '2026-01-01', dateModified: '2026-01-02', author: { '@type': 'Person', name: 'A' }, publisher: { '@type': 'Organization', name: 'P' } }) });
  assert.deepEqual(rules(d), []);
});
test('--no-recommended and ignoreTypes', () => {
  assert.ok(!rules(fx('bad'), { recommended: false }).includes('rich-result-recommended-missing'));
  assert.ok(!run(fx('bad'), {}, { ignoreTypes: ['Prodcut'] }).some((f) => f.subject === 'Prodcut'));
});
test('microdata becomes typed objects', () => {
  const items = microdata(parseHtml('<div itemscope itemtype="https://schema.org/Person"><span itemprop="name">Ada</span><a itemprop="url" href="https://a.dev">site</a><div itemprop="address" itemscope itemtype="https://schema.org/PostalAddress"><span itemprop="addressLocality">Leeds</span></div></div>'));
  assert.equal(items.length, 1); assert.deepEqual(items[0]['@type'], ['Person']); assert.equal(items[0].name, 'Ada'); assert.equal(items[0].url, 'https://a.dev'); assert.equal(items[0].address.addressLocality, 'Leeds');
});
test('enum suggestions use the canonical URL form', () => {
  const f = run(fx('bad')).find((x) => x.rule === 'schema-invalid-enum' && x.message.includes('in stock'));
  assert.match(f.fix, /https:\/\/schema\.org\/InStock/);
});
test('CLI: exit codes, SARIF, list-rules, allowlist', () => {
  assert.equal(spawnSync(process.execPath, [bin, fx('bad'), '--fail-on', 'high']).status, 1);
  assert.equal(spawnSync(process.execPath, [bin, fx('good'), '--fail-on', 'info']).status, 0);
  assert.equal(spawnSync(process.execPath, [bin, '/nonexistent-dir-xyz']).status, 2);
  const s = JSON.parse(execFileSync(process.execPath, [bin, fx('bad'), '-f', 'sarif', '--fail-on', 'none'], { encoding: 'utf8' }));
  assert.equal(s.version, '2.1.0'); assert.ok(s.runs[0].results.length > 20);
  const l = execFileSync(process.execPath, [bin, '--list-rules'], { encoding: 'utf8' }); for (const k of Object.keys(RULES)) assert.ok(l.includes(k));
  const c = check(fx('bad'), {}, { allowlist: [{ rule: 'jsonld-parse-error', reason: 'known', expires: '2099-01-01' }] });
  assert.ok(!c.findings.some((f) => f.rule === 'jsonld-parse-error')); assert.equal(c.suppressed.length, 1);
});
test('top-level objects sharing an @id are merged (node merging)', () => {
  const page = `<html><head><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@id': 'https://e.com/r#recipe', '@type': 'Recipe', name: 'Cake', image: 'https://e.com/c.jpg' })}</script><script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@id': 'https://e.com/r#recipe', aggregateRating: { '@type': 'AggregateRating', ratingValue: 5, reviewCount: 3 } })}</script></head></html>`;
  const f = run(site({ 'index.html': page }), { recommended: false });
  assert.deepEqual(f.map((x) => x.rule), []);
});
