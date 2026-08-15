# Handoff to the development agent

Read this before acting on anything in `agent-reports/`.

These reports were produced by a **review-only** agent that was forbidden from modifying source.
You are presumably not under that restriction. Everything here is a description of a problem and
a suggested direction — none of it has been applied.

## Source revision

| Field | Value |
|---|---|
| Repository | `Lo7a/AIT` (private) |
| Reviewed commit | `7360f0a877c90528b684a3238cc7f8be97996f7a` |
| Branch reviewed | `main` |
| Reviewed on | 2026-08-15 |
| Working tree at review time | Clean, level with `origin/main` |

### Step 1 — verify before you trust anything here

The commit carrying these reports was made directly on top of the reviewed commit, so the
anchor is structural, not just documented:

```
git rev-parse HEAD^        # must print 7360f0a877c90528b684a3238cc7f8be97996f7a
git rev-parse HEAD
git status --short
```

- **`HEAD^` is `7360f0a`** → every line number, quoted snippet, and finding is current.
- **You are on a later commit** → line numbers may have drifted and some findings may already be
  fixed. Re-locate each finding by its **quoted code**, not by line number, and confirm it still
  exists before changing anything. `git log --oneline 7360f0a..HEAD` shows what moved.

Line numbers here are a convenience. The quoted source snippets are the real identifier.

## Baseline measured at `7360f0a`

| Check | Result |
|---|---|
| `npm test` | 387 passed / 34 files, exit 0 |
| `npx tsc --noEmit` | Clean, exit 0 |
| `npm run build` | **Not run** — see environment notes |

Reproduce this baseline before your first edit. If it does not reproduce on your machine, stop
and find out why; do not start fixing on top of an unexplained failure.

## Read in this order

1. `README.md` — what this directory is and the report format.
2. `reviews/2026-08-15-full-codebase-review.md` — the index. Start here; it links everything else
   and explains the pattern connecting the top four findings.
3. `reviews/deployment-readiness.md` — what blocks a public deploy.
4. `reviews/milestone-4-plan-review.md` — read **before** starting milestone 4 work. It flags a
   risk the plan introduces and a function name the plan gets wrong.
5. `bugs/` and `features/` — individual items, each self-contained.

## Evidence standard — this matters most

Every report states how its finding was established. Treat the two classes differently.

**Verified by execution** — the real module was run and the output is quoted in the report.
These you can rely on:

- `bugs/ssrf-redirect-bypasses-host-allowlist.md`
- `bugs/forbidden-host-rejects-fc-fd-domains.md`
- `bugs/pages-crawled-double-counts-redirects.md`

**Reasoned from code** — derived by reading source, not executed. Plausible; confirm before you
act:

- `bugs/review-text-escapes-prompt-fence.md`
- `bugs/narrative-number-guard-too-permissive.md`
- `bugs/scan-save-and-status-transition-not-atomic.md`
- `bugs/pagespeed-api-key-in-query-string.md` — **its central claim is an untested hypothesis.**
  The report argues PageSpeed accepts an `X-Goog-Api-Key` header; the in-code comment asserts
  query-string is the only option and may well be right. Test it with one request before
  changing anything. If the comment is correct, the fix is to the documentation, not the code.

Every report has an **Open questions and assumptions** section. Read it. It records what the
review could not confirm, and several items there are settled by a single query against the live
database — which the review agent deliberately did not run.

## Suggested order of work

Ordered by cost-to-fix against value, not purely by severity.

| # | Report | Why here |
|---|---|---|
| 1 | `bugs/forbidden-host-rejects-fc-fd-domains.md` | One condition. Verified. Milestone 4 task 0.5 will amplify it, so fix before that lands |
| 2 | `bugs/review-text-escapes-prompt-fence.md` | One line, mirrors an existing correct call site |
| 3 | `bugs/pages-crawled-double-counts-redirects.md` | Few lines. Verified. Corrupts real scores today |
| 4 | `bugs/ssrf-redirect-bypasses-host-allowlist.md` | Critical, but a design change — needs care, not speed |
| 5 | `bugs/pagespeed-api-key-in-query-string.md` | Answer the header question first; the answer decides the fix |
| 6 | `bugs/narrative-number-guard-too-permissive.md` | Expect the template-fallback rate to rise; instrument it |
| 7 | `bugs/scan-save-and-status-transition-not-atomic.md` | Touches a transaction boundary; do it deliberately |
| 8 | `features/auth-rate-limiting-and-csrf.md` | Must precede milestone 4 task 7 |

Items 1–3 are independent and safe to do in one sitting. Item 4 changes crawler behaviour and
deserves its own review round.

## Report hygiene

If you act on a report, edit its header rather than deleting the file:

- `Status: Open` → `In progress` → `Fixed in <commit>`, or `Won't fix — <reason>`.
- Add a note if what you found differed from what the report claimed. A report that turned out to
  be wrong is useful information; deleting it destroys that.
- If you disprove a finding, say so in the file — especially the PageSpeed one.

## Environment notes

- **No `.env` is included and none should be.** The reviewed machine's `.env` held live Google,
  Gemini, and Supabase credentials. Get your own from the project owner. Do not copy the file
  between machines and do not paste its contents into a chat session.
- **`node_modules/` is not included.** Run `npm install`; `postinstall` runs `prisma generate`.
- **`npm run build` was never run** during review — it may reach the live database. Run it
  deliberately, knowing which database your credentials point at.
- **Nothing here requires database access to act on.** Several open questions would be *answered*
  by a query, but every recommended fix is a code change verifiable by unit test.

## What the review did not cover

Do not read silence here as approval:

- `src/app/` UI components and hooks beyond a skim, and the `design/` HTML variants.
- The live Supabase database — no query was run against it.
- The Vercel project configuration — region, plan tier, environment variables.
- Any milestone 4 implementation, because none exists at `7360f0a`.
- Legal compliance of the data actually stored, as opposed to whether the code implements the
  stated no-raw-review-text rule.

## Provenance

Produced by an agent restricted to creating Markdown under `agent-reports/`. At the end of that
session `git diff --name-only` was empty and `git status --short` showed only `?? agent-reports/`
— no tracked file was modified. The commit carrying these files was made afterwards, on explicit
instruction, and touches nothing outside this directory.
