import { contentPages, runBeacon, finder, SITE_OPTIONS, SITE_HELP, siteOptions, squash, textOf } from './site.js';
import { TYPES, RICH, DATE_PROPS, DURATION_PROPS, URL_PROPS, ENUMS, CURRENCIES } from './vocab.js';
import { buildReport, UsageError } from './core.js';

export * from './core.js';
export { SITE_OPTIONS, SITE_HELP, siteOptions, TYPES, RICH };

export const RULES = {
  'jsonld-parse-error': { severity: 'high', title: 'A JSON-LD block is not valid JSON, so search engines ignore all of it' },
  'rich-result-required-missing': { severity: 'high', title: 'A property Google requires for this rich result is missing' },
  'schema-context-missing': { severity: 'medium', title: 'JSON-LD has no schema.org @context' },
  'schema-unknown-type': { severity: 'medium', title: '@type / itemtype is not a schema.org type' },
  'schema-invalid-date': { severity: 'medium', title: 'Date is not ISO 8601 (YYYY-MM-DD or YYYY-MM-DDThh:mm:ss+zz:zz)' },
  'schema-invalid-duration': { severity: 'medium', title: 'Duration is not ISO 8601 (e.g. PT1H30M)' },
  'schema-invalid-url': { severity: 'medium', title: 'URL property is not a valid URL' },
  'schema-invalid-price': { severity: 'medium', title: 'Price is not a plain number (no currency symbols or thousands separators)' },
  'schema-invalid-currency': { severity: 'medium', title: 'priceCurrency is not an ISO 4217 code' },
  'schema-invalid-enum': { severity: 'medium', title: 'Value is not one of the schema.org / Google enumeration values' },
  'schema-rating-out-of-range': { severity: 'medium', title: 'ratingValue is outside worstRating–bestRating' },
  'schema-breadcrumb-position': { severity: 'medium', title: 'BreadcrumbList positions are missing, not numbers or not 1, 2, 3…; or a non-final item has no URL' },
  'rich-result-recommended-missing': { severity: 'low', title: 'A property Google recommends for this rich result is missing' },
  'schema-relative-url': { severity: 'low', title: 'URL property is relative; use absolute URLs in structured data' },
  'schema-author-format': { severity: 'low', title: 'author is a plain string; Google wants a Person or Organization with a name' },
  'schema-empty-value': { severity: 'low', title: 'Property has an empty value' },
  'schema-unresolved-id': { severity: 'low', title: '@id reference does not match any node on the page' },
  'rich-result-deprecated': { severity: 'info', title: 'This rich result type is retired or restricted by Google' },
  'schema-none': { severity: 'info', title: 'Pages without any structured data' },
};

const short = (t) => String(t).replace(/^https?:\/\/schema\.org\//i, '').replace(/^schema:/, '');
const isRefOnly = (v) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 1 && typeof v['@id'] === 'string';
const arr = (v) => (v == null ? [] : Array.isArray(v) ? v : [v]);
function lev(a, b) { a = a.toLowerCase(); b = b.toLowerCase(); const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; }
export function suggestType(t) { const pre = [...TYPES].filter((k) => k.toLowerCase().startsWith(t.toLowerCase()) && t.length >= 4).sort((a, b) => a.length - b.length)[0]; if (pre) return pre; let best = null; let bd = 99; for (const k of TYPES) { const x = lev(t, k); if (x < bd) { bd = x; best = k; } } return bd <= Math.max(2, Math.floor(t.length / 3)) ? best : null; }

export function isIsoDate(s) {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?)?)?$/.exec(String(s).trim());
  if (!m) return false;
  const [, y, mo, d, h, mi, se] = m.map((x) => (x == null ? x : +x));
  if (mo != null && (mo < 1 || mo > 12)) return false;
  if (d != null && (d < 1 || d > new Date(Date.UTC(y, mo, 0)).getUTCDate())) return false;
  if (h != null && (h > 24 || mi > 59 || (se ?? 0) > 60)) return false;
  return true;
}
export const isIsoDuration = (s) => /^P(?!$)(\d+(\.\d+)?Y)?(\d+(\.\d+)?M)?(\d+(\.\d+)?W)?(\d+(\.\d+)?D)?(T(?=\d)(\d+(\.\d+)?H)?(\d+(\.\d+)?M)?(\d+(\.\d+)?S)?)?$/.test(String(s).trim());

