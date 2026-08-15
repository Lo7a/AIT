# `pagesCrawled` counts redirect targets more than once, inflating the `multi_page` score

- **Report type:** Bug
- **Status:** Open
- **Priority:** High
- **Branch:** `main`
- **Commit:** `7360f0a877c90528b684a3238cc7f8be97996f7a`
- **Evidence standard:** Verified by execution

## Description

The crawler deduplicates against the URL it is **about to request**, but records the URL it
**ended up at** after redirects. Those are different keys, so when several queued paths all
redirect to the same destination, each one is counted as a separately crawled page.

```
crawl.ts:108   if (visited.has(url)) continue;        // queue URL
crawl.ts:118   crawledUrls.push(page.finalUrl || url); // post-redirect URL
```

`visited.add(page.finalUrl)` on line 117 does record the final URL, but nothing on the next
iteration compares the *queue* URL against it, so the guard never fires for this case.

## Location

| What | Where |
|---|---|
| Dedup on queue URL | `src/pipeline/crawler/crawl.ts:108` |
| Push of final URL | `src/pipeline/crawler/crawl.ts:118` |
| Count returned | `src/pipeline/crawler/crawl.ts:125` (`pagesCrawled: crawledUrls.length`) |
| Consumer | `src/pipeline/score/dimensions.ts:183-187` (`multi_page` rule) |

## Evidence

Observed while running the real `crawlWebsite` against a fake `fetchImpl` whose responses all
carry the same final URL:

```
crawledUrls returned : [ 'http://127.0.0.1:6379/',
                         'http://127.0.0.1:6379/',
                         'http://127.0.0.1:6379/' ]
```

Three entries, one distinct page. `pagesCrawled` is `crawledUrls.length`, so it reports 3.

The reproduction was a by-product of testing a different finding, so the fake returned a
loopback URL — the duplication behaviour is independent of which host is involved.

## Impact

The `multi_page` rule awards 15 points when `pagesCrawled >= 4`:

```ts
// src/pipeline/score/dimensions.ts:183-187
key: "multi_page", points: 15,
known: crawlUsable, earned: (f) => (f.websiteSignals?.pagesCrawled ?? 0) >= 4,
gapText: () => "בסריקה נמצאו עמודים בודדים בלבד, אתר רזה מקשה על לקוחות למצוא מידע",
```

A single-page site whose navigation links (`/about`, `/contact`, `/services`) all 301 to the
homepage crawls as 4 pages and earns the rule. In the infrastructure dimension (weight 0.15)
those 15 points are a meaningful share.

Consequences beyond the number:

- The report tells a business its site is fine on this axis when the opposite is true, which is
  precisely the "generic, not specific" failure mode the spec's success criteria warn against.
- `crawledUrls` is persisted into `scans.findings`, so already-completed diagnoses in the roster
  of 10 live businesses (`docs/success-test-roster.md`) may carry inflated counts.
- Milestone 4 matches catalog opportunities on scoring-rule gaps, so a wrongly-earned rule
  suppresses a genuine opportunity from ever reaching the roadmap.

Redirect-consolidated navigation is common on small business sites built on page builders,
which is exactly this product's target segment.

## Reproduction

1. Point a scan at a site where two or more internal links 301 to the homepage.
2. Inspect `findings.websiteSignals.crawledUrls` in the resulting `scans` row.
3. Observe repeated identical entries and a `pagesCrawled` higher than the number of distinct
   pages.

## Expected vs current behavior

**Expected:** `pagesCrawled` is the number of distinct pages actually retrieved.

**Current:** it is the number of successful fetch attempts, which over-counts whenever
different paths resolve to the same destination.

## Recommended direction

*Described only — no code changed by this report.*

After a successful fetch, check whether `page.finalUrl` is already in `visited` before pushing;
if it is, skip the push and continue. The attempt still counts against `attempts`, so the loop
bound is unaffected. Alternatively derive `pagesCrawled` from a `Set` of final URLs rather than
from `crawledUrls.length`.

Worth deciding at the same time whether `crawledUrls` should stay a per-attempt log (useful for
debugging) with the count taken separately from the distinct set — the two consumers want
different things.

## Acceptance criteria

- A test in `tests/crawl.test.ts` where three queued links resolve to one final URL asserts
  `pagesCrawled === 1` (plus the homepage as applicable) and that `crawledUrls` holds no
  duplicates.
- A test asserts the `multi_page` rule is not earned for such a site.
- Existing crawler and dimension tests stay green.

## Open questions and assumptions

- **Not verified against a real site.** The duplication was demonstrated with an injected
  `fetchImpl`; I did not run a live scan against a real redirect-heavy domain.
- **Not verified against stored data.** I did not query Supabase to check whether any of the 10
  roster businesses actually carries an inflated `pagesCrawled`. That check is worth doing
  before deciding whether historical scans need recomputing.
- Whether `crawledUrls` is intended as a distinct-page list or an attempt log is not stated
  anywhere I found; I assumed distinct pages because `pagesCrawled` is derived from its length
  and used as a page count.
