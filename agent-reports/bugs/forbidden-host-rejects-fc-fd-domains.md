# Legitimate domains beginning "fc" or "fd" are rejected as internal addresses

- **Report type:** Bug
- **Status:** Open
- **Priority:** High
- **Branch:** `main`
- **Commit:** `7360f0a877c90528b684a3238cc7f8be97996f7a`
- **Evidence standard:** Verified by execution

## Description

`isForbiddenHost` tries to catch IPv6 unique-local addresses (the `fc00::/7` block) with two
prefix tests:

```ts
// src/server/api/diagnose-stream.ts:21
if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) return true;
```

`h` at this point is any hostname, not only an IPv6 literal. `startsWith("fc")` and
`startsWith("fd")` therefore match ordinary domain names. Unlike the neighbouring `fe80:` test,
these two carry no colon, so nothing constrains them to IPv6 syntax.

## Location

- `src/server/api/diagnose-stream.ts:14-23` — `isForbiddenHost`, specifically line 21
- Reached from `src/server/api/diagnose-stream.ts:37` in `parseDiagnoseBody`
- Surfaces to the user through `src/app/api/diagnose/route.ts`

## Evidence

Executed against the real `parseDiagnoseBody` at commit `7360f0a`:

```
BLOCKED  fcbarcelona.com   -> כתובת פנימית או מקומית אינה נתמכת
BLOCKED  fdgroup.co.il     -> כתובת פנימית או מקומית אינה נתמכת
BLOCKED  fcbank.co.il      -> כתובת פנימית או מקומית אינה נתמכת
allowed  gentleman.co.il   (control)
allowed  example.com       (control)

--- genuine IPv6 literals, all correctly blocked ---
BLOCKED  [fd00::1]
BLOCKED  [fc00::1]
BLOCKED  [::1]
```

The controls confirm the rejection is caused by the leading two characters and nothing else.
The IPv6 literals confirm that a narrower check would lose no real coverage.

## Impact

Any business whose domain starts with `fc` or `fd` cannot be diagnosed through the URL entry
path. The user sees "כתובת פנימית או מקומית אינה נתמכת" — an address-is-internal message —
which is misleading and gives no route forward.

Two things make this more than cosmetic:

- Milestone 4 task 0.5 makes URL entry more prominent, since a typed URL will also trigger a
  Maps search. More traffic will flow through this validator.
- The failure looks like a security control working correctly, so it is unlikely to be reported
  as a bug by a founder testing the funnel — it will look like the product refusing a valid site.

Two letters out of 676 two-letter prefixes is a small share of domains, but the failure is total
for those that match, and silent from the operator's side.

## Reproduction

1. `POST /api/diagnose` with `{"url": "https://fcbarcelona.com"}`.
2. Observe HTTP 400 with `{"error": "כתובת פנימית או מקומית אינה נתמכת"}`.
3. Repeat with `{"url": "https://gentleman.co.il"}` — accepted, confirming the prefix is the cause.

## Expected vs current behavior

**Expected:** the IPv6 unique-local test applies only to IPv6 literals. Ordinary hostnames are
unaffected by it.

**Current:** any hostname whose first two characters are `fc` or `fd` is treated as an internal
IPv6 address.

## Recommended direction

*Described only — no code changed by this report.*

Gate the IPv6 branch on the hostname actually being an IPv6 literal. `URL.hostname` keeps the
brackets for IPv6, and the function already strips them at line 17 — so either test for brackets
before stripping, or test the stripped value for a colon, and only then apply the `fe80:`,
`fc`, `fd` and `::1` checks.

Worth pairing with a stricter unique-local test while in there: the block is `fc00::/7`, so
matching on the full first hextet is more precise than a two-character prefix.

## Acceptance criteria

- `fcbarcelona.com`, `fdgroup.co.il`, and `fcbank.co.il` are accepted by `parseDiagnoseBody`.
- `[fd00::1]`, `[fc00::1]`, `[fe80::1]`, and `[::1]` remain blocked.
- A regression test in `tests/diagnose-stream.test.ts` covers both directions — the existing 18
  tests in that file stay green.

## Open questions and assumptions

- I did not survey how common `fc`/`fd` domains are among Israeli small businesses, so the
  real-world hit rate is unquantified. The correctness of the finding does not depend on it.
- Whether to also tighten the check to the exact `fc00::/7` range is a judgement call for the
  maintainer; the reported bug is only the false positive on ordinary hostnames.
