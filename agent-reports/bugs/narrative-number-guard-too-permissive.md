# The narrative "no invented numbers" guard permits far more numbers than the documentation implies

- **Report type:** Bug
- **Status:** Open
- **Priority:** Medium
- **Branch:** `main`
- **Commit:** `7360f0a877c90528b684a3238cc7f8be97996f7a`
- **Evidence standard:** Reasoned from code — not executed

## Description

`generateNarrative` enforces that every digit run in the model's output appears in the allowed
set, retrying once and falling back to a deterministic template on violation. The mechanism is
sound. The **allowed set** is the problem: it is built by scraping digits out of the entire
findings object and then expanded further.

Two widenings compound:

```ts
// src/pipeline/report/narrative.ts:52-59
const source = [
  JSON.stringify(findingsWithoutMeta),   // every digit anywhere in findings
  displayedScores.join(" "),
  highlightTexts,
].join(" ");
for (const n of extractNumbers(source)) addNumberVariants(n, allowed);
```

```ts
// src/pipeline/report/narrative.ts:31-36
function addNumberVariants(n: string, allowed: Set<string>): void {
  allowed.add(n);
  allowed.add(n.replace(".", ","));
  allowed.add(n.replace(/,/g, ""));
  for (const part of n.split(/[.,]/)) allowed.add(part);   // "4.2" also allows "4" and "2"
}
```

`JSON.stringify(findings)` includes `crawledUrls`, so digits embedded in URL paths and port
numbers become permitted values. Splitting decimals means a rating of `4.2` independently
authorises `"4"` and `"2"`; an LCP of `3187` authorises `"3187"`; a `performanceScore` of `67`
authorises `"67"`, `"6"`, and `"7"` only insofar as they appear, but across a realistic findings
blob the small integers are almost all present somewhere.

## Location

- `src/pipeline/report/narrative.ts:43-70` — `allowedNumbers`
- `src/pipeline/report/narrative.ts:31-36` — `addNumberVariants`
- `src/pipeline/report/narrative.ts:82-85` — `violations`
- Documented claim: `docs/llm.md`, "נרטיב הדוח" row — *"שומר-מספרים: כל ספרה בפלט חייבת להופיע בנתונים"*

## Evidence

Source reading only. The code already carries two comments showing the author was tightening
this deliberately — `meta` is excluded as internal telemetry (line 49) and rule `points` are
excluded because they "would have authorised invented numbers" (line 42). Both exclusions are
correct and show the intent. The remaining breadth of `JSON.stringify(findings)` appears to be
an oversight of the same kind rather than a deliberate choice.

I did **not** run a scan and diff a real narrative against its allowed set, so I cannot state
how many spurious values a typical scan authorises.

## Impact

The spec makes this the load-bearing trust property:

> מספר מומצא אחד הורס את האמון — §5, `docs/specs/ait-mvp-spec.md`

and the MVP success criteria include "כל המספרים מהקטלוג/בנצ'מרקים, אפס מספרים מומצאים". A guard
that reads as absolute but admits most small integers means a fabricated "תוך 3 שעות" or
"פי 2 יותר פניות" can pass silently. Because the guard exists and is documented, reviewers are
less likely to check narratives manually — the weak guard is arguably worse than none for that
reason.

Severity is Medium rather than High because the model is separately instructed not to invent
numbers, the fallback path is safe, and nothing here fabricates numbers on its own — it only
fails to catch them.

## Reproduction

Not reproducible as a failure without a live model. Demonstrable statically:

1. Take a real `ScanFindings` from any `scans` row.
2. Call `allowedNumbers(findings, score)` and print the set.
3. Compare its size and contents against the handful of values actually displayed in the report.

## Expected vs current behavior

**Expected:** the narrative may cite only the values the report actually shows the user.

**Current:** it may cite any digit run appearing anywhere in the findings JSON, plus the
component parts of every decimal.

## Recommended direction

*Described only — no code changed by this report.*

1. Build the allowed set from an explicit list of displayed values — overall score, dimension
   scores, review count, rating, PSI scores, LCP in both milliseconds and the `sec()` display
   form — rather than from `JSON.stringify` of the whole findings object.
2. Drop the decimal-splitting in `addNumberVariants`, or keep it only for the specific
   thousands-separator case it was written for. Allowing `4` and `2` because `4.2` was displayed
   is not a formatting variant; it is two different numbers.
3. Keep the existing `meta` and `points` exclusions.
4. Expect the fallback rate to rise once the set narrows — the comment at lines 119-121 already
   warns that an under-broad allowlist causes silent template fallback. Adding a counter or log
   line for `usedFallback` would make that visible rather than silent.

## Acceptance criteria

- A test asserts that a number appearing only inside a `crawledUrls` path is rejected.
- A test asserts that `4` is rejected when the only source value was `4.2` and `4` appears
  nowhere else.
- The genuine display forms — including LCP rendered in seconds by `sec()`
  (`src/pipeline/score/dimensions.ts:11`) — remain accepted.
- `tests/narrative.test.ts` stays green, adjusted where it encodes the old breadth.

## Open questions and assumptions

- **Unverified:** the real-world rate at which the current guard lets an invented number
  through. Establishing it needs a batch of live narratives checked by hand.
- **Unverified:** how much the fallback rate would rise under a stricter set. If it rises a lot,
  the prompt may need to present values in exactly the form it wants them echoed.
- Whether the thousands-separator handling is still needed depends on whether any displayed
  value is formatted with separators; I did not find one, but did not audit exhaustively.
