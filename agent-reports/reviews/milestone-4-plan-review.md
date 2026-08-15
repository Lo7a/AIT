# Review of the milestone 4 plan (Roadmap + Project Brief)

- **Report type:** Review
- **Status:** Open
- **Priority:** High — reviewed before implementation, so the cheapest moment to act
- **Branch:** `main`
- **Commit:** `7360f0a877c90528b684a3238cc7f8be97996f7a`
- **Document reviewed:** `docs/plans/2026-08-15-milestone-4-roadmap.md`
- **Implementation status at review time:** not started — all task checkboxes unchecked; HEAD is
  the documentation commit for task 0.5

## Assessment

The plan is strong. It is dependency-ordered with an explicit table, it names the files each
task creates and modifies, it specifies tests per task, and — most importantly — it holds the
deterministic/LLM boundary that the rest of the codebase holds.

Two design choices deserve particular credit:

- **The reasoning contract is stricter than the narrative's.** Task 5 requires that the
  per-item justification contain *no digits at all*, with a sanitizer that strips any digit and
  falls back to a deterministic template. That is a categorically easier property to enforce
  than the narrative's "every digit must appear in the data", and it is the right call. It is
  also, incidentally, a sharper version of the guard that
  [`../bugs/narrative-number-guard-too-permissive.md`](../bugs/narrative-number-guard-too-permissive.md)
  finds too loose.
- **"Facts for implementers — do not guess, this exists"** (the `עובדות תשתית` section) lists
  real rule keys, real types, and real line numbers. That section is why the plan is
  implementable by someone who did not write milestone 3.

The three points below are the review findings.

---

## 1. Task 7 creates an unauthenticated endpoint that sends email — Priority: High

Task 7 specifies `POST /api/brief/[itemId]`, which generates a brief and sends it to a fixed
address (`BRIEF_EMAIL`, defaulting to `lahavk@raion.co.il`).

No route in `src/` has authentication or rate limiting — verified by grep across the whole
source tree; the only cookie in the codebase is the theme preference. The plan does not add any,
and its exit gate (task 9) only asks for a *list* of deployment blockers.

Combined, that makes the brief endpoint an open relay pointed at the founder's inbox once
deployed. `itemId` is a UUID, which limits who can trigger a brief for a *specific* item, but
anyone can create their own diagnosis through the equally unauthenticated `/api/diagnose`,
receive the resulting roadmap item IDs, and then request briefs against them in a loop.

Every prior milestone could defer authentication because nothing reached outside the system.
This is the first task that emits something outbound, so the deferral stops working here. This
is a change in kind, not degree.

**Direction:** treat authentication and rate limiting as a milestone 4 task ordered before task 7,
rather than as a post-gate blocker. Proposal drafted in
[`../features/auth-rate-limiting-and-csrf.md`](../features/auth-rate-limiting-and-csrf.md).

At minimum, if the full control is judged too large: keep the dev-default transport
(log-only, `sentAt = null`) until authentication exists, and do not configure a real email
provider before then. The plan's injected `BriefTransport` interface already makes that a
configuration choice rather than a code change — a genuinely good piece of design that should be
used as the interim safeguard.

---

## 2. Tasks 1 and 5 name a function that does not exist — Priority: Low

The plan repeatedly refers to `computeScores(findings, model?)`:

> חתימת המנוע: `computeScores(findings, model?: BusinessModel | null)` — פרמטר שני אופציונלי

The actual export is:

```ts
// src/pipeline/score/engine.ts:37
export function scoreFindings(defs: DimensionDef[], f: ScanFindings): ScoreReport
```

Two differences, not one: the name, and the fact that the real signature takes the dimension
definitions as its **first** parameter. So the proposed change is not "add a second parameter"
— it is "add a third", or change the shape.

This matters because the plan's own preamble tells implementers not to guess, and because
`scoreFindings(DIMENSIONS, findings)` has exactly one production call site
(`src/server/run-diagnosis.ts:157`) plus the tests. An implementer following the plan literally
will not find `computeScores`.

**Direction:** correct the name and signature in the plan document before task 1 starts. Also
worth noting for the implementer: `RuleDef.gapText` currently receives only `ScanFindings`, so
task 1's requirement that process gap text quote `leadDrop` from the business model needs the
model threaded into the rule callbacks. The plan anticipates this and offers `processRules(model)`
as an option — that is the less invasive of the two it lists, since it avoids changing the
`RuleDef` shape that all five dimensions share.

---

## 3. Task 0's `websiteKeyOf` collision is real — confirmed, and the planned fix is right

The plan asserts an identity bug:

> **באג זהות אמיתי:** websiteKeyOf זורק path, אז שני עסקים עם עמודי פייסבוק שונים מקבלים אותו
> מפתח (facebook.com) והשני מתמזג לעסק הראשון.

Confirmed by reading the source:

```ts
// src/server/website-key.ts:6-8
export function websiteKeyOf(input: string): string {
  return normalizeSiteUrl(input).hostname.toLowerCase().replace(/^www\./, "");
}
```

Only the hostname survives. `websiteKey` is `@unique` on `Business`
(`prisma/schema.prisma:18`), and `createDiagnosisForBusiness` upserts on it
(`diagnosis-repo.ts:79-84`) — so two businesses whose Google "website" field holds different
Facebook pages do collapse onto one row, and the second inherits the first's name and diagnosis
history.

The proposed fix — include the first path segment for known social hosts, leave every other
domain's behaviour byte-identical so existing regression tests stay green as written — is the
right shape and correctly scoped.

One thing the task does not mention: **existing rows may already be merged.** If any two
businesses in the live database have collided, changing the key function will not separate
them retroactively. Worth a query against `businesses` for social-host `website_key` values
before the fix ships, and a decision about whether any repair is needed.

This is not filed as a separate bug report, since the team has already identified it and
scheduled the fix.

---

## Smaller notes

- **Task 0 and task 0.5 both change the URL entry path.** Task 0.5 makes a typed URL also
  trigger a Places search, which will route more traffic through `parseDiagnoseBody` — and
  therefore through the false-positive bug in
  [`../bugs/forbidden-host-rejects-fc-fd-domains.md`](../bugs/forbidden-host-rejects-fc-fd-domains.md).
  Worth fixing that first; it is a one-line change and task 0.5 will otherwise amplify it.
- **Task 1's score refresh writes to the existing `scan` row's `scores` column.** That means the
  stored scores no longer correspond to the findings captured at scan time. Defensible — the
  report should show current truth — but it makes `scans` a mutable row rather than an immutable
  event, which is worth an explicit decision since `Roadmap` is deliberately append-only for the
  opposite reason (task 4: "Roadmap חדש לכל חישוב, היסטוריה נשמרת").
- **Task 9's gate criteria are good** — particularly the diff of every number in the roadmap
  against the `opportunity_catalog` table. That is a real zero-invention check rather than an
  assertion of one.

## Open questions and assumptions

- **Unverified:** whether any colliding `website_key` rows exist in the live database. Requires
  a query I did not run.
- **Unverified:** whether Resend (named in task 7 as the intended provider) has been set up. The
  plan says it is a Lahav-only item and `.env.example` contains no mail configuration, so I
  assume it has not.
- **Assumption:** that `BRIEF_EMAIL` would be a real inbox rather than a test address at launch.
  If it is a throwaway, the open-relay severity drops — but the endpoint is still an
  unauthenticated write path.
- I reviewed the plan document, not any implementation, because none exists yet. These findings
  should be re-checked against the code as tasks land.
