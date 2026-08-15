# Full codebase review — milestones 1–3 as shipped

- **Report type:** Review
- **Status:** Open
- **Priority:** High (as an index; individual findings carry their own priority)
- **Branch:** `main`
- **Commit:** `7360f0a877c90528b684a3238cc7f8be97996f7a`
- **Date:** 2026-08-15
- **Scope:** All of `src/`, `prisma/`, the specification, and the milestone gate documents.
  Excluded: `design/` HTML variants, and the UI hooks under `src/app/` beyond a skim.

## Verified baseline

Measured on this tree, not taken from the gate documents:

| Check | Result |
|---|---|
| `npm test` | **387 passed / 34 files**, exit 0 |
| `npx tsc --noEmit` | **Clean**, exit 0 |
| `npm run build` | **Not run** — `.env` holds live Supabase credentials; a build should be a deliberate act, not a side effect of review |

`docs/milestone-3-gate.md` records 379 tests; eight have been added since.

## Overall assessment

This is well-built software, and the review should say so plainly before listing defects.

The things that are usually wrong in a project at this stage are right here:

- **The pipeline is pure and the I/O is injected.** Every external dependency arrives through a
  `deps` object with a live default (`ScanDeps` in `scan.ts:12-29`, `AnalyzeDeps`,
  `NarrativeOptions`, `ExtractOptions`). No test makes a real network call, and the seams are
  designed rather than retrofitted.
- **The deterministic/LLM boundary is drawn in the right place and defended.** Scores come from
  rules (`score/dimensions.ts`); the model writes prose only. Both LLM outputs are rebuilt field
  by field from scratch, so hallucinated fields cannot survive `sanitizeThemes`
  (`analyze/reviews.ts:19`) or `sanitize` (`report/narrative.ts:89`).
- **Failure is modelled, not hoped away.** `Promise.allSettled` with per-source `partial` flags,
  a `known`/`earned` split so absent data is never scored as a negative, weight renormalisation
  across only the dimensions that have data (`score/engine.ts:41-45`). The "degradation
  אלגנטי" the spec demands for data-poor businesses is actually implemented.
- **Concurrency is taken seriously.** Compare-and-set status transitions
  (`diagnosis-repo.ts:104-110`), atomic multi-row writes, `upsert` on normalised keys to avoid
  duplicate businesses under parallel runs.
- **The gate documents are honest.** `docs/milestone-3-gate.md` records a real forbidden-character
  failure found at the gate and fixed the same day, and lists open items rather than declaring
  victory. That is rarer than good code.

Comments are unusually load-bearing — many encode a decision and the reason for it. That is a
genuine asset and worth preserving as the team grows.

## The four invariants a reviewer must hold this code to

Derived from the spec and `docs/llm.md`; every finding below is ultimately about one of them.

1. **The LLM never determines a number or a score.** Rules compute; the model narrates.
2. **Raw review text is never stored** — Google ToS plus Israeli Privacy Amendment 13. Only
   conclusions, no names, no quotes.
3. **Untrusted content is fenced, and LLM output is typography-normalised** before it reaches a
   user or the database.
4. **Everything persists immediately and atomically; resume must never lose an answer.**

## Findings index

| # | Finding | Priority | Verified | Report |
|---|---|---|---|---|
| 1 | Redirect bypasses the internal-host allowlist; crawler walks internal hosts | Critical | Executed | [`../bugs/ssrf-redirect-bypasses-host-allowlist.md`](../bugs/ssrf-redirect-bypasses-host-allowlist.md) |
| 2 | Domains starting `fc`/`fd` rejected as internal | High | Executed | [`../bugs/forbidden-host-rejects-fc-fd-domains.md`](../bugs/forbidden-host-rejects-fc-fd-domains.md) |
| 3 | `pagesCrawled` double-counts redirect targets, inflating `multi_page` | High | Executed | [`../bugs/pages-crawled-double-counts-redirects.md`](../bugs/pages-crawled-double-counts-redirects.md) |
| 4 | Review text not stripped of prompt delimiters | High | Code | [`../bugs/review-text-escapes-prompt-fence.md`](../bugs/review-text-escapes-prompt-fence.md) |
| 5 | Narrative number guard admits far more than documented | Medium | Code | [`../bugs/narrative-number-guard-too-permissive.md`](../bugs/narrative-number-guard-too-permissive.md) |
| 6 | Scan save and status transition are not atomic | Medium | Code | [`../bugs/scan-save-and-status-transition-not-atomic.md`](../bugs/scan-save-and-status-transition-not-atomic.md) |
| 7 | PageSpeed sends the API key in the query string | Medium | Code (claim unverified) | [`../bugs/pagespeed-api-key-in-query-string.md`](../bugs/pagespeed-api-key-in-query-string.md) |

