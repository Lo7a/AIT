# Deployment readiness — consolidated blockers

- **Report type:** Review
- **Status:** Open
- **Priority:** Critical (as a gate; individual items vary)
- **Branch:** `main`
- **Commit:** `7360f0a877c90528b684a3238cc7f8be97996f7a`

## Purpose

The team already tracks deployment blockers inside the gate documents
(`docs/milestone-2b-gate.md`, `docs/milestone-3-gate.md`), and milestone 4 task 9 asks for a
consolidated list. This is that list, plus what the code review added.

The product is currently internal-use-only by design (`docs/specs/ait-mvp-spec.md` §1), and
none of this blocks internal use. It all blocks a public URL.

## 1. No authentication, rate limiting, or CSRF protection — Critical

**Verified** by grep across `src/`: no auth, session, token, or rate-limit code exists. The only
cookie is `ait-theme`.

Every route is anonymous:

| Route | Effect of an anonymous call |
|---|---|
| `POST /api/search` | One Google Places search |
| `POST /api/diagnose` | Full paid diagnosis: Places details + crawl + PSI + 2+ LLM calls |
| `POST /api/interview/[id]/*` | LLM call per message |

What makes `/api/diagnose` the sharp edge:

- It **spends money per request** — `EST_COST_USD` is $0.03 per Places call
  (`src/pipeline/scan.ts:33`) plus LLM tokens.
- It is **long-running** — `maxDuration = 300` (`src/app/api/diagnose/route.ts:7`) holds a
  function open for up to five minutes.
- It **writes to the database** on every call, creating `businesses`, `diagnoses`, `scans`, and
  `business_models` rows.
- It **makes outbound requests to a caller-supplied URL** — see the SSRF finding below.

An unauthenticated, unthrottled, paid, long-running, database-writing endpoint that fetches
attacker-chosen URLs is the worst combination of properties on this list, and they compound
rather than add.

The gate documents note that CSRF and content-type enforcement must ship in the *same change*
as authentication. That is correct and worth preserving as a constraint.

**Newly relevant:** milestone 4 task 7 adds an endpoint that sends email. See
[`milestone-4-plan-review.md`](milestone-4-plan-review.md) §1 and
[`../features/auth-rate-limiting-and-csrf.md`](../features/auth-rate-limiting-and-csrf.md).

## 2. SSRF via redirect — Critical

Fully documented in
[`../bugs/ssrf-redirect-bypasses-host-allowlist.md`](../bugs/ssrf-redirect-bypasses-host-allowlist.md).
Verified by execution. Listed here because it is a deployment gate, not merely a bug: the
allowlist that is supposed to make the URL path safe does not survive a 302.

The existing code comment already flags that DNS-based hardening is needed pre-deploy. The
redirect bypass is additional and, unlike the DNS case, needs no special setup to exploit.

## 3. Serverless execution model is unresolved — High

`src/server/api/diagnose-stream.ts:75-77` records the concern in the code:

> ב-Vercel serverless יש סיכון שהאינסטנס יוקפא לאחר סיום התגובה; יש לחווט את after() של Next 15
> לפני deploy ציבורי (חסם-deploy, לא כאן)

The design intends a scan to continue to `report_ready` even if the client disconnects — that is
the "everything is saved" principle from spec §3.1. On a long-lived Node server that works and
was tested. On Vercel it may not.

Related and unresolved:

- **`maxDuration = 300` exceeds Vercel Hobby's 60-second ceiling.** On Hobby the function is
  killed at 60s regardless of the declared value. The spec targets a 90-second scan (§4, screen
  2), so a Hobby deployment would cut off legitimate scans. This needs either a Pro plan or a
  redesign toward background execution.
- **Instance freezing also widens the window** in
  [`../bugs/scan-save-and-status-transition-not-atomic.md`](../bugs/scan-save-and-status-transition-not-atomic.md).

## 4. Region pinning is not declared in code — Medium

Spec §9.2 states a binding rule:

> **כלל מחייב:** פונקציות השרת של Vercel חייבות לרוץ ב-fra1 (מגדירים בפרויקט) — אחרת כל שאילתה
> באמת תחצה יבשות.

No `preferredRegion` export exists anywhere in `src/` (verified by grep; the only route-segment
config found is `dynamic = "force-dynamic"` on three pages and `maxDuration` on one route).

The spec says "מגדירים בפרויקט" — configured in the project — so this may be set in Vercel's
dashboard, which I cannot see. **Unverified.** If it is dashboard-only, it is invisible to code
review and silently lost on any project re-creation; declaring it in code as well would make it
durable.

The whole latency argument in §9.2 rests on server and database being co-located, so this is
load-bearing for the architecture, not a detail.

## 5. Secrets handling — Medium (environment, not repo)

`.gitignore` correctly lists `.env`, and `git status --ignored` confirms `.env` is ignored. No
secret is committed. The repository itself is clean on this point.

The environment is a different matter. During this session a `.env` file (1,279 bytes)
materialised in the working directory roughly 35 seconds after a fresh clone into an empty
folder — almost certainly OneDrive syncing it from another machine. Per `.env.example` it
contains:

- `GOOGLE_API_KEY` — billable Places access
- `GEMINI_API_KEY`
- `DATABASE_URL` / `DIRECT_URL` / `SUPABASE_PASS` — database credentials including the password

Those are live credentials sitting inside a consumer cloud-sync directory, replicated to every
machine on the account and to Microsoft's servers. The file contents were not opened during this
review.

**Direction:** decide deliberately whether the working copy belongs inside OneDrive. If it does,
consider whether these keys should be restricted (Google API key referrer/API restrictions,
a read-limited database role for local work) so that sync exposure is not equivalent to full
production access.

## 6. Cost measurement is not yet real — Medium

`LLM_PRICING` is `{ usdPerMInput: 0, usdPerMOutput: 0 }` (`src/server/diagnosis-repo.ts:14`),
correct for the Gemini free tier, so `scans.llm_cost` is always `0`. Spec §9.6 makes cost per
diagnosis a KPI and §11 lists "עלות אבחון מלא נמדדה וידועה" as an MVP success criterion. Neither
is currently satisfiable.

Not a blocker for deploying, but it is a blocker for the A/B model selection in §9.3 that is
supposed to precede production. See
[`../features/llm-pricing-table-for-ab-test.md`](../features/llm-pricing-table-for-ab-test.md).

## Summary table

| # | Item | Priority | Verified |
|---|---|---|---|
| 1 | No auth / rate limiting / CSRF | Critical | Yes — grep |
| 2 | SSRF via redirect | Critical | Yes — executed |
| 3 | Serverless continuation + `maxDuration` vs plan ceiling | High | Partly — code comment; deployment not inspected |
| 4 | `preferredRegion` not in code | Medium | Absence verified; dashboard config unknown |
| 5 | Live credentials in a cloud-synced folder | Medium | Yes — observed |
| 6 | `llm_cost` always zero | Medium | Yes — code |

## Open questions and assumptions

- **Unverified:** the entire Vercel project configuration — region, plan tier, environment
  variables, whether a deployment exists at all. Items 3 and 4 would be settled by looking at it.
- **Unverified:** whether the Google API key carries restrictions, which materially changes
  item 5's severity.
- **Assumption:** that a public launch is intended eventually. The spec is explicit that the MVP
  is internal-only (§1), so none of this is overdue — the list is for the transition.
- I did not assess GDPR/Amendment 13 compliance of the data actually stored, only that the code
  implements the stated no-raw-review-text rule. A compliance review is a separate exercise.