/** Microdata -> JSON-LD-like objects. */
export function microdata(doc) {
  const items = [];
  const valueOf = (e) => {
    if (e.attrs.itemscope != null) return build(e);
    if (e.tag === 'meta') return e.attrs.content ?? '';
    if (['a', 'link', 'area'].includes(e.tag)) return e.attrs.href ?? '';
    if (['img', 'audio', 'video', 'source', 'iframe', 'embed', 'track'].includes(e.tag)) return e.attrs.src ?? '';
    if (e.tag === 'object') return e.attrs.data ?? '';
    if (e.tag === 'time') return e.attrs.datetime ?? textOf(e);
    if (e.tag === 'data' || e.tag === 'meter') return e.attrs.value ?? textOf(e);
    return e.attrs.content ?? textOf(e);
  };
  const build = (scope) => {
    const obj = { '@line': scope.line };
    if (scope.attrs.itemtype) obj['@type'] = scope.attrs.itemtype.trim().split(/\s+/).map(short);
    if (scope.attrs.itemid) obj['@id'] = scope.attrs.itemid;
    const visit = (el) => { for (const c of el.children || []) { if (!c.tag) continue; if (c.attrs.itemprop != null) { for (const p of c.attrs.itemprop.trim().split(/\s+/)) { const v = valueOf(c); obj[p] = obj[p] === undefined ? v : [].concat(obj[p], v); } } if (c.attrs.itemscope == null) visit(c); } };
    visit(scope);
    return obj;
  };
  for (const e of doc.all) if (e.attrs.itemscope != null && e.attrs.itemprop == null) items.push(build(e));
  return items;
}

