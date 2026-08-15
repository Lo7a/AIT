# A single shared helper for fencing untrusted text into prompts

- **Report type:** Feature
- **Status:** Open
- **Priority:** Medium
- **Branch:** `main`
- **Commit:** `7360f0a877c90528b684a3238cc7f8be97996f7a`

## Proposal

Introduce one exported helper that wraps untrusted text into a delimited block, and route every
prompt builder through it instead of hand-assembling the fence at each call site.

## Why

The codebase has a clear, correct convention for untrusted content in prompts:

1. Strip the delimiter sequence from the text so it cannot close its own block.
2. Wrap it in `<<<NAME>>> … <<<END>>>`.
3. Instruct the model to treat everything inside as data.

Step 2 and step 3 are done everywhere. **Step 1 is done in one place out of two.**

```ts
// src/pipeline/interview/extract.ts:123  — does strip
const safe = answer.replace(/<<<|>>>/g, "");
```

```ts
// src/pipeline/analyze/reviews.ts:52-54  — does not strip
const reviewLines = withText
  .map((r, i) => `${i + 1}. ${r.rating >= 1 ? `[${r.rating}/5] ` : ""}${r.text}`)
  .join("\n");
```

The comment above the stripping call even describes the other module as already doing it —
*"אותו משטר כמו analyze/reviews"* — which shows the convention was understood as universal and
simply missed at one site. That is filed as
[`../bugs/review-text-escapes-prompt-fence.md`](../bugs/review-text-escapes-prompt-fence.md).

Fixing that one line closes today's hole. It does not stop the next prompt from repeating it,
and milestone 4 adds at least one more prompt builder (`roadmap/reasoning.ts`, task 5). The plan
for that task remembers `normalizeTypography` explicitly but says nothing about delimiter
stripping — so the gap is about to widen.

This is the same pattern the full review identified across four separate findings: **a correct
control that is not applied at every point that needs it.** A shared utility converts
"remember to do this" into "you cannot fail to do this".

## Sketch of the shape

*Described, not implemented — this report changes no code.*

A single function taking a block name and the untrusted text, returning the fenced block with
the delimiters already stripped from the content. Prompt builders interpolate its result rather
than composing the fence themselves. Callers stop being able to forget.

Worth deciding at the same time:

- **Where it lives.** `src/pipeline/llm/` is the natural home, next to the client that every
  prompt eventually reaches.
- **Whether it also applies `normalizeTypography`.** Probably not — that function is currently
  applied to LLM *output*, and `extract.ts:33-35` is explicit that owner words stay verbatim.
  Conflating input fencing with output normalisation would blur a distinction the code makes
  deliberately.
- **Whether it should assert rather than silently strip.** Silent stripping matches current
  behaviour and is the safer default; a logged counter would make injection attempts visible.

## Call sites to route through it

| File | Untrusted input |
|---|---|
| `src/pipeline/analyze/reviews.ts:52-66` | Google review text — currently unstripped |
| `src/pipeline/interview/extract.ts:110-144` | Owner's free-text answer — currently stripped inline |
| `src/pipeline/report/narrative.ts:135-142` | Business name and gap texts derived from review themes |
| `src/pipeline/roadmap/reasoning.ts` (milestone 4, task 5) | Catalog text, evidence texts, pain quotes |

The narrative case deserves thought rather than mechanical application: it interpolates
`JSON.stringify` output, which escapes quotes but not angle brackets, and its inputs are
second-hand (theme text that originated in user-controlled reviews). That is the chained path
described in the bug report.

## Benefit

- Removes a whole class of omission rather than one instance of it.
- Gives milestone 4's new prompt builder the guarantee by default.
- Makes the convention greppable and testable in one place — a single test that the helper never
  emits a nested delimiter covers every call site at once.

## Acceptance criteria

- One exported helper exists and is the only place the delimiter literals appear.
- All four call sites above use it; no prompt builder constructs `<<<` by hand.
- A unit test asserts that text containing `<<<END>>>` produces a block with exactly one closing
  delimiter.
- Behaviour is unchanged for benign input — existing tests in `tests/reviews.test.ts` and
  `tests/interview-extract.test.ts` stay green.

## Open questions and assumptions

- **Unverified:** whether the fencing convention actually deters `gemini-3.6-flash`. This
  proposal assumes the existing approach is sound and only argues for applying it consistently;
  it does not evaluate the approach itself.
- **Assumption:** that the business name in the narrative prompt is worth fencing. It comes from
  Google Places, so it is less obviously attacker-controlled than review text. The team may
  reasonably decide it is trusted.
- Whether to log stripped delimiters as a possible injection signal is a product decision about
  observability, not a review finding.
