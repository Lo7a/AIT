# An HTTP redirect bypasses the internal-host allowlist and turns the crawler loose on internal hosts

- **Report type:** Bug
- **Status:** Open
- **Priority:** Critical
- **Branch:** `main`
- **Commit reviewed:** `7360f0a877c90528b684a3238cc7f8be97996f7a`
- **Re-verified at:** `06d81ed` (2026-08-15) — **still reproduces.** `crawler/crawl.ts` is
  unchanged since the review and `fetchPage` still sets no `redirect:` option, so the default
  `follow` applies. All line references below remain accurate.
- **Evidence standard:** Verified by execution

## Description

`isForbiddenHost` blocks loopback, private, and link-local hosts, but it only ever inspects the
hostname **the user submitted**. The crawler's `fetch` call uses the default
`redirect: "follow"`, so a publicly-resolvable host that returns a 302 to an internal address
is followed without any further check.

The consequence is worse than a single blind request. `crawlWebsite` deliberately adopts the
post-redirect URL as its base, and `extractSignals` computes same-origin internal links from
that base — so after one redirect the crawler **parses the internal response and walks its
links**, up to `maxPages`.

The existing code comment acknowledges that the check is name-based and needs DNS-resolution
hardening before public deploy. The redirect path is a separate hole and is not mentioned there.

## Location

| What | Where |
|---|---|
| Host allowlist | `src/server/api/diagnose-stream.ts:14-23` (`isForbiddenHost`) |
| Only call site | `src/server/api/diagnose-stream.ts:37` (inside `parseDiagnoseBody`) |
| Unguarded fetch | `src/pipeline/crawler/crawl.ts:58-61` (`fetchPage`) |
| Adopts final URL | `src/pipeline/crawler/crawl.ts:90` (`const homeUrl = homePage.finalUrl`) |
| Same-origin off final URL | `src/pipeline/crawler/signals.ts:27-46` (`extractSignals`) |

## Evidence

Driving the real `crawlWebsite` with a `fetchImpl` that models what `redirect: "follow"` does —
the caller asks for `attacker.example`, the network hands back a response whose `url` is a
loopback address:

```
caller submitted:  https://attacker.example   (passes isForbiddenHost)

URLs actually fetched:
[ 'https://attacker.example',
  'http://127.0.0.1:6379/admin',
  'http://127.0.0.1:6379/keys' ]

crawledUrls returned:
[ 'http://127.0.0.1:6379/', 'http://127.0.0.1:6379/', 'http://127.0.0.1:6379/' ]
```

The two follow-up requests are the crawler walking links it parsed out of the internal
response. This was produced against the unmodified module at commit `7360f0a`.

## Impact

- The `POST /api/diagnose` URL path becomes an internal link-crawler reachable by anyone, since
  no route in `src/` has authentication (see `reviews/deployment-readiness.md`).
- Results are observable to the caller: `crawledUrls` and the signal booleans are returned in
  the report, and `partialDetails.crawl_failed` carries up to 200 characters of the error text
  (`src/pipeline/scan.ts:36`), which can include internal hostnames and ports.
- Timing differences between "connection refused" and "hung until timeout" give a port-scan
  oracle even where no body is parsed.
- On Vercel this reaches anything the function can route to; locally it reaches the developer's
  whole loopback surface.

## Reproduction

1. Start any HTTP service on loopback, e.g. something on `127.0.0.1:6379`.
2. Stand up a public endpoint that answers with `302 Location: http://127.0.0.1:6379/`.
3. `POST /api/diagnose` with `{"url": "https://<that-public-host>"}`.
4. Observe the loopback service receive the request, and observe the returned `crawledUrls`.

The executed evidence above substitutes a fake `fetchImpl` for steps 1–2 while running the real
`crawlWebsite`.

## Expected vs current behavior

**Expected:** every hostname the crawler actually contacts is checked, not just the one the user
typed. A redirect into a forbidden host aborts that fetch.

**Current:** only the submitted hostname is checked. Every subsequent hop, and every link
discovered on the post-redirect origin, is fetched unchecked.

## Recommended direction

*Described only — no code changed by this report.*

1. Set `redirect: "manual"` in `fetchPage` and handle 3xx explicitly, re-running the host check
   on each `Location` before following it, with a small hop cap.
2. Move the host check out of the API layer and down to the fetch layer, so it also covers the
   Places-sourced `details.website` path (`src/pipeline/scan.ts:59-64`), which never passes
   through `parseDiagnoseBody` at all.
3. Consider resolving the hostname and checking the resulting IP, which closes the DNS-based
   bypass the existing comment already flags. Note this does not by itself close DNS rebinding.
4. Keep the existing name-based check as a cheap first gate.

## Acceptance criteria

- A test drives `crawlWebsite` with a `fetchImpl` returning a 302 to `http://127.0.0.1/` and
  asserts the crawler refuses the hop.
- A test asserts that a Places-sourced `details.website` pointing at a forbidden host is
  likewise refused.
- No request is issued to a forbidden host at any redirect depth.
- Existing crawler tests in `tests/crawl.test.ts` stay green.

## Open questions and assumptions

- I have not tested this against the deployed Vercel environment; the executed proof is local
  and uses an injected `fetchImpl`. Whether a real deployment can reach anything sensitive
  depends on Vercel's egress rules, which I did not investigate.
- I did not determine whether Vercel exposes a metadata endpoint analogous to EC2's
  `169.254.169.254`. The finding does not depend on it.
- Hop limit and whether to allow *any* redirects are product decisions, not review findings.
