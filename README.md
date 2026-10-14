# schema-beacon

> Validate JSON-LD and microdata against schema.org and Google rich-result requirements, across your whole built site.

Structured data fails quietly. A trailing comma makes the whole JSON-LD block invisible. `"price": "$1,299.00"`, `"availability": "in stock"` and `"datePublished": "14/10/2026"` all look fine to a person, but Google throws them away. A template change drops `image` from every recipe, and the rich results disappear a few weeks later. `schema-beacon` reads every page of your build output and checks each JSON-LD block and microdata item. It reports the file, line, severity and a **concrete fix**, in CI, before you deploy.

CLI, library and GitHub Action. Node.js 18+, **zero runtime dependencies**. Works on any static build output (Astro, Next.js `output: 'export'`, Eleventy, Hugo, Jekyll, Docusaurus, VitePress, plain HTML) and runs offline: point it at the folder your build writes. By Louis Wright.

## Features

- **Both formats:** JSON-LD (arrays, `@graph`, nested nodes, `@id` references and node merging across blocks) and microdata (`itemscope`, `itemtype`, `itemprop` with the right value per element: `content`, `href`, `src`, `datetime` or text).
- **Google rich-result requirements:** Article, BlogPosting and NewsArticle; Product, Offer, AggregateOffer, AggregateRating and Review; BreadcrumbList; FAQPage, QAPage and HowTo; Recipe; Event; JobPosting; LocalBusiness and its subtypes; Organization; VideoObject; SoftwareApplication; Course; Dataset; ProfilePage; DiscussionForumPosting; ImageObject; Movie; Book; ClaimReview. Missing required properties are high and missing recommended ones are low. Top-level requirements aren't applied to nested nodes (an Organization used as `publisher`, for example).
- **Value checks:** ISO 8601 dates and durations, absolute and valid URLs, plain-number prices, ISO 4217 currencies, schema.org enumerations (`availability`, `itemCondition`, `eventStatus`, `eventAttendanceMode`, `employmentType`) with the correct URL form suggested, rating ranges, breadcrumb positions and URLs, `author` as a Person/Organization rather than a string, empty values, and unresolved `#id` references.
- **Vocabulary:** unknown types with did-you-mean suggestions (`Prodcut` → `Product`), missing `@context`, and retired or restricted rich results (HowTo, FAQ) reported as info.
- **Output:** text, JSON, SARIF 2.1.0 and Markdown; `--fail-on`; exit codes 0/1/2; allowlist entries with expiry dates.

`schema-beacon` checks markup only. Whether a page qualifies for a rich result also depends on Google's content policies and on the site, which no offline tool can know. Use it to catch regressions early, and Google's Rich Results Test to confirm individual pages.

## Rules

| Rule | Default severity | What it catches |
|---|---|---|
| `jsonld-parse-error` | high | A JSON-LD block is not valid JSON, so search engines ignore all of it |
| `rich-result-required-missing` | high | A property Google requires for this rich result is missing |
| `schema-context-missing` | medium | JSON-LD has no schema.org @context |
| `schema-unknown-type` | medium | @type / itemtype is not a schema.org type |
| `schema-invalid-date` | medium | Date is not ISO 8601 (YYYY-MM-DD or YYYY-MM-DDThh:mm:ss+zz:zz) |
| `schema-invalid-duration` | medium | Duration is not ISO 8601 (e.g. PT1H30M) |
| `schema-invalid-url` | medium | URL property is not a valid URL |
| `schema-invalid-price` | medium | Price is not a plain number (no currency symbols or thousands separators) |
| `schema-invalid-currency` | medium | priceCurrency is not an ISO 4217 code |
| `schema-invalid-enum` | medium | Value is not one of the schema.org / Google enumeration values |
| `schema-rating-out-of-range` | medium | ratingValue is outside worstRating–bestRating |
| `schema-breadcrumb-position` | medium | BreadcrumbList positions are missing, not numbers or not 1, 2, 3…; or a non-final item has no URL |
| `rich-result-recommended-missing` | low | A property Google recommends for this rich result is missing |
| `schema-relative-url` | low | URL property is relative; use absolute URLs in structured data |
| `schema-author-format` | low | author is a plain string; Google wants a Person or Organization with a name |
| `schema-empty-value` | low | Property has an empty value |
| `schema-unresolved-id` | low | @id reference does not match any node on the page |
| `rich-result-deprecated` | info | This rich result type is retired or restricted by Google |
| `schema-none` | info | Pages without any structured data |
| `allowlist-expired` | medium | Allowlist entry has expired |
| `allowlist-unused` | info | Allowlist entry matched nothing |

## Install and run

```bash
npx schema-beacon dist
npx schema-beacon dist --fail-on medium --no-recommended
npx schema-beacon public --include "products/**" --sarif schema.sarif
```

Pages are mapped to URLs the way static hosts serve them: `index.html` → `/`, `blog/index.html` → `/blog/`, `about.html` → `/about.html` (or `/about` with `--clean-urls`). Pass `--base-url` with your public URL, or let it be inferred from canonical / `og:url` tags. Pages with a meta refresh (redirect stubs) and `404.html` are skipped.

### Sample output

