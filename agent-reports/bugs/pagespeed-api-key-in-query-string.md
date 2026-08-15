# The PageSpeed call sends the Google API key in the query string, contradicting the project's own rule

- **Report type:** Bug
- **Status:** Open
- **Priority:** Medium
- **Branch:** `main`
- **Commit:** `7360f0a877c90528b684a3238cc7f8be97996f7a`
- **Evidence standard:** Reasoned from code — the central technical claim is **unverified**, see Open questions

## Description

`docs/llm.md` records a security decision, attributed to a security review during milestone 1:

| הגדרה | ערך | למה |
|---|---|---|
| מפתח API | Header `x-goog-api-key` | לעולם לא ב-URL — מפתח ב-URL מודלף בלוגים (נתפס בסקירת אבטחה, משימה 2 של אבן דרך 1) |

The LLM client follows it (`llm/client.ts:36`). The Places client follows it
(`places.ts:29`, `places.ts:66`). The PageSpeed client does not:

```ts
// src/pipeline/google/pagespeed.ts:23-29
const params = new URLSearchParams({ url, strategy: "mobile" });
params.append("category", "PERFORMANCE");
params.append("category", "SEO");
// ב-API הזה המפתח עובר ב-query — זו הדרך היחידה ש-PSI תומך בה; בלי מפתח יש מכסה נמוכה
if (apiKey) params.set("key", apiKey);
```

The comment asserts query is the only mechanism PSI supports. If that is wrong, this is an
avoidable deviation from a rule the team set deliberately.

## Location

- `src/pipeline/google/pagespeed.ts:23-31` — `attemptPageSpeed`
- Compare: `src/pipeline/llm/client.ts:36` and `src/pipeline/google/places.ts:29,66`
- Stated rule: `docs/llm.md`, "הגדרות הקריאה" table

## Evidence

Source comparison, quoted above — three Google API clients in one codebase, two using a header
and one using a query parameter, with a documented rule saying the header is required.

The exposure is the same key in both cases: `GOOGLE_API_KEY` serves Places and PageSpeed
(`pagespeed.ts:20`, `places.ts:15`).

Mitigating detail found while reading: the error path does **not** echo the URL —
`` throw new Error(`PageSpeed HTTP ${res.status}: ${await readErrorBody(res)}`) `` at line 32
includes only status and response body. So the key does not leak through this project's own
error messages. The exposure is to whatever else observes outbound request URLs: platform
request logs, proxies, APM traces, and the `console.warn` path is likewise clean.

## Impact

A credential in a URL is recorded by more systems than a credential in a header, and those
records tend to be retained and widely readable. Because the same key also authorises Places —
which is the metered, billable call at roughly $0.03 each — a leak is a spend risk, not just an
access risk.

This is Medium rather than High because no leak is demonstrated, the deployment's log
configuration is unknown, and the key is restrictable on Google's side.

## Reproduction

Not a runtime failure. Observable by inspecting any outbound PageSpeed request:

1. Run a scan against a business with a website.
2. Capture the outbound request URL from `defaultFetch`.
3. Observe `key=<GOOGLE_API_KEY>` in the query string.

## Expected vs current behavior

**Expected:** all three Google clients authenticate by header, per the documented rule.

**Current:** PageSpeed authenticates by query parameter.

## Recommended direction

*Described only — no code changed by this report.*

1. **First, settle the factual question** — try `X-Goog-Api-Key` against the PageSpeed
   Insights endpoint with a real key. This is a one-request experiment and it decides
   everything below.
2. If the header works: move the key to a header, drop `key` from the params, and delete the
   comment claiming query is the only option.
3. If the header genuinely does not work: leave the code alone and instead **correct the
   comment and `docs/llm.md`** so the rule is recorded as having a documented exception. Right
   now a reader of `docs/llm.md` would believe the codebase never puts a key in a URL, and that
   is not true.
4. Independently of the above, consider splitting Places and PageSpeed onto separate restricted
   keys so the blast radius of either differs.

Either outcome is a fix; the current state — code and documentation disagreeing — is the defect.

## Acceptance criteria

- The header-support question is answered and the answer is recorded in `docs/llm.md`.
- Either the key moves to a header, or the documented rule is amended to state the exception
  and why.
- No behavioural regression: `tests/pagespeed.test.ts` stays green, including the retry-on-
  timeout path.

## Open questions and assumptions

- **This is the unverified core of the report.** I believe PageSpeed Insights accepts
  `X-Goog-Api-Key` because it is a standard Google API convention, but **I did not test it** and
  I have no source confirming it for this specific endpoint. The in-code comment asserts the
  opposite and may well be correct — the author may have tried it. Treat my belief as a
  hypothesis to check, not a finding.
- **Unverified:** whether the deployment actually logs outbound request URLs anywhere. Without
  that, the practical exposure is unknown.
- **Unverified:** whether the current `GOOGLE_API_KEY` carries API or referrer restrictions on
  the Google side, which would change the severity substantially.