export function analyze(site, opts = {}, config = {}) {
  const { findings, add } = finder(RULES);
  const recommended = opts.recommended ?? config.recommended ?? true;
  const ignoreTypes = new Set(config.ignoreTypes || []);
  let none = 0; let withData = 0; const typeCounts = {};
  for (const pg of contentPages(site)) {
    const d = pg.doc; const at = (line) => ({ file: pg.file, line });
    const roots = [];
    for (const b of d.jsonld) {
      if (b.error) { add('jsonld-parse-error', pg.path, `JSON-LD does not parse: ${b.error}`, 'Fix the JSON (trailing commas, unescaped quotes and comments are common causes); validate with JSON.parse.', at(b.line)); continue; }
      for (const top of arr(b.data)) {
        if (top && typeof top === 'object') {
          const ctx = top['@context'];
          const ok = arr(ctx).some((c) => (typeof c === 'string' && /schema\.org/i.test(c)) || (c && typeof c === 'object' && Object.values(c).some((v) => /schema\.org/i.test(String(v)))));
          if (!ok && (top['@type'] || top['@graph'])) add('schema-context-missing', pg.path, `JSON-LD ${top['@type'] ? `"${arr(top['@type']).join(', ')}" ` : ''}has no schema.org @context`, 'Add "@context": "https://schema.org".', at(b.line));
          roots.push({ value: top, line: b.line, source: 'JSON-LD' });
        }
      }
    }
    for (const m of microdata(d)) roots.push({ value: m, line: m['@line'], source: 'microdata' });
    if (!roots.length) { none++; continue; }
    withData++;
    // collect nodes and ids
    const nodes = []; const ids = new Set();
    const walk = (v, ctx) => {
      if (Array.isArray(v)) { v.forEach((x) => walk(x, ctx)); return; }
      if (!v || typeof v !== 'object') return;
      if (v['@graph']) walk(v['@graph'], ctx);
      if (v['@id'] && Object.keys(v).length > 1) ids.add(String(v['@id']));
      const types = arr(v['@type']).map(short);
      if (types.length) nodes.push({ node: v, types, ...ctx });
      for (const [k, x] of Object.entries(v)) if (k !== '@graph' && k[0] !== '@' && x && typeof x === 'object') walk(x, { ...ctx, depth: ctx.depth + (types.length ? 1 : 0), parentType: types.length ? types[0] : ctx.parentType, prop: k });
    };
    // JSON-LD node merging: top-level objects that share an @id describe one node
    const tops = roots.flatMap((r) => arr(r.value).flatMap((v) => (v && v['@graph'] ? arr(v['@graph']).map((g) => ({ v: g, r })) : [{ v, r }])));
    const typedById = new Map(); for (const { v } of tops) if (v && v['@id'] && v['@type'] && !typedById.has(String(v['@id']))) typedById.set(String(v['@id']), v);
    const merged = new Set();
    for (const { v } of tops) if (v && v['@id'] && !v['@type'] && typedById.has(String(v['@id']))) { const t = typedById.get(String(v['@id'])); for (const [k, x] of Object.entries(v)) if (k[0] !== '@' && t[k] === undefined) t[k] = x; merged.add(v); }
    const strip = (v) => (Array.isArray(v) ? v.filter((x) => !merged.has(x)).map(strip) : v && typeof v === 'object' && v['@graph'] ? { ...v, '@graph': arr(v['@graph']).filter((x) => !merged.has(x)) } : v);
    for (const r of roots) if (!merged.has(r.value)) walk(strip(r.value), { depth: 0, line: r.line, source: r.source, parentType: null, prop: null });
    const byId = new Map(); for (const n of nodes) if (n.node['@id']) byId.set(String(n.node['@id']), n.node);
    const deref = (v) => (isRefOnly(v) && byId.has(v['@id']) ? byId.get(v['@id']) : v);
    const values = (node, path) => {
      let cur = [node];
      for (const key of path.split('.')) cur = cur.flatMap((x) => arr(deref(x)?.[key])).map(deref);
      return cur.filter((x) => x != null && x !== '' && !(Array.isArray(x) && !x.length));
    };
    const hasPath = (node, alt) => alt.split('|').some((p) => values(node, p).length > 0);
    const deprecatedSeen = new Set();
    for (const n of nodes) {
      const { node, types, depth, line } = n; const label = types.join('/');
      for (const t of types) {
        typeCounts[t] = (typeCounts[t] || 0) + 1;
        if (!TYPES.has(t) && !/^[a-z]+:|\//i.test(t) && !ignoreTypes.has(t)) { const s = suggestType(t); add('schema-unknown-type', t, `"${t}" (${n.source}) is not a schema.org type${s ? `; did you mean "${s}"?` : ''}`, s ? `Use "${s}".` : 'Check the type name at https://schema.org (types are case-sensitive).', at(line)); }
      }
      if (types.some((t) => ignoreTypes.has(t))) continue;
      for (const r of RICH) {
        if (!types.some((t) => r.match(t, n))) continue;
        if (r.top && depth > 0) continue;
        if (r.info && !deprecatedSeen.has(r.name)) { deprecatedSeen.add(r.name); add('rich-result-deprecated', r.name, `${r.name}: ${r.info}`, 'Keep the markup if it is accurate, but do not expect a rich result in Google Search.', at(line)); }
        const req = [...r.req, ...(depth === 0 ? r.topReq || [] : [])];
        for (const p of req) if (!hasPath(node, p)) add('rich-result-required-missing', `${r.name}.${p}`, `${label}${node.name ? ` "${String(arr(node.name)[0]).slice(0, 60)}"` : ''} is missing ${p.split('|').map((x) => `"${x}"`).join(' or ')}, required for ${r.name} rich results`, `Add ${p.split('|')[0]}.`, at(line));
        if (recommended) { const miss = r.rec.filter((p) => !hasPath(node, p) && !(p.includes('.') && req.some((q) => q.split('|').includes(p.split('.')[0])) && !hasPath(node, p.split('.')[0]))); if (miss.length) add('rich-result-recommended-missing', `${r.name}`, `${label} is missing recommended ${miss.map((x) => x.split('|')[0]).join(', ')}`, 'Adding them makes the rich result more likely and more complete.', at(line)); }
      }
      // values
      for (const [prop, raw] of Object.entries(node)) {
        if (prop[0] === '@') continue;
        for (const v of arr(raw)) {
          if (v === '' || (typeof v === 'string' && !v.trim())) { add('schema-empty-value', `${label}.${prop}`, `${label}.${prop} is empty`, 'Remove the property or give it a value.', at(line)); continue; }
          if (isRefOnly(v) && !byId.has(v['@id']) && (v['@id'].startsWith('#') || (site.origin && v['@id'].startsWith(site.urlOf(pg) + '#')))) add('schema-unresolved-id', v['@id'], `${label}.${prop} references @id "${v['@id']}", which is not defined on this page`, 'Define the node with that @id in the page, or inline it.', at(line));
          if (typeof v !== 'string' && typeof v !== 'number') continue;
          const s = String(v).trim();
          if (DATE_PROPS.has(prop) && !isIsoDate(s)) add('schema-invalid-date', `${label}.${prop}`, `${label}.${prop} "${s}" is not an ISO 8601 date`, 'Use e.g. "2026-10-14" or "2026-10-14T09:30:00+01:00".', at(line));
          if (DURATION_PROPS.has(prop) && !isIsoDuration(s)) add('schema-invalid-duration', `${label}.${prop}`, `${label}.${prop} "${s}" is not an ISO 8601 duration`, 'Use e.g. "PT45M" or "PT1H30M".', at(line));
          if (URL_PROPS.has(prop) && typeof v === 'string' && !(prop === 'image' && depth > 5)) {
            if (/^https?:\/\//i.test(s)) { try { new URL(s); if (/\s/.test(s)) throw new Error('space'); } catch { add('schema-invalid-url', `${label}.${prop}`, `${label}.${prop} "${s}" is not a valid URL`, 'Encode spaces and special characters.', at(line)); } }
            else if (/^[a-z][a-z0-9+.-]*:/i.test(s)) { /* other schemes are fine */ }
            else add('schema-relative-url', `${label}.${prop}`, `${label}.${prop} "${s}" is relative`, `Use the absolute URL${site.origin ? ` (${site.resolve(pg, s)?.href})` : ''}.`, at(line));
          }
          if (['price', 'lowPrice', 'highPrice', 'minPrice', 'maxPrice'].includes(prop) && !(typeof v === 'number' || /^\d+(\.\d+)?$/.test(s))) add('schema-invalid-price', `${label}.${prop}`, `${label}.${prop} "${s}" is not a plain number`, `Use a number with a dot for decimals, e.g. "${s.replace(/[^\d.,]/g, '').replace(/,(\d{1,2})$/, '.$1').replace(/,/g, '') || '19.99'}", and put the currency in priceCurrency.`, at(line));
          if (prop === 'priceCurrency' && !CURRENCIES.has(s)) add('schema-invalid-currency', `${label}.${prop}`, `priceCurrency "${s}" is not an ISO 4217 code`, `Use a three-letter code such as ${/[£]/.test(s) ? 'GBP' : /[€]/.test(s) ? 'EUR' : 'USD'}.`, at(line));
          if (ENUMS[prop] && typeof v === 'string') { const val = short(s); if (!ENUMS[prop].includes(val)) { const sug = ENUMS[prop].find((e) => e.toLowerCase() === val.replace(/[\s_-]/g, '').toLowerCase()); add('schema-invalid-enum', `${label}.${prop}`, `${label}.${prop} "${s}" is not a valid value`, `Use ${sug ? `"https://schema.org/${sug}"` : `one of ${ENUMS[prop].slice(0, 6).join(', ')}${ENUMS[prop].length > 6 ? ', …' : ''}`}${prop === 'employmentType' || prop === 'jobLocationType' ? '' : ' (as https://schema.org/… URLs)'}.`, at(line)); } }
          if (prop === 'author' && typeof v === 'string' && types.some((t) => /Article|Posting|Review|Recipe|Book|Course|Video|Dataset/.test(t))) add('schema-author-format', `${label}.author`, `${label}.author is the string "${s}"`, `Use { "@type": "Person", "name": "${s}", "url": "…" }.`, at(line));
        }
      }
      // ratings
      if (types.some((t) => t === 'Rating' || t === 'AggregateRating') || n.prop === 'reviewRating') {
        const val = parseFloat(arr(node.ratingValue)[0]); const best = node.bestRating != null ? parseFloat(arr(node.bestRating)[0]) : 5; const worst = node.worstRating != null ? parseFloat(arr(node.worstRating)[0]) : 1;
        if (!Number.isNaN(val) && (val > best || val < worst)) add('schema-rating-out-of-range', `${label}.ratingValue`, `ratingValue ${val} is outside ${worst}–${best}`, node.bestRating == null ? 'Add bestRating (the default scale is 1–5).' : 'Fix ratingValue or the scale.', at(line));
      }
      // breadcrumbs
      if (types.includes('BreadcrumbList')) {
        const items = arr(node.itemListElement).map(deref);
        const pos = items.map((it) => Number(arr(it?.position)[0]));
        if (items.length && pos.some((p, i) => p !== i + 1)) add('schema-breadcrumb-position', 'BreadcrumbList', `BreadcrumbList positions are [${items.map((it) => arr(it?.position)[0] ?? '–').join(', ')}]; expected 1…${items.length}`, 'Number ListItems 1, 2, 3… in order.', at(line));
        items.slice(0, -1).forEach((it, i) => { const item = deref(arr(it?.item)[0]); const url = typeof item === 'string' ? item : item?.['@id'] || item?.url; if (!url) add('schema-breadcrumb-position', 'BreadcrumbList', `Breadcrumb ${i + 1} ("${arr(it?.name)[0] ?? arr(item?.name)[0] ?? '?'}") has no item URL`, 'Every breadcrumb except the last needs "item" with the page URL.', at(line)); });
        items.forEach((it, i) => { if (!values(it, 'name').length && !values(it, 'item.name').length) add('rich-result-required-missing', 'ListItem.name', `Breadcrumb ${i + 1} has no name`, 'Add "name".', at(line)); });
      }
    }
  }
  if (none && (opts.reportNone ?? config.reportNone ?? true)) add('schema-none', 'site', `${none} of ${none + withData} page(s) have no structured data`, 'Add at least WebSite/Organization on the home page and Article/Product/etc. on content pages where it fits.', {});
  return { findings, info: { pagesWithData: withData, pagesWithout: none, types: typeCounts }, summary: `${none + withData} page(s), ${withData} with structured data; types: ${Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => `${k}×${v}`).join(', ') || 'none'}` };
}

export function check(dir, opts = {}, config = {}, configFile) {
  const tool = { name: 'schema-beacon', version: opts.toolVersion || '1.0.0', rules: RULES, emoji: '🧩', defaultFile: 'index.html' };
  return runBeacon(tool, dir, { ...opts, UsageError }, config, configFile, analyze, buildReport);
}
void squash;
