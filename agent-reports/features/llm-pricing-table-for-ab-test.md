# Make `llm_cost` measure something real, ahead of the model A/B test

- **Report type:** Feature
- **Status:** Open
- **Priority:** Medium
- **Branch:** `main`
- **Commit:** `7360f0a877c90528b684a3238cc7f8be97996f7a`

## Proposal

Replace the single zeroed pricing constant with a per-model pricing lookup keyed on the model
actually used, so `scans.llm_cost` records a real number and the model A/B test in spec §9.3 has
cost data to decide on.

## Current state

```ts
// src/server/diagnosis-repo.ts:12-18
export const LLM_PRICING: Readonly<LlmPricing> = { usdPerMInput: 0, usdPerMOutput: 0 };

export function llmCostUsd(usage: LlmUsage, pricing: LlmPricing = LLM_PRICING): number {
  return (usage.inputTokens * pricing.usdPerMInput + usage.outputTokens * pricing.usdPerMOutput) / 1_000_000;
}
```

This is correct today — development runs on the Gemini free tier, so zero is the true cost — and
the comment above it says exactly that, with a note to update the constants when a production
model is chosen. Nothing here is a mistake.

The pieces that make the upgrade cheap are already in place, and were clearly built with this in
mind:

- Token usage is measured properly, including thinking tokens:
  `outputTokens: candidatesTokenCount + thoughtsTokenCount` (`src/pipeline/llm/client.ts:72`).
  `docs/llm.md` records that this was deliberate — thinking tokens are billed, so they are
  counted.
- Usage is accumulated across both LLM calls in a scan and written in one place
  (`toScanRow`, `diagnosis-repo.ts:32-52`).
- `pricing` is already an injectable parameter, added so tests can pin it.
- The column exists: `Scan.llmCost` as `Decimal(10,4)` (`prisma/schema.prisma:51`).

So the work is genuinely small: a lookup table and a key.

## Why it is worth doing before the A/B test rather than during

Spec §9.3 defines a three-stage plan: develop free, run an A/B across candidate models, then
proceed with the winner chosen on **quality per shekel**. Spec §9.6 tabulates estimated
per-diagnosis costs across Haiku, Sonnet and Opus tiers, and §11 lists
"עלות אבחון מלא נמדדה וידועה" as an MVP success criterion.

All of that requires measured cost per diagnosis per model. If pricing is still a single zeroed
constant when the A/B runs, the comparison collapses to quality alone and the cost axis has to
be reconstructed by hand afterwards from token counts — which is possible, but throws away the
per-scan attribution that the schema was designed to hold.

The estimates in §9.6 also deserve re-checking against measurement. That section assumes
100–150K input tokens per diagnosis, while `docs/llm.md` reports the actual figure at
1,000–2,500 input tokens — roughly two orders of magnitude apart. The two documents are
measuring different things (a full funnel including the interview versus the two current call
sites), but the discrepancy is large enough that the production cost projection should be
rebuilt from real numbers rather than carried forward.

## Sketch of the shape

*Described, not implemented.*

- A pricing table keyed by model identifier, holding input and output rates per million tokens,
  with an explicit zero entry for the free-tier Gemini model so the current behaviour is
  preserved rather than special-cased.
- The model identifier resolved the same way `completeJSON` resolves it — `opts.model ??
  process.env.LLM_MODEL ?? "gemini-3.6-flash"` (`llm/client.ts:28`) — so cost attribution cannot
  drift from the model actually called. Returning the resolved model name alongside `usage` from
  `completeJSON` would make this exact rather than re-derived.
- An unknown model should be loud, not silently free. A zero cost for an unrecognised model is
  the failure mode that produces a confidently wrong A/B result.

## Benefit

- The §11 success criterion becomes satisfiable.
- The A/B test can rank on quality per shekel as the spec intends.
- Per-diagnosis cost stays attributable in the `scans` row, which is where the schema already
  expects it.

## Acceptance criteria

- `scans.llm_cost` is non-zero when a priced model is configured, and zero when the free-tier
  model is configured.
- Cost is attributed to the model that actually served the request.
- An unrecognised model produces a visible signal rather than silently costing zero.
- `Decimal(10,4)` precision is confirmed adequate for the expected magnitudes — sub-cent
  per-diagnosis costs are plausible on cheap models, and four decimal places of a dollar is a
  hundredth of a cent, so this is probably fine but should be checked rather than assumed.
- `tests/diagnosis-repo.test.ts` extended; existing tests stay green.

## Open questions and assumptions

- **Unverified:** current published rates for any of the candidate models. The figures in spec
  §9.6 should be re-checked against provider pricing at the time of implementation rather than
  copied from the spec, which was written on 2026-08-12.
- **Unverified:** whether prompt caching — mentioned in §9.6 as materially reducing input cost —
  is in use or planned. If it is, the cost model needs a cached-input rate as a third parameter,
  not just input and output.
- **Assumption:** that `api_cost` (the Places estimate at `scan.ts:33`) stays a separate column.
  Merging them would lose the ability to see which side of the bill dominates.
- I did not investigate whether Gemini's free tier has usage reporting that could be reconciled
  against these numbers.