```text
schema-beacon — dist
4 page(s), 3 with structured data; types: ListItem×2, Product×2, Article×1, BreadcrumbList×1, Recipe×1, FAQPage×1, Question×1, Answer×1

HIGH     blog/post.html:2 Recipe "Cake" is missing "image", required for Recipe rich results [rich-result-required-missing]
         ↳ fix: Add image.
HIGH     blog/post.html:2 Answer is missing "text", required for Answer rich results [rich-result-required-missing]
         ↳ fix: Add text.
HIGH     blog/post.html:2 Event "Launch" is missing "location", required for Event rich results [rich-result-required-missing]
         ↳ fix: Add location.
HIGH     index.html:2 JSON-LD does not parse: Expected double-quoted property name in JSON at position 73 [jsonld-parse-error]
         ↳ fix: Fix the JSON (trailing commas, unescaped quotes and comments are common causes); validate with JSON.parse.
HIGH     product.html:2 AggregateRating is missing "ratingCount" or "reviewCount", required for AggregateRating rich results [rich-result-required-missing]
         ↳ fix: Add ratingCount.
HIGH     product.html:12 Product is missing "name", required for Product rich results [rich-result-required-missing]
         ↳ fix: Add name.
HIGH     product.html:12 Product is missing "offers" or "review" or "aggregateRating", required for Product rich results [rich-result-required-missing]
         ↳ fix: Add offers.
MEDIUM   blog/post.html:2 Article.datePublished "14/10/2026" is not an ISO 8601 date [schema-invalid-date]
…

7 high, 12 medium, 9 low, 2 info
✔ Passing (fail-on: none).
```

## Options

```text
schema-beacon 1.0.0 — JSON-LD and microdata vs schema.org and Google rich-result requirements

Usage: schema-beacon [site-dir] [options]

Site
      --base-url <url>        Public URL of the site, e.g. https://example.com (default: inferred from canonical/og:url)
      --include <globs>       Only check these pages (file or URL path globs, comma-separated)
      --exclude <globs>       Skip these pages
      --clean-urls            Pages are served without .html (about.html -> /about)
Checks
      --no-recommended        Only report required properties, not recommended ones

Common
  -c, --config <file>     JSON config (default: .schema-beacon.json or "schemaBeacon" in package.json)
  -f, --format <fmt>      text (default) | json | sarif | markdown
      --json <file>       Also write a JSON report
      --sarif <file>      Also write SARIF 2.1.0
      --markdown <file>   Also write Markdown (e.g. for a job summary)
      --fail-on <sev>     critical | high | medium | low | info | none (default: high)
      --list-rules        Print rules and default severities
      --no-fixes          Hide fix suggestions in text output
      --no-color          Disable colours
  -v, --version / -h, --help

Exit codes: 0 = passed, 1 = findings at or above --fail-on, 2 = usage, config or read error.
```

## Configuration and allowlist

Options can live in `.schema-beacon.json` (or a `"schemaBeacon"` key in `package.json`, or `--config <file>`):

```json
{
  "failOn": "medium",
  "severity": { "schema-unknown-type": "low" },
  "allowlist": [
    { "rule": "rich-result-recommended-missing", "subject": "Recipe*", "reason": "Recipe images added in the next content sprint", "expires": "2027-03-31" }
  ],
  "recommended": false
}
```

- **`severity`** changes a rule's severity, or turns it `"off"`.
- **`allowlist`** entries suppress matching findings. Each needs a `reason` and matches on any combination of `rule`, `file`, `subject` (globs with `*`) and `match` (a substring of the message). Add `expires` (`YYYY-MM-DD`) so the exception is time-boxed: once it lapses the finding comes back along with an `allowlist-expired` finding (medium). Entries that no longer match anything are reported as `allowlist-unused` (info).

Config can also set `baseUrl`, `include`, `exclude` and `cleanUrls`. The config file is looked up in the site directory first, then in the current directory, so `.schema-beacon.json` can live at your repository root. Other keys: `"recommended": false`, `ignoreTypes` (custom or non-schema.org types to skip) and `"reportNone": false`.

## Output and exit codes

- `--format text` (default), `json`, `sarif` (SARIF 2.1.0 for GitHub code scanning) or `markdown` (for job summaries and PR comments). `--json`, `--sarif` and `--markdown` write extra report files in the same run.
- `--fail-on <severity>` sets the threshold (`critical`, `high`, `medium`, `low`, `info`, `none`; default `high`).
- Exit codes: **0** passed, **1** findings at or above `--fail-on`, **2** usage, config or read error.

## GitHub Action

```yaml
permissions:
  contents: read
  security-events: write   # only needed for the SARIF upload
jobs:
  schema-beacon:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4
        with: { persist-credentials: false }
      - run: npm ci && npm run build   # produce the static site first
      - uses: MrLouisWright/schema-beacon@v1
        with:
          path: dist
          fail-on: high
          sarif: schema-beacon.sarif
      - uses: github/codeql-action/upload-sarif@v3
        if: always()
        with: { sarif_file: schema-beacon.sarif }
```

| Input | Description | Default |
|---|---|---|
| `path` | Built site directory (e.g. dist, public, _site) | `.` |
| `base-url` | Public URL of the site, e.g. https://example.com | `` |
| `fail-on` | Failure threshold | `high` |
| `config` | Config file path | |
| `sarif` / `json` | Write SARIF / JSON report to this path | |
| `job-summary` | Add the Markdown report to the job summary | `true` |
| `args` | Extra CLI arguments | |

The action runs the bundled CLI with Node 20; it has no dependencies to install. Pin it to a commit SHA if your policy requires it.

## Library

```js
import { check, isIsoDate, suggestType } from 'schema-beacon';
const report = check('dist');
console.log(report.info.types); // { Product: 12, BreadcrumbList: 40, ... }
suggestType('Prodcut'); // 'Product'
```

Types are included.

## Requirements

Node.js 18 or newer. Zero runtime dependencies.

## Licence

MIT © Louis Wright. See [LICENSE](LICENSE).
