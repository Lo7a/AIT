# A crash between saving the scan and transitioning to `report_ready` strands the diagnosis

- **Report type:** Bug
- **Status:** Open
- **Priority:** Medium
- **Branch:** `main`
- **Commit reviewed:** `7360f0a877c90528b684a3238cc7f8be97996f7a`
- **Re-verified at:** `06d81ed` (2026-08-15) — **still applies, line numbers corrected.**
  `server/run-diagnosis.ts` grew by 37 lines in milestone 4 task 0 (social-presence handling), so
  the offending block moved from lines 169-172 to **186-189**. The code itself is byte-identical:
  still two sequential awaits inside one `step`. `server/diagnosis-repo.ts` is unchanged, so its
  references remain accurate.
- **Evidence standard:** Reasoned from code — not executed

## Description

`saveScanResult` is carefully atomic: the `scan` row and the `business_models` row are written
in a single `prisma.$transaction` so they cannot diverge. The status transition that publishes
the result is then performed as a **separate** round trip:

```ts
// src/server/run-diagnosis.ts:186-189
await step(emit, "save", "שומרים את האבחון", async () => {
  await saveScanResult(prisma, created.diagnosisId, toScanRow(findings, score, narrative), model);
  await transitionDiagnosis(prisma, created.diagnosisId, "report_ready");
}, () => "האבחון נשמר", "השמירה נכשלה");
```

If the process dies, the connection drops, or the serverless instance is frozen between those
two awaits, the scan and model are durably stored while the diagnosis remains at `scanned`.

## Location

- `src/server/run-diagnosis.ts:186-189` — the two sequential awaits
- `src/server/diagnosis-repo.ts:113-145` — `saveScanResult`, correctly transactional
- `src/server/diagnosis-repo.ts:94-111` — `transitionDiagnosis`, a read-then-conditional-update
- `src/server/status.ts:7-14` — the transition table

## Evidence

Source reading. Two supporting observations:

- The state machine permits `scanned → report_ready` and nothing else from `scanned`
  (`status.ts:10`), so a stranded row is not permanently dead — but nothing in the codebase
  retries it, and no path re-enters `scanned`.
- The comment at `diagnose-stream.ts:75-77` records that on Vercel serverless "יש סיכון שהאינסטנס
  יוקפא לאחר סיום התגובה" — instance freezing after the response completes. That is precisely a
  mechanism for stopping between the two awaits, and it is already a known concern in this repo.

I did not construct a failure injection to observe the stranded state.

## Impact

- The diagnosis does not appear as ready. `getReport` and the recent-diagnoses list key off
  status, so the user sees an incomplete run despite the work being paid for and stored.
- The Places call and the LLM calls have already been spent. Re-running produces a **second**
  `scan` row against the same diagnosis and spends the money again.
- `scanned` is not a state any UI path resumes from, so recovery is manual.

Likelihood is low — the window is one round trip — but it widens under exactly the conditions
that already worry the team: serverless freezing, and the 300-second `maxDuration` ceiling on
`/api/diagnose`.

Milestone 4 sets a stricter bar for the same shape of operation. Its plan requires the roadmap
write and its status transition to share "טרנזקציה אטומית" (task 5). Applying that standard here
is consistency, not new scope.

## Reproduction

Not reproducible by ordinary use. Demonstrable with a fake:

1. In a `fake-db` harness, make `diagnosis.updateMany` throw on the transition to
   `report_ready`.
2. Run `runDiagnosis`.
3. Observe a persisted `scan` row and a `business_models` row while the diagnosis status is
   still `scanned`.

`tests/fakes/fake-db.ts` and `tests/run-diagnosis.test.ts` already support this style.

## Expected vs current behavior

**Expected:** the scan result and the state change that publishes it commit together or not at
all.

**Current:** they are two independent commits with an interruptible gap.

## Recommended direction

*Described only — no code changed by this report.*

Move the transition inside the existing `$transaction` in `saveScanResult`, expressed as a
conditional update so the compare-and-set property is preserved — an `updateMany` filtered on
`{ id, status: "scanned" }` inside the transaction, with a zero-count result rolling the whole
thing back.

That keeps the current concurrency guarantee (`transitionDiagnosis` already relies on
`updateMany` returning 0 to detect a lost race, `diagnosis-repo.ts:104-110`) while removing the
gap. The pre-read and `assertTransition` validation can stay outside for the clear error
message, since the in-transaction filter is what actually enforces it.

A secondary option, if the transactional change is judged too invasive: leave the code as is and
add a recovery path that finds `scanned` diagnoses with a saved scan and completes them. That
addresses the symptom rather than the cause and costs more code.

## Acceptance criteria

- Failure injected at the transition leaves no `scan` row and no `business_models` row.
- A successful run still ends at `report_ready` with exactly one `scan` row.
- The concurrent-transition guard still rejects a second racing transition.
- `tests/run-diagnosis.test.ts` and `tests/diagnosis-repo.test.ts` stay green.

## Open questions and assumptions

- **Unverified:** whether any stranded `scanned` rows exist in the live Supabase database. A
  single query would settle it; I did not run one, as that is outside a read-only code review
  and the credentials are live.
- **Assumption:** that no code path outside `runDiagnosis` transitions a diagnosis to
  `report_ready`. I found none, but did not exhaustively trace every caller.
- Whether the backfill at `run-diagnosis.ts:176-185` should also be folded in is a separate
  question — it is explicitly cosmetic and already tolerates failure, so probably not.
