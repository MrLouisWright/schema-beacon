# Changelog

## 1.0.0 (2026-10-14)

First release, by Louis Wright.

- JSON-LD (including `@graph`, nested nodes and `@id` references) and microdata (`itemscope`/`itemtype`/`itemprop`) from every page in a build directory.
- Google rich-result requirements for Article, Product, Offer, AggregateRating, Review, BreadcrumbList, FAQPage, QAPage, HowTo, Recipe, Event, JobPosting, LocalBusiness (and subtypes), Organization, VideoObject, SoftwareApplication, Course, Dataset, ProfilePage, DiscussionForumPosting, ImageObject and more: required properties (high) and recommended properties (low).
- Value checks: ISO 8601 dates and durations, URLs, numeric prices, ISO 4217 currencies, schema.org enumerations (availability, itemCondition, eventStatus, eventAttendanceMode), rating ranges, breadcrumb positions, author format, unresolved `@id` references.
- Unknown schema.org types with did-you-mean suggestions; missing `@context`; deprecated rich results (HowTo, FAQ, sitelinks search box) as info.
- Text/JSON/SARIF/Markdown output, `--fail-on`, exit codes 0/1/2, allowlist with expiry, severity overrides.
- Composite GitHub Action with job summary.