Findings 1–3 were reproduced by executing the real modules. Findings 4–7 are reasoned from
source; each report states what remains unverified.

Deployment blockers are collected separately in
[`deployment-readiness.md`](deployment-readiness.md). The milestone 4 plan is reviewed in
[`milestone-4-plan-review.md`](milestone-4-plan-review.md).

## Pattern worth noting across findings 1–4

All four are the same shape: **a control exists and is correct at the point where it was
written, but is not applied at every point that needs it.**

- The host check is right, and lives only in the API layer while the fetch layer is what needs it.
- The delimiter strip is right, and is applied in `extract.ts` but not `reviews.ts`.
- The dedup is right, and keys on the pre-redirect URL while the count uses the post-redirect one.

This is not a code-quality problem; it is a placement problem, and it argues for pushing these
guarantees down to the single choke point each one has — see
[`../features/shared-prompt-fencing-utility.md`](../features/shared-prompt-fencing-utility.md)
for the prompt case.

## Minor observations — recorded, not filed separately

- **No defensive cap on reviews sent to the LLM.** `scan.ts:65` passes `details.reviews` whole.
  Places currently returns at most five, so this is fine today; a field-mask change would grow
  prompt cost silently. `MAX_THEMES`/`MAX_THEME_CHARS` cap the output but not the input.
- **`readErrorBody` puts up to 500 characters of provider response into thrown error messages**
  (`http.ts:7-9`, used at `llm/client.ts:48`, `places.ts:37,70`, `pagespeed.ts:32`). Those
  strings reach `partialDetails` (`scan.ts:36`, 200-char slice) and are persisted in
  `scans.findings`. The malformed-JSON path deliberately avoids echoing content
  (`client.ts:66`) — the HTTP-error path does not have the same discipline. Low risk, worth a
  look if provider errors ever quote request content.
- **`llm_cost` is always zero.** `LLM_PRICING` is `{0, 0}` (`diagnosis-repo.ts:14`), correct for
  the Gemini free tier but it means the cost KPI in spec §9.6 currently measures nothing. See
  [`../features/llm-pricing-table-for-ab-test.md`](../features/llm-pricing-table-for-ab-test.md).
- **`use-interview-chat.ts` has no direct tests** — already recorded by the team as a conscious
  decision in `docs/milestone-3-gate.md`. Noted here only so it is not mistaken for an oversight.
- **`reactStrictMode: false`** (`next.config.ts:8`) with a documented reason (a double-fired
  effect costs a paid Places call). Reasonable; worth revisiting once the module-level guard in
  the scan screen is proven, since StrictMode catches real bugs.

## Documentation gaps

- **No `README.md`.** A newcomer has no entry point; the specification is excellent but is not
  an onboarding document, and it is 320 lines of Hebrew prose.
- **No `CLAUDE.md`.** The four invariants above are exactly the sort of thing that is expensive
  to rediscover. Recording them would pay for itself. *(Note: the review agent is not permitted
  to create that file; this is a recommendation for a maintainer.)*

## Open questions and assumptions

- **Not executed:** `npm run build`. The claim of 12 clean routes comes from the gate document.
- **Not inspected:** the live Supabase database. Several findings would be settled quickly by a
  query — whether any stranded `scanned` rows exist, whether any stored `pagesCrawled` is
  inflated — but that is beyond a read-only code review with live credentials.
- **Not reviewed in depth:** `src/app/` UI components and hooks, and the `design/` variants.
  The logic-in-hook mandate appears to be followed, but I did not audit it.
- **Assumption:** that `main` at `7360f0a` is what would deploy. Nothing in the repo contradicts
  this, and the tree is clean and level with `origin/main`.
