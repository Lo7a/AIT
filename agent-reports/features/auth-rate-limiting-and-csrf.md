# Move authentication, rate limiting and CSRF into milestone 4, before the brief endpoint ships

- **Report type:** Feature
- **Status:** Open
- **Priority:** High
- **Branch:** `main`
- **Commit:** `7360f0a877c90528b684a3238cc7f8be97996f7a`

## Proposal

Add an access-control task to milestone 4, ordered **before** task 7 (Project Brief), rather
than leaving authentication on the post-gate blocker list where it currently sits.

## Why now rather than later

The deferral has been correct until now. Milestones 1–3 built a system that only ever wrote to
its own database and read from public APIs. The worst an anonymous caller could do was spend
money and create rows.

Task 7 changes the category: it adds an endpoint that **sends email to a fixed human inbox**.
That is the first outbound side effect that leaves the system, and it cannot be undone,
rate-limited after the fact, or cleaned up with a database delete.

With no authentication and no throttling, `POST /api/brief/[itemId]` is an open relay. The
UUID in the path is not a meaningful control, because `/api/diagnose` and the roadmap endpoints
are equally anonymous — a caller can create their own diagnosis, read back the roadmap item IDs,
and request briefs in a loop.

There is a second reason the timing matters. The gate documents already record that CSRF and
content-type enforcement must land in the *same* change as authentication, because adding auth
alone creates a cookie worth forging. That coupling means this cannot be a quick patch bolted on
at the end — it wants to be a designed task.

## Scope

Small enough to fit the milestone. The product is internal-use-only (spec §1), so this does not
need a user system.

1. **A single access gate.** For internal use, a shared secret in an HTTP-only cookie set by one
   unguarded login route is sufficient and honest. Full Supabase Auth is available (spec §9.2
   lists it as a reason for choosing Supabase) but is more than the MVP needs, and can replace
   the shared secret later without touching call sites.
2. **Applied at one choke point.** Next.js middleware over `/api/*` with an explicit allowlist
   for the login route, rather than a check repeated in each handler. The review found that this
   codebase's recurring weakness is correct controls applied at some call sites and not others —
   see the pattern note in
   [`../reviews/2026-08-15-full-codebase-review.md`](../reviews/2026-08-15-full-codebase-review.md).
   A per-handler check would repeat exactly that mistake.
3. **Rate limiting on the paid routes.** `/api/diagnose` and the interview message route are the
   two that cost money per call. Even a coarse per-session limit removes the amplification.
4. **CSRF and content-type enforcement in the same change**, per the existing gate note.

## What already exists and should be reused

- **The tagged-error pattern.** `InterviewError` with `kind: not_found | conflict | invalid`
  (`src/pipeline/interview/contract.ts`) is mapped to status codes in the handlers. An auth
  failure is a natural additional kind, and the milestone 4 plan already anticipates extending
  this union rather than inventing a parallel mechanism.
- **The factory-handler shape.** Every handler is built by a `make*Handler(deps)` factory with
  the route file supplying live dependencies (`makeSearchHandler`, `makeDiagnoseHandler`,
  `interview-handlers.ts`). A gate can be injected the same way and faked in tests.
- **`BriefTransport` from milestone 4 task 7.** The injected transport interface means the
  interim safeguard below costs nothing to adopt.

## Interim safeguard if the full task cannot fit

Keep task 7's development-default transport — write to the server log, store the brief with
`sentAt = null` — and **do not configure a real email provider until the access gate exists**.
The plan already builds the seam for this; using it as a deliberate hold is a one-line
configuration decision rather than a code change.

This is a genuinely acceptable outcome for the milestone. What is not acceptable is wiring
Resend into an unauthenticated endpoint because the blocker list said "later".

## Acceptance criteria

- Every `/api/*` route except the login route rejects an unauthenticated request.
- The rejection is a clean tagged error, with no internal detail leaked — matching the existing
  discipline in `search-handler.ts:26-30` and `diagnose-stream.ts:92-98`.
- `/api/diagnose` and `/api/interview/[id]/message` reject calls exceeding a configured rate.
- Cross-origin form-style POSTs are rejected.
- No real email provider is configured before the gate is in place.
- Existing handler tests continue to pass with an injected always-allow gate.

## Open questions and assumptions

- **Product decision, not a review finding:** whether the gate should be a shared secret or full
  Supabase Auth. I recommend the shared secret for the MVP and note that the founders are the
  only intended users, but this is the team's call.
- **Unverified:** whether the intended deployment is public at all in the milestone 4 timeframe.
  If it stays on localhost, only the email endpoint genuinely forces the issue.
- **Unverified:** what rate limit is appropriate. It depends on expected founder usage and on
  the Places free-tier allowance (1,000 calls/month per spec §9.6), which I did not model.
- I did not evaluate specific rate-limiting libraries or whether Vercel's platform features
  cover it. On serverless, in-memory counters do not survive across instances — a shared store
  is likely needed, and Supabase is already present.
